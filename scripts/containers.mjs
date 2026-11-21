export const meta = {
  purpose:
    "What containers there are: state, health, restart count, published ports, image and compose project, with the unhealthy, restarting and recently stopped ones flagged. Restart counts come from inspect.",
  params: {
    all: "include stopped containers, default true",
    name: "only containers whose name, image or compose project contains this text, optional",
  },
  returns:
    "{running, stopped, unhealthy:[name], restarting:[name], rows:[{name, image, state, status, health, restartCount, ports, project, service, exitCode?, finishedAt?}]}",
  example: 'await scripts.run("containers", { name: "pg" })',
};

export default async function ({ docker }, { all = true, name }) {
  let rows = await docker.ps({ all });
  if (name) rows = rows.filter((r) => [r.name, r.image, r.project].some((x) => x?.toLowerCase().includes(String(name).toLowerCase())));
  const out = [];
  for (const r of rows) {
    let i = null;
    try {
      i = await docker.inspect(r.name);
    } catch {}
    out.push({
      name: r.name,
      image: r.image,
      state: r.state,
      status: r.status,
      health: r.state === "running" ? (r.health ?? i?.state?.Health?.Status ?? null) : null,
      restartCount: i?.restartCount ?? null,
      restartPolicy: i?.restartPolicy?.Name || null,
      ports: r.ports || null,
      project: r.project,
      service: r.service,
      ...(r.state !== "running" ? { exitCode: i?.state?.ExitCode, oomKilled: i?.state?.OOMKilled, finishedAt: i?.state?.FinishedAt?.slice(0, 19) } : {}),
    });
  }
  return {
    running: out.filter((r) => r.state === "running").length,
    stopped: out.filter((r) => r.state !== "running").length,
    unhealthy: out.filter((r) => r.health === "unhealthy").map((r) => r.name),
    restarting: out.filter((r) => r.state === "restarting" || (r.restartCount > 0 && r.state === "running")).map((r) => `${r.name} (restarts: ${r.restartCount}, ${r.status})`),
    rows: out,
  };
}
