export const VOLO_STORAGE_KEY = "socialsea_volos_v1";
export const VOLO_UPDATE_EVENT = "ss-volo-update";

const VOLO_LIMIT = 600;

const ensureText = (value) => String(value || "").trim();
const normalizeEntryType = (value) => (ensureText(value).toLowerCase() === "question" ? "question" : "post");

const readSessionLocalValue = (key) => {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const toEpochMs = (value) => {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  const text = ensureText(value);
  if (!text) return 0;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber < 1e12 ? asNumber * 1000 : asNumber;
  }
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeUrl = (value) => {
  const text = ensureText(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text.replace(/^\/+/, "")}`;
};

const normalizeLinkList = (value) => {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  return list
    .map((item) => normalizeUrl(item))
    .filter((url) => {
      if (!url) return false;
      const key = url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
};

const normalizeMediaItem = (value) => {
  const media = value && typeof value === "object" ? value : {};
  const typeRaw = ensureText(media.type || media.kind).toLowerCase();
  const type = typeRaw === "video" ? "video" : "image";
  const url = normalizeUrl(media.url || media.src || media.contentUrl);
  if (!url) return null;
  return { type, url };
};

const normalizeMediaList = (value) => {
  const list = Array.isArray(value) ? value : [];
  return list.map(normalizeMediaItem).filter(Boolean).slice(0, 6);
};

const normalizeId = (value) => {
  const text = ensureText(value);
  if (text) return text;
  return `volo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeOwnerIdentity = (ownerLike, raw) => {
  const owner = ownerLike && typeof ownerLike === "object" ? ownerLike : {};
  return {
    userId: ensureText(owner.userId || owner.id || raw?.userId || raw?.ownerId).toLowerCase(),
    email: ensureText(owner.email || raw?.email || raw?.ownerEmail).toLowerCase(),
    username: ensureText(owner.username || raw?.username || raw?.ownerUsername).toLowerCase(),
    name: ensureText(owner.name || raw?.name || raw?.ownerName),
    profilePicUrl: ensureText(
      owner.profilePicUrl ||
      owner.profilePic ||
      raw?.profilePicUrl ||
      raw?.profilePic ||
      raw?.ownerProfilePic
    )
  };
};

const normalizeVoloAnswer = (value) => {
  const raw = value && typeof value === "object" ? value : {};
  const text = ensureText(raw.text || raw.answer || raw.content || raw.body);
  if (!text) return null;
  const createdAtMs = toEpochMs(raw.createdAt || raw.created || raw.timestamp) || Date.now();
  return {
    id: normalizeId(raw.id || raw.answerId),
    text,
    createdAt: new Date(createdAtMs).toISOString(),
    owner: normalizeOwnerIdentity(raw.owner, raw)
  };
};

const normalizeAnswerList = (value) => {
  const list = Array.isArray(value) ? value : [];
  return list
    .map(normalizeVoloAnswer)
    .filter(Boolean)
    .sort((a, b) => toEpochMs(a.createdAt) - toEpochMs(b.createdAt))
    .slice(-160);
};

export const readVoloIdentity = () => {
  const userId = ensureText(readSessionLocalValue("userId")).toLowerCase();
  const email = ensureText(readSessionLocalValue("email")).toLowerCase();
  const username = ensureText(readSessionLocalValue("username")).toLowerCase();
  const name = ensureText(readSessionLocalValue("name"));
  const profilePicUrl = ensureText(
    readSessionLocalValue("profilePicUrl") ||
    readSessionLocalValue("profilePic") ||
    readSessionLocalValue("avatar")
  );
  return { userId, email, username, name, profilePicUrl };
};

export const normalizeVoloEntry = (value) => {
  const raw = value && typeof value === "object" ? value : {};
  const createdAtMs = toEpochMs(raw.createdAt || raw.created || raw.timestamp) || Date.now();
  const entryType = normalizeEntryType(raw.entryType || raw.type || raw.kind);
  const text = ensureText(raw.text || raw.caption || raw.content || raw.body);
  const links = normalizeLinkList(raw.links || raw.urls);
  const media = normalizeMediaList(raw.media || raw.assets);
  const answers = normalizeAnswerList(raw.answers || raw.replies || raw.responseList);
  const answerCount = Math.max(answers.length, Number(raw.answerCount || raw.answersCount || 0) || 0);
  const likeCount = Math.max(0, Number(raw.likeCount || raw.likes || 0) || 0);
  const commentCount = Math.max(0, Number(raw.commentCount || raw.comments || 0) || 0);
  const ownerIdentity = normalizeOwnerIdentity(raw.owner, raw);

  return {
    id: normalizeId(raw.id || raw.voloId),
    entryType,
    text,
    links,
    media,
    answers,
    answerCount,
    createdAt: new Date(createdAtMs).toISOString(),
    owner: ownerIdentity,
    likeCount,
    commentCount
  };
};

const writeVoloList = (list) => {
  const normalized = (Array.isArray(list) ? list : [])
    .map(normalizeVoloEntry)
    .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt))
    .slice(0, VOLO_LIMIT);
  try {
    localStorage.setItem(VOLO_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage errors
  }
  return normalized;
};

export const readAllVolos = () => {
  try {
    const raw = localStorage.getItem(VOLO_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return writeVoloList(parsed);
  } catch {
    return [];
  }
};

const buildIdentityTokens = (identity) => {
  const value = identity && typeof identity === "object" ? identity : {};
  return [
    ensureText(value.userId).toLowerCase(),
    ensureText(value.email).toLowerCase(),
    ensureText(value.username).toLowerCase()
  ].filter(Boolean);
};

export const isVoloOwnedByIdentity = (volo, identity) => {
  const ownerTokens = buildIdentityTokens(volo?.owner || {});
  if (!ownerTokens.length) return false;
  const identityTokens = buildIdentityTokens(identity);
  if (!identityTokens.length) return false;
  return ownerTokens.some((token) => identityTokens.includes(token));
};

export const readVolosForIdentity = (identity) => {
  const list = readAllVolos();
  return list.filter((volo) => isVoloOwnedByIdentity(volo, identity));
};

export const createVolo = (payload) => {
  const draft = payload && typeof payload === "object" ? payload : {};
  const identity = readVoloIdentity();
  const entry = normalizeVoloEntry({
    ...draft,
    owner: {
      userId: identity.userId,
      email: identity.email,
      username: identity.username,
      name: identity.name,
      profilePicUrl: identity.profilePicUrl
    },
    createdAt: draft.createdAt || new Date().toISOString()
  });
  const next = writeVoloList([entry, ...readAllVolos()]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VOLO_UPDATE_EVENT, { detail: { id: entry.id } }));
  }
  return { entry, list: next };
};

export const addVoloAnswer = (voloId, payload) => {
  const targetId = ensureText(voloId);
  if (!targetId) return { entry: null, list: readAllVolos() };

  const draft = payload && typeof payload === "object" ? payload : {};
  const text = ensureText(draft.text || draft.answer || draft.content || draft.body);
  if (!text) return { entry: null, list: readAllVolos() };

  const identity = readVoloIdentity();
  const answer = normalizeVoloAnswer({
    ...draft,
    text,
    owner: {
      userId: identity.userId,
      email: identity.email,
      username: identity.username,
      name: identity.name,
      profilePicUrl: identity.profilePicUrl
    },
    createdAt: draft.createdAt || new Date().toISOString()
  });

  if (!answer) return { entry: null, list: readAllVolos() };

  let updatedEntry = null;
  const next = writeVoloList(
    readAllVolos().map((entry) => {
      if (entry?.id !== targetId || normalizeEntryType(entry?.entryType) !== "question") return entry;
      const answers = normalizeAnswerList([...(Array.isArray(entry.answers) ? entry.answers : []), answer]);
      updatedEntry = normalizeVoloEntry({
        ...entry,
        answers,
        answerCount: answers.length
      });
      return updatedEntry;
    })
  );

  if (updatedEntry && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VOLO_UPDATE_EVENT, { detail: { id: updatedEntry.id, answerId: answer.id } }));
  }

  return { entry: updatedEntry, list: next };
};
