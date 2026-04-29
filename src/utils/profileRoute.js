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
      source.id,
      source.userId,
      source.email,
      source.username,
      source.user?.id,
      source.user?.email,
      source.actorId,
      source.actorEmail,
      source.profile?.id,
      source.profile?.email,
      source.name,
      source.user?.name,
      source.user?.username,
      source.actorName,
      source.actorUsername,
      source.profile?.name,
      source.profile?.username
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
    try {
      sessionStorage.setItem(key, safe);
      localStorage.setItem(key, safe);
    } catch {
      // ignore storage errors (quota / disabled storage)
    }
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
