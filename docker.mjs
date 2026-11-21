// A client for Docker through the `docker` command: containers, images, volumes, networks,
// compose projects, logs, exec, system df. It reads and acts (restart, stop, start, compose up and
// down, prune, exec): whatever the docker CLI can do for the user.
//
// Two kinds of refusal, neither about acting. Answers go to a cloud model, so commands that print
// secrets are refused (container environment: `inspect` without a --format that avoids it,
// `compose config`, `exec ... env`/`printenv`). And commands that never end are refused or fixed:
// `logs -f`, `stats` without --no-stream, `events` without --until, `compose up` without -d.
import { execFile } from "node:child_process";

const deny = (why) => {
  throw new Error(`not allowed: ${why}`);
};

const ENV_FORMAT = /\bEnv\b|\.Config\s*\}\}|\{\{\s*(json\s+)?\.\s*\}\}|\{\{\s*(json\s+)?\.Config\s*\}\}|\.Config\.(Cmd|Entrypoint)\b/;
const ENV_COMMAND = /(^|[\s;&|\/'"=(`])(env|printenv|set|export|declare)(\s|$|[;&|)'"`])|\/proc\/[^\s]*\/environ|\.env\b|\/environ/;

function checkExec(rest) {
  // rest: [flags..., container, cmd...]. Flags that take a value are skipped to find the container.
  const takesValue = new Set(["-e", "--env", "--env-file", "-u", "--user", "-w", "--workdir", "--index", "--detach-keys"]);
  let i = 0;
  for (; i < rest.length; i++) {
    if (takesValue.has(rest[i])) i++;
    else if (!rest[i].startsWith("-")) break;
  }
  const cmd = rest.slice(i + 1);
  if (cmd.length && (ENV_COMMAND.test(cmd.join(" ")) || /^(env|printenv)$/.test(cmd[0].split("/").pop()))) deny("exec of env/printenv/set or reading /proc/*/environ prints the container's secrets");
}

function check(args) {
  const a = args.map(String);
  const compose = a[0] === "compose";
  const sub = compose ? a.slice(1).find((x) => !x.startsWith("-") && !/^[\w./-]+\.ya?ml$/.test(x)) : a[0];
  // For compose, global options (-f file, -p name) come before the subcommand.
  const at = a.indexOf(sub);
  const rest = a.slice(at + 1);

  if (sub === "inspect") {
    const fi = rest.findIndex((x) => x === "-f" || x === "--format" || x.startsWith("--format=") || x.startsWith("-f="));
    if (fi < 0) deny("docker inspect without --format prints the container's environment; pass a --format that avoids .Config.Env, or use docker.inspect(name)");
    const fmt = rest[fi].includes("=") ? rest[fi].split("=").slice(1).join("=") : rest[fi + 1] ?? "";
    if (ENV_FORMAT.test(fmt)) deny("that --format prints .Config / the environment");
  }
  if (compose && sub === "config") deny("docker compose config prints the resolved environment; read the compose file's services with docker.compose helpers or `docker compose ps`");
  if (sub === "exec") checkExec(rest);
  if (sub === "run" && rest.some((x) => /^(env|printenv)$/.test(x))) deny("run of env/printenv prints secrets");
  if (sub === "logs") {
    if (rest.some((x) => x === "-f" || x === "--follow" || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(x))) deny("logs -f never ends; use --tail/--since");
    if (!rest.some((x) => x.startsWith("--tail") || x === "-n" || x.startsWith("--since") || x.startsWith("--until"))) a.splice(at + 1, 0, "--tail", "200");
  }
  if (sub === "stats" && !rest.includes("--no-stream")) a.splice(at + 1, 0, "--no-stream");
  if (sub === "events" && !rest.some((x) => x.startsWith("--until"))) deny("docker events never ends without --until (e.g. --since 1h --until 0s)");
  if (compose && sub === "up" && !rest.some((x) => x === "-d" || x === "--detach" || x === "--wait")) a.splice(at + 1, 0, "-d");
  if (compose && sub === "watch") deny("compose watch never ends");
  if (sub === "attach") deny("attach never ends");
  return a;
}

function exec(args, { cwd, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    execFile("docker", args, { cwd, timeout: timeoutMs, maxBuffer: 64 << 20, encoding: "utf8", env: { ...process.env, NO_COLOR: "1", DOCKER_CLI_HINTS: "false", BUILDKIT_PROGRESS: "plain" } }, (err, stdout, stderr) => {
      if (err?.code === "ENOENT") resolve({ code: 127, out: "", err: "docker is not installed: https://docs.docker.com/get-docker/" });
      else resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: stdout ?? "", err: stderr ?? "", ...(err?.killed ? { timedOut: true } : {}) });
    });
  });
}

// The selected fields of `docker inspect`, never the environment.
const INSPECT_FORMAT =
  '{"name":{{json .Name}},"image":{{json .Config.Image}},"state":{{json .State}},"restartCount":{{.RestartCount}},"restartPolicy":{{json .HostConfig.RestartPolicy}},"memoryLimit":{{.HostConfig.Memory}},"labels":{{json .Config.Labels}},"mounts":{{json .Mounts}},"ports":{{json .NetworkSettings.Ports}},"networks":{{json .NetworkSettings.Networks}}}';

export function make({ push }) {
  return makeDocker({ cwd: process.cwd(), push });
}

export function makeDocker({ cwd, push }) {
  const note = (detail, started, r) => push({ kind: "docker", detail: detail.slice(0, 200), ms: Date.now() - started, code: r.code, size: r.out.length });

  const run = async (...args) => {
    const a = check(args);
    const started = Date.now();
    const r = await exec(a, { cwd });
    note(`docker ${a.join(" ")}`, started, r);
    return r;
  };

  const parse = (out) => {
    const t = out.trim();
    if (!t) return [];
    try {
      const v = JSON.parse(t);
      return Array.isArray(v) ? v : [v];
    } catch {
      return t.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    }
  };

  // Run a command that prints JSON (or JSON lines) and parse it; throw docker's own error when it failed.
  const json = async (...args) => {
    const r = await run(...args);
    if (r.code !== 0) throw new Error(`docker ${args.slice(0, 4).join(" ")}: ${(r.err || r.out).trim().slice(0, 500)}`);
    return parse(r.out);
  };

  const labelsOf = (s) => Object.fromEntries(String(s ?? "").split(",").filter(Boolean).map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)]; }));

  return {
    /** Any docker subcommand (no shell). Acts as well as reads. Never throws on a non-zero exit, except for refusals. */
    run,

    /** A command that prints JSON or JSON lines, parsed into an array: json("ps", "-a", "--format", "json"). Throws on failure. */
    json,

    /**
     * Containers as rows (docker ps --format json): {name, id, image, state, status, health, ports, project, service, created, runningFor, mounts}.
     * o.all (default true) includes stopped ones; o.filter is a docker --filter value such as "status=exited".
     */
    async ps(o = {}) {
      const a = ["ps", "--no-trunc", "--format", "json"];
      if (o.all !== false) a.push("-a");
      if (o.filter) a.push("--filter", o.filter);
      const rows = await json(...a);
      return rows.map((r) => {
        const l = labelsOf(r.Labels);
        return { name: r.Names, id: r.ID.slice(0, 12), image: r.Image, state: r.State, status: r.Status, health: r.HealthStatus && r.HealthStatus !== "none" ? r.HealthStatus : null, ports: r.Ports, project: l["com.docker.compose.project"] ?? null, service: l["com.docker.compose.service"] ?? null, created: r.CreatedAt, runningFor: r.RunningFor, mounts: r.Mounts };
      });
    },

    /** One container's state, restart count, restart policy, memory limit, labels, mounts and ports. Never includes the environment. Throws if it does not exist. */
    async inspect(name) {
      const r = await run("inspect", "--format", INSPECT_FORMAT, String(name));
      if (r.code !== 0) throw new Error(`docker inspect ${name}: ${(r.err || r.out).trim().slice(0, 300)}`);
      const v = JSON.parse(r.out.trim());
      v.name = String(v.name).replace(/^\//, "");
      v.networks = Object.keys(v.networks ?? {});
      return v;
    },

    /**
     * A container's log lines (stdout and stderr merged, with timestamps). With o.since/o.until the whole window is read
     * (no tail cap); otherwise the last o.tail (default 200). o.grep (a regex string, any case) keeps matching lines only.
     * At most o.max (default 500) lines are returned, the latest ones; `count` is how many matched before that cut.
     */
    async logs(name, o = {}) {
      const a = ["logs", "--timestamps"];
      if (o.since || o.until) a.push(...(o.since ? ["--since", String(o.since)] : []), ...(o.until ? ["--until", String(o.until)] : []));
      else a.push("--tail", String(o.tail ?? 200));
      const r = await run(...a, String(name));
      if (r.code !== 0) throw new Error(`docker logs ${name}: ${(r.err || r.out).trim().slice(0, 300)}`);
      let lines = (r.out + "\n" + r.err).split("\n").map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trimEnd()).filter(Boolean);
      if (o.grep) {
        const re = new RegExp(o.grep, "i");
        lines = lines.filter((l) => re.test(l));
      }
      return { count: lines.length, lines: lines.slice(-(o.max ?? 500)) };
    },

    /** `docker system df -v` as {summary:[{Type, TotalCount, Active, Size, Reclaimable}], Images, Containers, Volumes, BuildCache} (docker's own field names, sizes as text like "1.3GB"). Throws on failure. */
    async df() {
      const [summary, full] = [await json("system", "df", "--format", "json"), await json("system", "df", "-v", "--format", "json")];
      return { summary, ...full[0] };
    },

    /** Run a command in a container: exec("my-db", "psql", "-U", "postgres", "-c", "select 1"). Refused when it would print the environment. */
    exec: (container, ...cmd) => run("exec", String(container), ...cmd),
  };
}
