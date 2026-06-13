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
      source.username,
      source.handle,
      source.name,
      source.displayName,
      source.user?.id,
      source.user?.userId,
      source.user?.username,
      source.user?.handle,
      source.user?.name,
      source.user?.displayName,
      source.profile?.id,
      source.profile?.userId,
      source.profile?.username,
      source.profile?.handle,
      source.profile?.name,
      source.profile?.displayName,
      source.actorId,
      source.actorName,
      source.actorUsername,
      source.actorDisplayName,
      source.email,
      source.user?.email,
      source.actorEmail,
      source.profile?.email
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
    sessionStorage.getItem("username"),
    localStorage.getItem("username"),
    sessionStorage.getItem("name"),
    localStorage.getItem("name"),
    sessionStorage.getItem("userId"),
    localStorage.getItem("userId"),
    sessionStorage.getItem("email"),
    localStorage.getItem("email"),
    "me"
  );
