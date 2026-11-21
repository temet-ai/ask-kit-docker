export const meta = {
  purpose:
    "Compose projects and what each holds: status, compose file(s) and working directory, and every service's container with its state, health, ports and image. One project when named.",
  params: { project: "compose project name, or a substring; all projects when omitted" },
  returns: "{projects:[{name, status, configFiles:[path], workingDir, services:[{service, container, state, status, health, ports, image}]}]}",
  example: 'await scripts.run("compose", { project: "web" })',
};

export default async function ({ docker }, { project }) {
  const [projects, rows] = await Promise.all([docker.json("compose", "ls", "--all", "--format", "json"), docker.ps()]);
  const want = (n) => !project || n.toLowerCase().includes(String(project).toLowerCase());
  const out = [];
  for (const p of projects.filter((p) => want(p.Name))) {
    const cs = rows.filter((r) => r.project === p.Name);
    let workingDir = null;
    if (cs[0]) {
      try {
        workingDir = (await docker.inspect(cs[0].name)).labels?.["com.docker.compose.project.working_dir"] ?? null;
      } catch {}
    }
    out.push({
      name: p.Name,
      status: p.Status,
      configFiles: String(p.ConfigFiles ?? "").split(",").filter(Boolean),
      workingDir,
      services: cs.map((c) => ({ service: c.service, container: c.name, state: c.state, status: c.status, health: c.health, ports: c.ports || null, image: c.image })),
    });
  }
  return { projects: out, note: out.length ? null : `no compose project matches ${project ?? ""}; have: ${projects.map((p) => p.Name).join(", ")}` };
}
