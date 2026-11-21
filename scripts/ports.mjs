export const meta = {
  purpose:
    "Which ports containers publish on the host and which container holds each one; or, given a port, which container publishes it (running or stopped) and whether something else on the host listens on it.",
  params: { port: "a host port to look up, optional", all: "include stopped containers, default false (only running ones hold a port)" },
  returns: "{ports:[{host, container, containerPort, proto, bind, name, project, state}], matches?:[...], hostListeners?:text}",
  example: 'await scripts.run("ports", { port: 5440 })',
};

export default async function ({ docker }, { port, all = false }) {
  const rows = await docker.ps({ all });
  const ports = [];
  for (const r of rows) {
    // "0.0.0.0:1025->1025/tcp, [::]:1025->1025/tcp, 1110/tcp"; ranges like 8000-8002->8000-8002 are kept as text.
    const seen = new Set();
    for (const p of (r.ports ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
      const m = p.match(/^(?:(\[?[\w.:]*\]?):)?(\d+(?:-\d+)?)->(\d+(?:-\d+)?)\/(\w+)$/);
      if (!m) continue;
      const key = `${m[2]}-${m[3]}-${m[4]}-${m[1]?.includes(":") ? "v6" : "v4"}`;
      if (seen.has(key) && m[1]?.startsWith("[")) continue; // the [::] twin of an IPv4 binding
      seen.add(key);
      ports.push({ host: m[2], container: r.name, containerPort: m[3], proto: m[4], bind: m[1] || "0.0.0.0", name: r.name, project: r.project, state: r.state });
    }
  }
  const out = { ports: ports.filter((p) => !p.bind.startsWith("[")).map(({ container, ...p }) => p) };
  if (port != null) {
    out.matches = out.ports.filter((p) => String(p.host).split("-").some((h) => h === String(port)));
    out.note = out.matches.length ? `port ${port} is published by ${out.matches.map((m) => m.name).join(", ")}` : `no ${all ? "" : "running "}container publishes ${port}`;
  }
  return out;
}
