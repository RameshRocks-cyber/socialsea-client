import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { recordSearchActivity } from "../services/activityStore";
import { buildProfilePath, getProfileIdentifier } from "../utils/profileRoute";
import { toApiUrl } from "../api/baseUrl";
import "./FollowConnections.css";

const FOLLOWING_CACHE_KEY = "socialsea_following_cache_v1";

function readAuthHints() {
  const hints = { ids: [], emails: [] };
  const addId = (value) => {
    const v = String(value || "").trim();
    if (!v) return;
    if (!hints.ids.includes(v)) hints.ids.push(v);
  };
  const addEmail = (value) => {
    const v = String(value || "").trim();
    if (!v) return;
    if (!hints.emails.includes(v)) hints.emails.push(v);
  };

  addId(sessionStorage.getItem("userId") || localStorage.getItem("userId"));
  addEmail(sessionStorage.getItem("email") || localStorage.getItem("email"));

  const token =
    sessionStorage.getItem("accessToken") ||
    sessionStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");

  if (token && token.includes(".")) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      addId(payload?.userId || payload?.id || payload?.uid);
      addEmail(payload?.email);
      if (String(payload?.sub || "").includes("@")) addEmail(payload.sub);
      if (String(payload?.username || "").includes("@")) addEmail(payload.username);
    } catch {
      // ignore invalid token payload
    }
  }

  return hints;
}

function readFollowingCache() {
  try {
    const raw = localStorage.getItem(FOLLOWING_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFollowingCache(next) {
  localStorage.setItem(FOLLOWING_CACHE_KEY, JSON.stringify(next || {}));
}

function readFollowingCacheKeys() {
  try {
    const raw = localStorage.getItem(FOLLOWING_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return [];
    return Object.entries(parsed)
      .filter(([, value]) => value === true)
      .map(([key]) => String(key || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function makeFallbackUserFromKey(key) {
  const raw = String(key || "").trim();
  if (!raw) return null;
  const emailLike = raw.includes("@");
  const looksNumeric = /^\d+$/.test(raw);
  const name = emailLike
    ? raw.split("@")[0].replace(/[._-]+/g, " ").trim()
    : raw.replace(/[._-]+/g, " ").trim();
  const readableName = name
    ? name
        .split(" ")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : raw;

  return {
    id: `cached:${raw.toLowerCase()}`,
    name: readableName || "User",
    username: !emailLike && !looksNumeric ? raw : "",
    email: emailLike ? raw : "",
    bio: "",
    profilePic: "",
    initials: (readableName?.[0] || raw[0] || "U").toUpperCase()
  };
}

function getPathCandidates(identifier, kind) {
  const safeId = encodeURIComponent(String(identifier || "").trim());
  if (!safeId) return [];
  const kindAliases =
    kind === "followers"
      ? ["followers", "follower"]
      : kind === "following"
        ? ["following", "followings"]
        : [kind];

  return [
    ...kindAliases.map((alias) => `/api/profile/${safeId}/${alias}`),
    ...kindAliases.map((alias) => `/api/follow/${safeId}/${alias}/users`)
  ].filter((path, index, arr) => arr.indexOf(path) === index);
}

function pickList(payload, kind) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;

  const aliasKey = kind === "followers" ? "follower" : "following";
  const aliasPluralKey = kind === "followers" ? "followers" : "followings";
  const candidates = [
    payload?.[kind],
    payload?.data?.[kind],
    payload?.[`${aliasKey}Users`],
    payload?.data?.[`${aliasKey}Users`],
    payload?.[`${aliasPluralKey}Users`],
    payload?.data?.[`${aliasPluralKey}Users`],
    payload?.[`${kind}Users`],
    payload?.data?.[`${kind}Users`],
    payload?.[`${kind}List`],
    payload?.data?.[`${kind}List`],
    payload?.[`${aliasKey}List`],
    payload?.data?.[`${aliasKey}List`],
    payload?.[aliasKey],
    payload?.data?.[aliasKey],
    payload?.[aliasPluralKey],
    payload?.data?.[aliasPluralKey],
    payload?.users,
    payload?.data?.users,
    payload?.content,
    payload?.data?.content,
    payload?.results,
    payload?.data?.results,
    payload?.items,
    payload?.data?.items
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return null;
}

function normalizeUser(entry) {
  const user =
    entry?.user ||
    entry?.sender ||
    entry?.target ||
    entry?.follower ||
    entry?.following ||
    entry?.fromUser ||
    entry?.toUser ||
    entry;
  const id = String(
    user?.id ??
      user?.userId ??
      entry?.followerId ??
      entry?.followingId ??
      entry?.sourceUserId ??
      entry?.targetUserId ??
      entry?.fromUserId ??
      entry?.toUserId ??
      user?.username ??
      user?.email ??
      ""
  ).trim();
  const name = String(
    user?.name ||
      entry?.followerName ||
      entry?.followingName ||
      user?.username ||
      user?.email ||
      "User"
  ).trim();
  const username = String(user?.username || entry?.followerUsername || entry?.followingUsername || "").trim();
  const email = String(user?.email || entry?.followerEmail || entry?.followingEmail || "").trim();
  const bio = String(
    user?.bio ||
      entry?.bio ||
      entry?.followerBio ||
      entry?.followingBio ||
      ""
  ).trim();
  const profilePicRaw =
    user?.profilePicUrl ||
    user?.profilePic ||
    user?.profileImage ||
    user?.image ||
    user?.avatar ||
    user?.avatarUrl ||
    entry?.followerProfilePicUrl ||
    entry?.followerProfilePic ||
    entry?.followingProfilePicUrl ||
    entry?.followingProfilePic ||
    entry?.profilePicUrl ||
    entry?.profilePic ||
    "";

  const stableKey = String(id || username || email || name || "").trim();

  return {
    id: stableKey,
    name,
    username,
    email,
    bio,
    profilePic: profilePicRaw ? toApiUrl(profilePicRaw) : "",
    initials: (name[0] || "U").toUpperCase()
  };
}

function buildIdentityKeys(user) {
  const idKey = String(user?.id || "").trim().toLowerCase();
  const emailKey = String(user?.email || "").trim().toLowerCase();
  const usernameKey = String(user?.username || "").trim().toLowerCase();
  const nameKey = String(user?.name || "").trim().toLowerCase();
  const bioKey = String(user?.bio || "").trim().toLowerCase();
  const keys = [];
  if (idKey) keys.push(`id:${idKey}`);
  if (emailKey) keys.push(`email:${emailKey}`);
  if (usernameKey) keys.push(`username:${usernameKey}`);
  if (nameKey || bioKey) keys.push(`profile:${nameKey}|${bioKey}`);
  return keys;
}

function dedupeUsers(list) {
  const users = Array.isArray(list) ? list : [];
  const keyToIndex = new Map();
  const result = [];

  users.forEach((user) => {
    const keys = buildIdentityKeys(user);
    if (!keys.length) return;
    const existingIndex = keys
      .map((k) => keyToIndex.get(k))
      .find((idx) => Number.isInteger(idx));

    if (Number.isInteger(existingIndex)) {
      const prev = result[existingIndex];
      result[existingIndex] = {
        ...prev,
        ...user,
        id: prev?.id || user?.id || "",
        name: prev?.name && prev.name !== "User" ? prev.name : user?.name || prev?.name || "User",
        username: prev?.username || user?.username || "",
        email: prev?.email || user?.email || "",
        bio: prev?.bio || user?.bio || "",
        profilePic: prev?.profilePic || user?.profilePic || "",
        initials: prev?.initials || user?.initials || "U"
      };
      keys.forEach((k) => keyToIndex.set(k, existingIndex));
      return;
    }

    const nextIndex = result.length;
    result.push(user);
    keys.forEach((k) => keyToIndex.set(k, nextIndex));
  });

  return result;
}

function buildIdentityCandidates(user) {
  const id = String(user?.id || "").trim().toLowerCase();
  const email = String(user?.email || "").trim().toLowerCase();
  const username = String(user?.username || "").trim().toLowerCase();
  const name = String(user?.name || "").trim().toLowerCase();
  return [id, email, username, name].filter(Boolean);
}

function isAlreadyFollowing(user, followingSet) {
  if (!user || !followingSet || followingSet.size === 0) return false;
  return buildIdentityCandidates(user).some((key) => followingSet.has(key));
}

const IS_HTTPS_PAGE =
  typeof window !== "undefined" && window.location.protocol === "https:";

const baseCandidates = [
  api.defaults.baseURL,
  import.meta.env.VITE_API_URL,
  "/api"
]
  .filter((v, i, arr) => v && arr.indexOf(v) === i)
  .filter((v) => !(IS_HTTPS_PAGE && /^http:\/\//i.test(v)));

async function requestJson(path, timeoutMs = 10000) {
  let lastError = null;
  for (const baseURL of baseCandidates) {
    try {
      const res = await api.request({ method: "GET", url: path, baseURL, timeout: timeoutMs });
      const textData = typeof res?.data === "string" ? res.data.trim() : "";
      if (textData && (/^\s*<!doctype html/i.test(textData) || /<html[\s>]/i.test(textData))) {
        const htmlErr = new Error("Received HTML instead of API JSON");
        htmlErr.response = { status: 404, data: textData };
        throw htmlErr;
      }
      return res;
    } catch (err) {
      lastError = err;
      const status = Number(err?.response?.status || 0);
      if (!(status === 400 || status === 401 || status === 403 || status === 404 || status === 405 || (status >= 500 && status <= 599) || !status)) {
        throw err;
      }
    }
  }
  throw lastError || new Error("Request failed");
}

async function loadUsersFromFollowCache() {
  const cacheKeys = readFollowingCacheKeys();
  if (!cacheKeys.length) return [];

  const seen = new Set();
  const users = [];
  for (const key of cacheKeys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      const res = await requestJson(`/api/profile/${encodeURIComponent(key)}`, 3000);
      const profile = res?.data?.user || res?.data || {};
      const normalized = normalizeUser(profile);
      if (normalized.id) {
        users.push(normalized);
        continue;
      }
    } catch {
      // Ignore stale cache keys that no longer resolve to a real profile.
    }
  }
  return dedupeUsers(users);
}

async function loadFollowersFromNotifications() {
  try {
    const res = await requestJson("/api/notifications", 4500);
    const list = Array.isArray(res?.data) ? res.data : [];
    const followItems = list.filter((entry) => {
      const kind = String(entry?.kind || "").toLowerCase();
      const message = String(entry?.message || "").toLowerCase();
      return kind === "follow" || message.includes("started following");
    });

    const seen = new Set();
    const users = [];

    for (const entry of followItems) {
      const rawIdentifier =
        entry?.actorIdentifier ||
        entry?.actorUsername ||
        entry?.actorEmail ||
        entry?.actor?.id ||
        entry?.actor?.username ||
        entry?.actor?.email ||
        "";

      let person = normalizeUser({
        ...entry,
        user: {
          ...(entry?.actor || {}),
          id: entry?.actor?.id ?? rawIdentifier,
          username: entry?.actor?.username ?? entry?.actorUsername ?? rawIdentifier,
          email: entry?.actor?.email ?? entry?.actorEmail,
          name: entry?.actor?.name ?? entry?.actorName,
          profilePicUrl: entry?.actorProfilePic ?? entry?.actor?.profilePicUrl ?? entry?.actor?.profilePic,
          bio: entry?.actor?.bio ?? "",
        },
      });

      const identifier = String(person?.id || rawIdentifier || "").trim();
      if (!person?.bio && identifier) {
        try {
          const profileRes = await requestJson(`/api/profile/${encodeURIComponent(identifier)}`, 2500);
          person = normalizeUser(profileRes?.data?.user || profileRes?.data || person);
        } catch {
          // keep notification-derived user
        }
      }

      const key = String(person?.id || identifier || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      users.push(person);
    }

    return users;
  } catch {
    return [];
  }
}

export default function FollowConnections() {
  const { username } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const kind = location.pathname.endsWith("/following") ? "following" : "followers";
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [followBusyIds, setFollowBusyIds] = useState({});
  const [followingSet, setFollowingSet] = useState(() => new Set(readFollowingCacheKeys().map((k) => k.toLowerCase())));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [titleName, setTitleName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      setUsers([]);
      const idCandidates = [String(username || "").trim()].filter(Boolean);
      const authHints = readAuthHints();
      const storedUserId = String(authHints.ids[0] || "").trim();
      const storedEmail = String(authHints.emails[0] || "").trim();
      const isOwnConnections =
        (username || "").toLowerCase() === "me" ||
        (!!storedUserId && String(username || "").trim() === storedUserId) ||
        (!!storedEmail && String(username || "").trim().toLowerCase() === storedEmail.toLowerCase());
      let cachedFollowingUsers = [];
      if (kind === "following" && isOwnConnections) {
        cachedFollowingUsers = await loadUsersFromFollowCache();
      }
      const inlineListCandidates = [];
      if ((username || "").toLowerCase() === "me") {
        authHints.ids.forEach((id) => {
          if (id && !idCandidates.includes(id)) idCandidates.push(id);
        });
        authHints.emails.forEach((email) => {
          if (email && !idCandidates.includes(email)) idCandidates.push(email);
        });
      }

      try {
        const profileRes = await requestJson(`/api/profile/${username}`);
        if (!cancelled) {
          const profile = profileRes?.data?.user || profileRes?.data || {};
          const readable = profile?.name || profile?.username || profile?.email || username;
          setTitleName(String(readable || "").trim());

          const profileId = String(profile?.id ?? "").trim();
          const profileEmail = String(profile?.email ?? "").trim();
          const profileUsername = String(profile?.username ?? "").trim();
          [profileId, profileEmail, profileUsername].forEach((v) => {
            if (v && !idCandidates.includes(v)) idCandidates.push(v);
          });

          const profileKindList = pickList(profileRes?.data, kind);
          if (Array.isArray(profileKindList)) inlineListCandidates.push(profileKindList);
          const nestedKindList = pickList(profile, kind);
          if (Array.isArray(nestedKindList)) inlineListCandidates.push(nestedKindList);
        }
      } catch {
        // If /profile/me fails, retry profile by stored userId.
        if ((username || "").toLowerCase() === "me" && storedUserId) {
          try {
            const profileRes = await requestJson(`/api/profile/${storedUserId}`);
            if (!cancelled) {
              const profile = profileRes?.data?.user || profileRes?.data || {};
              const readable = profile?.name || profile?.username || profile?.email || "Me";
              setTitleName(String(readable || "").trim());
              const profileId = String(profile?.id ?? "").trim();
              const profileEmail = String(profile?.email ?? "").trim();
              const profileUsername = String(profile?.username ?? "").trim();
              [profileId, profileEmail, profileUsername].forEach((v) => {
                if (v && !idCandidates.includes(v)) idCandidates.push(v);
              });

              const profileKindList = pickList(profileRes?.data, kind);
              if (Array.isArray(profileKindList)) inlineListCandidates.push(profileKindList);
              const nestedKindList = pickList(profile, kind);
              if (Array.isArray(nestedKindList)) inlineListCandidates.push(nestedKindList);
            }
          } catch {
            // ignore and continue with available candidates
          }
        }
        if (!cancelled) setTitleName(username || "User");
      }

      const candidates = [
        ...(String(username || "").toLowerCase() === "me"
          ? getPathCandidates("me", kind)
          : []),
        ...idCandidates.flatMap((id) => getPathCandidates(id, kind))
      ]
        .filter(Boolean)
        .filter((path, index, arr) => arr.indexOf(path) === index);
      let authBlocked = false;
      let foundListPayload = false;
      const resolvedLists = [];
      for (const list of inlineListCandidates) {
        foundListPayload = true;
        const normalized = list.map(normalizeUser).filter((u) => u.id);
        resolvedLists.push(normalized);
      }

      for (const path of candidates) {
        try {
          const res = await requestJson(path, 4500);
          const rawList = pickList(res?.data, kind);
          if (!Array.isArray(rawList)) continue;
          foundListPayload = true;
          const normalized = rawList.map(normalizeUser).filter((u) => u.id);
          resolvedLists.push(normalized);
          // Prefer non-empty payloads; keep probing if this endpoint returned an empty list.
          if (normalized.length > 0) break;
        } catch (err) {
          const status = Number(err?.response?.status || 0);
          if (status === 401 || status === 403) authBlocked = true;
        }
      }

      if (!cancelled) {
        if (foundListPayload) {
          const merged = dedupeUsers(resolvedLists.flat());
          setUsers(merged);
          setError("");
        } else if (kind === "following" && isOwnConnections) {
          setUsers(dedupeUsers(cachedFollowingUsers));
          setError(cachedFollowingUsers.length ? "" : `Could not load ${kind}. Please check backend ${kind} endpoint.`);
        } else if (kind === "followers" && isOwnConnections) {
          const fallbackUsers = await loadFollowersFromNotifications();
          setUsers(dedupeUsers(fallbackUsers));
          setError(fallbackUsers.length ? "" : `Could not load ${kind}. Please check backend ${kind} endpoint.`);
        } else {
          setUsers([]);
          setError(
            authBlocked
              ? `Could not load ${kind}. Please login again.`
              : `Could not load ${kind}. Please check backend ${kind} endpoint.`
          );
        }
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [username, kind]);

  useEffect(() => {
    let cancelled = false;
    const query = String(searchQuery || "").trim();
    if (!query || query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return undefined;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const res = await requestJson(`/api/profile/search?q=${encodeURIComponent(query)}`, 5000);
        const raw = Array.isArray(res?.data) ? res.data : [];
        const authHints = readAuthHints();
        const myId = String(authHints.ids[0] || "").trim().toLowerCase();
        const myEmail = String(authHints.emails[0] || "").trim().toLowerCase();
        const normalized = raw.map(normalizeUser).filter((u) => u.id);
        const filtered = normalized.filter((u) => {
          const keys = buildIdentityCandidates(u);
          if (myId && keys.includes(myId)) return false;
          if (myEmail && keys.includes(myEmail)) return false;
          return true;
        });
        recordSearchActivity({
          query,
          source: kind === "followers" ? "followers" : "following",
          resultsCount: filtered.length
        });
        if (!cancelled) {
          setSearchResults(dedupeUsers(filtered));
          setSearchLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSearchResults([]);
          setSearchLoading(false);
          setSearchError("Search failed. Check backend connection.");
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const heading = useMemo(() => {
    const person = titleName || username || "User";
    return `${person}'s ${kind}`;
  }, [titleName, username, kind]);

  const openProfile = (person) => {
    if (!person) return;
    navigate(buildProfilePath(person));
  };

  const openChat = (person) => {
    if (!person?.id) return;
    navigate(`/chat/${person.id}`);
  };

  const followUser = async (person) => {
    if (!person) return;
    const identifier = person?.email || person?.username || person?.id;
    if (!identifier) return;
    const key = String(person?.id || identifier || "").trim();
    setFollowBusyIds((prev) => ({ ...prev, [key]: true }));
    try {
      await api.post(`/api/follow/${encodeURIComponent(identifier)}`);
      const nextSet = new Set(followingSet);
      buildIdentityCandidates(person).forEach((k) => nextSet.add(k));
      setFollowingSet(nextSet);
      const cache = readFollowingCache();
      buildIdentityCandidates(person).forEach((k) => {
        cache[k] = true;
      });
      writeFollowingCache(cache);
    } catch {
      // ignore follow failures
    } finally {
      setFollowBusyIds((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="follow-connections-page">
      <section className="follow-connections-card">
        <div className="follow-head">
          <button
            type="button"
            className={`follow-tab ${kind === "followers" ? "active" : ""}`}
            onClick={() => navigate(`/profile/${encodeURIComponent(getProfileIdentifier(titleName, username) || "me")}/followers`)}
          >
            Followers
          </button>
          <button
            type="button"
            className={`follow-tab ${kind === "following" ? "active" : ""}`}
            onClick={() => navigate(`/profile/${encodeURIComponent(getProfileIdentifier(titleName, username) || "me")}/following`)}
          >
            Following
          </button>
        </div>

        <h2>{heading}</h2>

        <div className="follow-search">
          <input
            type="search"
            placeholder=""
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="follow-search-input"
          />
        </div>
        {searchLoading && <p className="follow-muted">Searching...</p>}
        {!searchLoading && searchError && <p className="follow-error">{searchError}</p>}
        {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0 && !searchError && (
          <p className="follow-muted">No users found.</p>
        )}
        {!searchLoading && searchResults.length > 0 && (
          <div className="follow-search-results">
            {searchResults.map((person) => {
              const busy = Boolean(followBusyIds[String(person?.id || "")]);
              const followed = isAlreadyFollowing(person, followingSet);
              return (
                <div key={`search-${person.id}`} className="follow-item follow-search-item">
                  <button type="button" className="follow-identity" onClick={() => openProfile(person)}>
                    {person.profilePic ? (
                      <img src={person.profilePic} alt={person.name} className="follow-avatar-img" />
                    ) : (
                      <span className="follow-avatar-fallback">{person.initials}</span>
                    )}
                    <span className="follow-text">
                      <strong>{person.name}</strong>
                      <small>{person.bio || person.username || person.email || "No bio yet"}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="follow-follow-btn"
                    onClick={() => followUser(person)}
                    disabled={busy || followed}
                  >
                    {followed ? "Following" : busy ? "Following..." : "Follow"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {loading && <p className="follow-muted">Loading...</p>}
        {!loading && error && <p className="follow-error">{error}</p>}
        {!loading && !error && users.length === 0 && <p className="follow-muted">No {kind} yet.</p>}

        <div className="follow-list">
          {users.map((person) => (
            <div key={person.id} className="follow-item">
              <button type="button" className="follow-identity" onClick={() => openProfile(person)}>
                {person.profilePic ? (
                  <img src={person.profilePic} alt={person.name} className="follow-avatar-img" />
                ) : (
                  <span className="follow-avatar-fallback">{person.initials}</span>
                )}
                <span className="follow-text">
                  <strong>{person.name}</strong>
                  <small>{person.bio || person.username || person.email || "No bio yet"}</small>
                </span>
              </button>
              <button type="button" className="follow-chat-btn" onClick={() => openChat(person)}>
                Message
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
