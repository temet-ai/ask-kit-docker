export const meta = {
  purpose:
    "What docker uses disk for: the summary (images, containers, volumes, build cache with sizes and what is reclaimable), the biggest images, the biggest volumes with the containers that use them, and unused (dangling) images and volumes. Read-only; prune afterwards if asked.",
  params: { top: "how many biggest images and volumes, default 8" },
  returns: "{summary:[{type, count, active, size, reclaimable}], images:[{name, size, unique, inUse}], volumes:[{name, size, inUse}], danglingImages, unusedVolumes, buildCache:{entries, size, unused}}",
  example: 'await scripts.run("disk", { top: 5 })',
};

// "1.326GB" -> bytes
const bytes = (s) => {
  const m = String(s ?? "0").match(/^([\d.]+)\s*([kMGT]?B)/i);
  if (!m) return 0;
  return parseFloat(m[1]) * { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[m[2].toUpperCase()];
};

export default async function ({ docker }, { top = 8 }) {
  const d = await docker.df();
  const images = (d.Images ?? []).map((i) => ({ name: `${i.Repository}:${i.Tag}`, id: i.ID.slice(7, 19), size: i.Size, unique: i.UniqueSize, inUse: Number(i.Containers) > 0, b: bytes(i.Size) }));
  const volumes = (d.Volumes ?? []).map((v) => ({ name: v.Name, size: v.Size, inUse: Number(v.Links) > 0, b: bytes(v.Size) }));
  const cache = d.BuildCache ?? [];
  const strip = ({ b, ...r }) => r;
  return {
    summary: (d.summary ?? []).map((s) => ({ type: s.Type, count: s.TotalCount, active: s.Active, size: s.Size, reclaimable: s.Reclaimable })),
    images: images.sort((a, b) => b.b - a.b).slice(0, top).map(strip),
    volumes: volumes.sort((a, b) => b.b - a.b).slice(0, top).map(strip),
    danglingImages: images.filter((i) => i.name.startsWith("<none>")).length,
    unusedImages: images.filter((i) => !i.inUse).length,
    unusedVolumes: volumes.filter((v) => !v.inUse).length,
    buildCache: { entries: cache.length, unused: cache.filter((c) => c.InUse === "false").length, size: (d.summary ?? []).find((s) => s.Type === "Build Cache")?.Size ?? null },
  };
}
