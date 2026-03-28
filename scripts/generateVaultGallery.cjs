const fs = require("node:fs");
const path = require("node:path");

const total = 80;
const outDir = path.resolve(__dirname, "..", "public", "vault-picks");
const dataFile = path.resolve(__dirname, "..", "src", "data", "vaultGallery.js");
const sourcesFile = path.resolve(__dirname, "..", "src", "data", "vaultGallerySources.json");

const queries = [
  "animal outline",
  "wild animal outline",
  "line art animal",
  "lion outline",
  "dragon outline",
  "unicorn outline",
  "mythical creature outline",
  "fantasy creature outline"
];

const version = Date.now();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchText = async (url, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
};

const extractCandidates = (html) => {
  const results = [];
  const re = /<img[^>]+src=\"[^\"]*\/image\/[^\"]+\/(\d+)\"[^>]*alt=\"([^\"]*)\"/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const id = match[1];
    const title = match[2] ? match[2].trim() : "Vault Art";
    results.push({
      id,
      title,
      image: `https://openclipart.org/image/400px/${id}`,
      detail: `https://openclipart.org/detail/${id}`
    });
  }
  return results;
};

const gatherCandidates = async (maxPages = 1) => {
  const seen = new Set();
  const candidates = [];

  for (const query of queries) {
    for (let page = 1; page <= maxPages; page += 1) {
      let html;
      try {
        html = await fetchText(`https://openclipart.org/search/?query=${encodeURIComponent(query)}&page=${page}`);
      } catch {
        continue;
      }

      const results = extractCandidates(html);
      for (const candidate of results) {
        if (seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        candidates.push(candidate);
        if (candidates.length >= total) return candidates;
      }

      await delay(50);
    }
    if (candidates.length >= total) break;
  }

  return candidates;
};

const main = async () => {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const candidates = await gatherCandidates(3);
  if (!candidates.length) throw new Error("No clipart results found from Openclipart.");

  const items = [];
  const sources = [];

  for (const candidate of candidates.slice(0, total)) {
    const fileId = `vault-${String(items.length + 1).padStart(3, "0")}`;
    items.push({
      id: fileId,
      label: candidate.title || "Vault Art",
      src: `${candidate.image}?v=${version}`,
      group: "mix"
    });

    sources.push({
      id: fileId,
      title: candidate.title || "Vault Art",
      source: candidate.detail,
      download: candidate.image,
      license: "https://creativecommons.org/publicdomain/zero/1.0/"
    });
  }

  const dataContent = `export const VAULT_GALLERY = ${JSON.stringify(items, null, 2)};\n` +
    `export const VAULT_GALLERY_TOTAL = VAULT_GALLERY.length;\n`;

  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, dataContent, "utf8");
  fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2), "utf8");

  console.log(`Saved ${items.length} vault images from Openclipart.`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
