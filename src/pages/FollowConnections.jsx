import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";
import "./FollowConnections.css";

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

function getPathCandidates(identifier, kind) {
  const safeId = encodeURIComponent(String(identifier || "").trim());
  if (!safeId) return [];
  return [
    `/api/profile/${safeId}/${kind}`,
    `/api/follow/${safeId}/${kind}/users`,
    `/api/follow/${safeId}/${kind}`,
    `/api/follow/${kind}/${safeId}`
  ];
}

function pickList(payload, kind) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;

  const byKind = payload?.[kind];
  if (Array.isArray(byKind)) return byKind;

  const nestedByKind = payload?.data?.[kind];
  if (Array.isArray(nestedByKind)) return nestedByKind;

  const aliasKey = kind === "followers" ? "follower" : "following";
  const aliasList = payload?.[`${aliasKey}Users`] || payload?.[`${kind}List`] || payload?.[aliasKey];
  if (Array.isArray(aliasList)) return aliasList;
  const nestedAliasList =
    payload?.data?.[`${aliasKey}Users`] || payload?.data?.[`${kind}List`] || payload?.data?.[aliasKey];
  if (Array.isArray(nestedAliasList)) return nestedAliasList;

  const userList = payload?.users || payload?.data?.users || payload?.content || payload?.data?.content;
  if (Array.isArray(userList)) return userList;

  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;

  return null;
}

function normalizeUser(entry) {
  const user = entry?.user || entry?.sender || entry?.target || entry;
  const id = String(user?.id ?? user?.userId ?? user?.username ?? user?.email ?? "");
  const name = String(user?.name || user?.username || user?.email || "User").trim();
  const username = String(user?.username || "").trim();
  const email = String(user?.email || "").trim();
  const profilePicRaw = user?.profilePicUrl || user?.profilePic || user?.avatar || "";

  return {
    id,
    name,
    username,
    email,
    profilePic: profilePicRaw ? toApiUrl(profilePicRaw) : "",
    initials: (name[0] || "U").toUpperCase()
  };
}

const IS_HTTPS_PAGE =
  typeof window !== "undefined" && window.location.protocol === "https:";

const baseCandidates = [
  api.defaults.baseURL,
  import.meta.env.VITE_API_URL,
  "/api",
  "http://43.205.213.14:8080",
  "http://localhost:8080"
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

export default function FollowConnections() {
  const { username } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const kind = location.pathname.endsWith("/following") ? "following" : "followers";
  const [users, setUsers] = useState([]);
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
          const profileName = String(profile?.name ?? "").trim();
          [profileId, profileEmail, profileUsername, profileName].forEach((v) => {
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
              const profileName = String(profile?.name ?? "").trim();
              [profileId, profileEmail, profileUsername, profileName].forEach((v) => {
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
        ...(String(username || "").toLowerCase() === "me" ? [`/api/profile/me/${kind}`] : []),
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
          const res = await requestJson(path);
          const rawList = pickList(res?.data, kind);
          if (!Array.isArray(rawList)) continue;
          foundListPayload = true;
          const normalized = rawList.map(normalizeUser).filter((u) => u.id);
          resolvedLists.push(normalized);
          // A valid payload was found (including empty array), stop probing.
          break;
        } catch (err) {
          const status = Number(err?.response?.status || 0);
          if (status === 401 || status === 403) authBlocked = true;
        }
      }

      if (!cancelled) {
        if (foundListPayload) {
          const seen = new Set();
          const merged = [];
          resolvedLists.flat().forEach((u) => {
            const key = String(u.id || "").trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push(u);
          });
          setUsers(merged);
          setError("");
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

  const heading = useMemo(() => {
    const person = titleName || username || "User";
    return `${person}'s ${kind}`;
  }, [titleName, username, kind]);

  const openProfile = (person) => {
    if (!person?.id) return;
    navigate(`/profile/${person.id}`);
  };

  const openChat = (person) => {
    if (!person?.id) return;
    navigate(`/chat/${person.id}`);
  };

  return (
    <div className="follow-connections-page">
      <section className="follow-connections-card">
        <div className="follow-head">
          <button
            type="button"
            className={`follow-tab ${kind === "followers" ? "active" : ""}`}
            onClick={() => navigate(`/profile/${username}/followers`)}
          >
            Followers
          </button>
          <button
            type="button"
            className={`follow-tab ${kind === "following" ? "active" : ""}`}
            onClick={() => navigate(`/profile/${username}/following`)}
          >
            Following
          </button>
        </div>

        <h2>{heading}</h2>
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
                  <small>{person.username || person.email || `id: ${person.id}`}</small>
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
