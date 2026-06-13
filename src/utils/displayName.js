const EMAIL_LIKE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeCandidate = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^(null|undefined)$/i.test(raw)) return "";
  if (EMAIL_LIKE_PATTERN.test(raw)) return "";
  return raw
    .replace(/^@+/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const toTitleCase = (value) =>
  String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const candidateValuesFor = (source) => {
  if (source == null) return [];
  if (typeof source === "string" || typeof source === "number") {
    return [source];
  }
  if (typeof source !== "object") return [];

  return [
    source.displayName,
    source.name,
    source.username,
    source.handle,
    source.userDisplayName,
    source.user?.displayName,
    source.user?.name,
    source.user?.username,
    source.user?.handle,
    source.profile?.displayName,
    source.profile?.name,
    source.profile?.username,
    source.actorDisplayName,
    source.actorName,
    source.actorUsername
  ];
};

export const getPublicDisplayName = (...sources) => {
  const fallback = "User";
  for (const source of sources) {
    for (const candidate of candidateValuesFor(source)) {
      const normalized = normalizeCandidate(candidate);
      if (!normalized) continue;
      return toTitleCase(normalized);
    }
  }
  return fallback;
};

export const getPublicInitial = (...sources) => {
  const name = getPublicDisplayName(...sources);
  return String(name || "U").charAt(0).toUpperCase() || "U";
};
