export const getProfileIdentifier = (...sources) => {
  for (const source of sources) {
    if (source == null) continue;

    if (typeof source === "string" || typeof source === "number") {
      const value = String(source).trim();
      if (value) return value;
      continue;
    }

    if (typeof source !== "object") continue;

    const candidates = [
      source.name,
      source.username,
      source.email,
      source.user?.name,
      source.user?.username,
      source.user?.email,
      source.actorName,
      source.actorUsername,
      source.actorEmail,
      source.profile?.name,
      source.profile?.username,
      source.profile?.email,
      source.id,
      source.userId
    ];

    for (const candidate of candidates) {
      const value = String(candidate || "").trim();
      if (value) return value;
    }
  }

  return "";
};

export const buildProfilePath = (...sources) => {
  const identifier = getProfileIdentifier(...sources);
  const safe = identifier || "me";
  return `/profile/${encodeURIComponent(safe)}`;
};

export const persistProfileIdentity = (profile) => {
  if (!profile || typeof profile !== "object") return;

  const pairs = [
    ["userId", profile.id],
    ["username", profile.username],
    ["email", profile.email],
    ["name", profile.name]
  ];

  pairs.forEach(([key, value]) => {
    const safe = String(value || "").trim();
    if (!safe) return;
    sessionStorage.setItem(key, safe);
    localStorage.setItem(key, safe);
  });
};

export const getStoredProfileIdentifier = () =>
  getProfileIdentifier(
    sessionStorage.getItem("name"),
    localStorage.getItem("name"),
    sessionStorage.getItem("username"),
    localStorage.getItem("username"),
    sessionStorage.getItem("email"),
    localStorage.getItem("email"),
    sessionStorage.getItem("userId"),
    localStorage.getItem("userId"),
    "me"
  );
