export const meta = {
  purpose:
    "Why one container is down, unhealthy or restarting: its state, exit code (with the usual meaning), OOMKilled, restart count and policy, the health check's last output, and the error lines and last lines of its logs.",
  params: {
    name: "container name or id, or a substring of the name",
    lines: "error lines kept, default 20",
    since: "only log lines since this, e.g. '1h' or a timestamp, optional",
  },
  returns:
    "{container, image, state, exitCode, exitMeaning, oomKilled, restartCount, restartPolicy, startedAt, finishedAt, error, health:{status, failingStreak, lastOutput}, errors:[line], tail:[line], verdict}",
  example: 'await scripts.run("why-failing", { name: "my-db" })',
};

const ERR = /\b(error|errors|failed|failure|fatal|panic|panicked|exception|traceback|cannot|could not|can't|not found|denied|refused|timed? ?out|oom|out of memory|killed|terminating|segfault|exit(ed)? (with )?(code )?[1-9])\b/i;
const EXIT = { 0: "exited cleanly", 1: "application error", 2: "misuse or usage error", 126: "command not executable", 127: "command not found", 137: "killed (SIGKILL: OOM killer, docker kill, or stop timeout)", 139: "segmentation fault", 143: "stopped by SIGTERM (docker stop or a shutdown), usually on purpose", 255: "exit status out of range, often the host or daemon restarted" };

export default async function ({ docker }, { name, lines = 20, since }) {
  if (!name) throw new Error("why-failing needs `name`");
  const all = await docker.ps();
  const hit = all.find((r) => r.name === name || r.id === name) ?? all.filter((r) => r.name.includes(name))[0];
  if (!hit) return { container: null, verdict: `no container matches "${name}"; have: ${all.map((r) => r.name).join(", ")}` };
  const i = await docker.inspect(hit.name);
  const s = i.state ?? {};
  let log = { lines: [] };
  try {
    log = await docker.logs(hit.name, { tail: 400, ...(since ? { since } : {}) });
  } catch (e) {
    log = { lines: [`(logs not available: ${e.message.slice(0, 150)})`] };
  }
  const errors = [...new Set(log.lines.filter((l) => ERR.test(l)).map((l) => l.slice(0, 300)))].slice(-lines);
  const h = s.Health;
  const verdict = s.OOMKilled
    ? "killed by the OOM killer (memory limit or host memory)"
    : s.Restarting
      ? `restart loop: ${i.restartCount} restarts, last exit ${s.ExitCode}`
      : s.Running && h?.Status === "unhealthy"
        ? `running but unhealthy: ${h.Log?.at(-1)?.Output?.trim().slice(0, 200) ?? "health check failing"}`
        : s.Running
          ? `running${h ? `, health ${h.Status}` : ""}${i.restartCount ? `, restarted ${i.restartCount} times` : ""}`
          : `${s.Status} with exit code ${s.ExitCode} (${EXIT[s.ExitCode] ?? "see the logs"})`;
  return {
    container: hit.name,
    image: i.image,
    state: s.Status,
    exitCode: s.Running ? null : s.ExitCode,
    exitMeaning: s.Running ? null : EXIT[s.ExitCode] ?? null,
    lastExitCode: s.ExitCode,
    oomKilled: !!s.OOMKilled,
    restartCount: i.restartCount,
    restartPolicy: i.restartPolicy?.Name || null,
    startedAt: s.StartedAt,
    finishedAt: s.FinishedAt,
    error: s.Error || null,
    health: h ? { status: h.Status, failingStreak: h.FailingStreak, lastOutput: h.Log?.at(-1)?.Output?.trim().slice(0, 300) ?? null } : null,
    errors,
    tail: log.lines.slice(-15).map((l) => l.slice(0, 300)),
    verdict,
  };
}
