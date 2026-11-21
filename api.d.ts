interface DockerResult { code: number; out: string; err: string; timedOut?: boolean }
interface Container { name: string; id: string; image: string; state: string; status: string; health: string | null; ports: string; project: string | null; service: string | null; created: string; runningFor: string; mounts: string }

declare const docker: {
  // Any docker subcommand, no shell: pass each argument separately. Acts as well as reads:
  // docker.run("restart", "name"), docker.run("stop", "name"), docker.run("compose", "-p", "proj", "up", "-d"),
  // docker.run("system", "prune", "-f"), docker.run("exec", "pg", "psql", "-U", "u", "-d", "db", "-c", "select 1").
  // Never throws on a non-zero exit. Refused, because answers go to a cloud model:
  //  - `inspect` without a --format (or one that prints .Config / .Config.Env), `compose config`,
  //    `exec <c> env|printenv|set`, reading /proc/*/environ: they print secrets. Use docker.inspect().
  //  - what never ends: `logs -f`, `events` without --until, `attach`, `compose watch`.
  // Adjusted for you: `logs` gets --tail 200 unless you give --tail or --since/--until (a time window is read whole), `stats` gets --no-stream, `compose up` gets -d.
  run(...args: string[]): Promise<DockerResult>;

  // A command that prints JSON or JSON lines, parsed into an array: json("ps", "-a", "--format", "json"),
  // json("compose", "ls", "--all", "--format", "json"), json("volume", "ls", "--format", "json"),
  // json("images", "--format", "json"), json("network", "ls", "--format", "json"). Throws with docker's error.
  json(...args: string[]): Promise<any[]>;

  // Containers as rows. all (default true) includes stopped; filter is a docker --filter, e.g. "status=exited", "health=unhealthy", "label=com.docker.compose.project=x".
  // state is running|exited|restarting|paused|created|dead; health is healthy|unhealthy|starting|null; ports is docker's text ("0.0.0.0:5440->5432/tcp").
  ps(o?: { all?: boolean; filter?: string }): Promise<Container[]>;

  // One container (name or id): {name, image, state:{Status, Running, Restarting, OOMKilled, Dead, ExitCode, Error, StartedAt, FinishedAt, Health?:{Status, FailingStreak, Log:[{Output, ExitCode}]}},
  // restartCount, restartPolicy:{Name, MaximumRetryCount}, memoryLimit (bytes, 0 = none), labels, mounts, ports, networks:[names]}. No environment. Throws if it does not exist.
  inspect(name: string): Promise<any>;

  // A container's log lines, stdout and stderr merged, with timestamps. With since/until ("72h", "2026-01-08T21:00") the whole window is read;
  // otherwise the last `tail` (default 200). grep: regex (any case) keeps matching lines only, so a window search is one call:
  // logs("pg", {since: "72h", grep: "error|fatal"}). Returns the latest `max` (default 500) lines; `count` is the matches before that cut.
  logs(name: string, o?: { tail?: number; since?: string; until?: string; grep?: string; max?: number }): Promise<{ count: number; lines: string[] }>;

  // docker system df: {summary:[{Type, TotalCount, Active, Size, Reclaimable}], Images:[{Repository, Tag, ID, Size, SharedSize, UniqueSize, Containers}],
  // Volumes:[{Name, Size, Links}], BuildCache:[{ID, Size, InUse, LastUsedSince}], Containers:[...]}. Sizes are text such as "1.3GB".
  df(): Promise<any>;

  // Run a command in a container: exec("my-db", "psql", "-U", "postgres", "-d", "app", "-c", "\\dt"). {code, out, err}.
  exec(container: string, ...cmd: string[]): Promise<DockerResult>;
};
