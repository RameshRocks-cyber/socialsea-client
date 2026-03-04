import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";
import "./FollowConnections.css";

function getPathCandidates(identifier, kind) {
  const safeId = encodeURIComponent(String(identifier || "").trim());
  if (!safeId) return [];
  const opposite = kind === "followers" ? "following" : "followers";
  return [
    `/api/follow/${safeId}/${kind}/users`,
    `/api/profile/${safeId}/${kind}`,
    `/api/follow/${safeId}/${kind}`,
    `/api/follow/${kind}/${safeId}`,
    `/api/follow/${kind}`,
    `/api/profile/${safeId}?view=${kind}`,
    `/api/follow/list?type=${kind}&user=${safeId}`,
    `/api/follow/${opposite}/${safeId}?reverse=true`,
    `/api/follow/${safeId}/${kind === "followers" ? "following" : "followers"}/users?reverse=true`
  ];
}

function pickList(payload, kind) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;

  const byKind = payload?.[kind];
  if (Array.isArray(byKind)) return byKind;

  const nestedByKind = payload?.data?.[kind];
  if (Array.isArray(nestedByKind)) return nestedByKind;

  const userList = payload?.users || payload?.data?.users || payload?.content || payload?.data?.content;
  if (Array.isArray(userList)) return userList;

  return null;
}

function normalizeUser(entry) {
  const user = entry?.user || entry?.sender || entry?.target || entry;
  const id = String(user?.id ?? user?.userId ?? "");
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

const requestWithTimeout = (path, timeoutMs = 4500) =>
  Promise.race([
    api.get(path),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
  ]);

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
      const storedUserId = String(sessionStorage.getItem("userId") || localStorage.getItem("userId") || "").trim();
      const storedEmail = String(sessionStorage.getItem("email") || localStorage.getItem("email") || "").trim();
      const inlineListCandidates = [];
      if ((username || "").toLowerCase() === "me") {
        if (storedUserId && !idCandidates.includes(storedUserId)) idCandidates.push(storedUserId);
        if (storedEmail && !idCandidates.includes(storedEmail)) idCandidates.push(storedEmail);
      }

      try {
        const profileRes = await requestWithTimeout(`/api/profile/${username}`);
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
            const profileRes = await requestWithTimeout(`/api/profile/${storedUserId}`);
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

      const candidates = idCandidates
        .flatMap((id) => getPathCandidates(id, kind))
        .filter((path, index, arr) => arr.indexOf(path) === index);
      let authBlocked = false;
      const resolvedLists = [];
      for (const list of inlineListCandidates) {
        const normalized = list.map(normalizeUser).filter((u) => u.id);
        if (normalized.length) resolvedLists.push(normalized);
      }

      const responses = await Promise.allSettled(candidates.map((path) => requestWithTimeout(path)));
      responses.forEach((result) => {
        if (result.status === "fulfilled") {
          const rawList = pickList(result.value?.data, kind);
          if (!Array.isArray(rawList)) return;
          const normalized = rawList.map(normalizeUser).filter((u) => u.id);
          if (normalized.length) resolvedLists.push(normalized);
          return;
        }
        const status = Number(result.reason?.response?.status || 0);
        if (status === 401 || status === 403) authBlocked = true;
      });

      if (!cancelled) {
        if (resolvedLists.length) {
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
