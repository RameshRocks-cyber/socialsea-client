import { useEffect, useMemo, useState } from "react";
import { FiCheck, FiHelpCircle, FiImage, FiLink, FiPlus, FiSend, FiTrash2, FiVideo, FiX } from "react-icons/fi";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { buildProfilePath } from "../utils/profileRoute";
import { resolveMediaUrl } from "../utils/mediaUrl";
import { VOLO_UPDATE_EVENT, addVoloAnswer, createVolo, readAllVolos, readVoloIdentity } from "../services/voloStorage";
import "./Volo.css";

const newMediaField = (type = "image") => ({
  id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  type,
  url: ""
});

const formatVoloTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Now";
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 1) return "Now";
  if (Math.abs(diffMinutes) < 60) return `${Math.abs(diffMinutes)}m`;
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return `${Math.abs(diffHours)}h`;
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) return `${Math.abs(diffDays)}d`;
  return date.toLocaleDateString();
};

const normalizeText = (value) => String(value || "").trim();

const normalizeAvatarUrl = (value) => {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (raw.startsWith("/default-avatar") || raw.startsWith("/assets/") || raw.startsWith("/icons/")) {
    return raw;
  }
  return resolveMediaUrl(raw);
};

const ownerIdentityCandidatesForVolo = (volo) => {
  const owner = volo?.owner || {};
  const values = [
    owner?.username,
    owner?.userId,
    owner?.email,
    owner?.name,
    volo?.ownerUsername,
    volo?.ownerId,
    volo?.ownerEmail
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  return values.filter((value, index, list) => list.indexOf(value) === index);
};

const ownerKeyForVolo = (volo) => {
  const owner = volo?.owner || {};
  const raw =
    normalizeText(owner?.userId) ||
    normalizeText(owner?.username) ||
    normalizeText(owner?.email) ||
    normalizeText(owner?.name);
  return raw.toLowerCase();
};

const answerCountForEntry = (entry) =>
  Math.max(Array.isArray(entry?.answers) ? entry.answers.length : 0, Number(entry?.answerCount || 0) || 0);

export default function Volo() {
  const [volos, setVolos] = useState(() => readAllVolos());
  const [text, setText] = useState("");
  const [links, setLinks] = useState([]);
  const [media, setMedia] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [composeOpen, setComposeOpen] = useState(() => searchParams.get("compose") === "1");
  const [submitState, setSubmitState] = useState("idle");
  const [questionPanelOpen, setQuestionPanelOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [questionSubmitState, setQuestionSubmitState] = useState("idle");
  const [answerDrafts, setAnswerDrafts] = useState({});
  const [ownerProfiles, setOwnerProfiles] = useState({});
  const identity = useMemo(() => readVoloIdentity(), []);

  const reloadVolos = () => {
    setVolos(readAllVolos());
  };

  useEffect(() => {
    const onUpdate = () => reloadVolos();
    const onStorage = (event) => {
      if (!event || event.key === "socialsea_volos_v1") reloadVolos();
    };
    window.addEventListener(VOLO_UPDATE_EVENT, onUpdate);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(VOLO_UPDATE_EVENT, onUpdate);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (searchParams.get("compose") !== "1") return;
    const next = new URLSearchParams(searchParams);
    next.delete("compose");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!volos.length) return;

    const ownersToResolve = [];
    const seen = new Set();
    for (const volo of volos) {
      const ownerKey = ownerKeyForVolo(volo);
      if (!ownerKey || seen.has(ownerKey)) continue;
      seen.add(ownerKey);
      if (ownerProfiles?.[ownerKey]?.loaded) continue;
      ownersToResolve.push({
        key: ownerKey,
        volo,
        candidates: ownerIdentityCandidatesForVolo(volo)
      });
    }
    if (!ownersToResolve.length) return;

    let cancelled = false;
    const run = async () => {
      const resolvedMap = {};

      for (const owner of ownersToResolve.slice(0, 40)) {
        const userLike = owner?.volo?.owner || {};
        const resolved = {
          loaded: true,
          name: normalizeText(userLike?.name),
          username: normalizeText(userLike?.username),
          profilePicUrl: normalizeAvatarUrl(userLike?.profilePicUrl || userLike?.profilePic || "")
        };

        if (!resolved.profilePicUrl) {
          for (const candidate of owner.candidates) {
            const safeCandidate = normalizeText(candidate);
            if (!safeCandidate) continue;
            try {
              const res = await api.get(`/api/profile/${encodeURIComponent(safeCandidate)}`, {
                suppressAuthRedirect: true,
                timeout: 4500
              });
              const user = res?.data?.user || res?.data || {};
              const rawPic = user?.profilePicUrl || user?.profilePic || user?.avatarUrl || user?.avatar || "";
              const normalizedPic = normalizeAvatarUrl(rawPic);
              if (normalizedPic) {
                resolved.profilePicUrl = normalizedPic;
              }
              const candidateName = normalizeText(user?.name);
              if (candidateName) resolved.name = candidateName;
              const candidateUsername = normalizeText(user?.username);
              if (candidateUsername) resolved.username = candidateUsername;
              if (resolved.profilePicUrl || resolved.name || resolved.username) break;
            } catch {
              // Ignore lookup errors and keep fallback owner info.
            }
          }
        }

        resolvedMap[owner.key] = resolved;
      }

      if (cancelled || !Object.keys(resolvedMap).length) return;
      setOwnerProfiles((prev) => ({ ...prev, ...resolvedMap }));
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [volos, ownerProfiles]);

  const cleanedLinks = useMemo(
    () => links.map((item) => String(item || "").trim()).filter(Boolean),
    [links]
  );

  const cleanedMedia = useMemo(
    () =>
      media
        .map((item) => ({
          ...item,
          url: String(item?.url || "").trim()
        }))
        .filter((item) => item.url),
    [media]
  );

  const canPost = Boolean(String(text || "").trim() || cleanedLinks.length > 0 || cleanedMedia.length > 0);
  const canAskQuestion = Boolean(String(questionText || "").trim());
  const questionEntries = useMemo(
    () => volos.filter((item) => String(item?.entryType || "post").toLowerCase() === "question"),
    [volos]
  );
  const topQuestions = useMemo(() => {
    return [...questionEntries]
      .sort((a, b) => {
        const scoreDiff = answerCountForEntry(b) - answerCountForEntry(a);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();
      })
      .slice(0, 3);
  }, [questionEntries]);
  const recentQuestions = useMemo(() => {
    return [...questionEntries].sort(
      (a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime()
    );
  }, [questionEntries]);

  const topQuestion = useMemo(() => {
    if (!topQuestions.length) return null;
    return topQuestions[0];
  }, [topQuestions]);

  const renderQuestionCard = (entry, options = {}) => {
    if (!entry) return null;
    const rank = Number(options.rank || 0);
    const isTop = Boolean(options.isTop);
    return (
      <article key={entry.id || `${options.group || "question"}-${rank}`} className={`volo-question-row ${isTop ? "is-top" : ""}`}>
        <header className="volo-question-row-head">
          {isTop ? <span className="volo-question-rank">#{rank}</span> : <span className="volo-question-dot" aria-hidden="true" />}
          <time className="volo-question-row-time">{formatVoloTime(entry?.createdAt)}</time>
        </header>
        <p className="volo-question-row-copy">{entry?.text || "Question"}</p>
        <p className="volo-question-row-meta">{answerCountForEntry(entry)} answers</p>
      </article>
    );
  };

  const topQuestionAnswerCount = useMemo(() => {
    if (!topQuestion) return 0;
    return answerCountForEntry(topQuestion);
  }, [topQuestion]);

  const topQuestionContent = useMemo(() => {
    if (!topQuestion) return null;
    return (
      <section className="volo-top-question" aria-label="Top question">
        <div className="volo-top-question-head">
          <span className="volo-top-question-tag">Top Question</span>
          <span className="volo-top-question-count">{topQuestionAnswerCount} answers</span>
        </div>
        <p className="volo-top-question-text">{topQuestion.text || "Question"}</p>
      </section>
    );
  }, [topQuestion, topQuestionAnswerCount]);

  const topQuestionList = useMemo(() => {
    if (!topQuestions.length) {
      return <p className="volo-question-empty">No top questions yet.</p>;
    }
    return topQuestions.map((entry, index) =>
      renderQuestionCard(entry, { rank: index + 1, isTop: true, group: "top" })
    );
  }, [topQuestions]);

  const postedQuestionList = useMemo(() => {
    if (!recentQuestions.length) {
      return <p className="volo-question-empty">No posted questions yet.</p>;
    }
    return recentQuestions.map((entry) => renderQuestionCard(entry, { group: "posted" }));
  }, [recentQuestions]);

  const updateLink = (index, value) => {
    setLinks((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const removeLink = (index) => {
    setLinks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateMediaUrl = (fieldId, value) => {
    setMedia((prev) => prev.map((item) => (item.id === fieldId ? { ...item, url: value } : item)));
  };

  const removeMediaField = (fieldId) => {
    setMedia((prev) => prev.filter((item) => item.id !== fieldId));
  };

  const clearDraft = () => {
    setText("");
    setLinks([]);
    setMedia([]);
    setSubmitState("idle");
  };

  const clearQuestionDraft = () => {
    setQuestionText("");
    setQuestionSubmitState("idle");
  };

  const submitVolo = () => {
    if (!canPost) return;
    createVolo({
      text,
      links: cleanedLinks,
      media: cleanedMedia
    });
    clearDraft();
    setComposeOpen(false);
    setSubmitState("posted");
    window.setTimeout(() => setSubmitState("idle"), 1800);
  };

  const submitQuestion = () => {
    if (!canAskQuestion) return;
    createVolo({
      entryType: "question",
      text: String(questionText || "").trim(),
      links: [],
      media: []
    });
    clearQuestionDraft();
    setQuestionSubmitState("posted");
    window.setTimeout(() => setQuestionSubmitState("idle"), 1800);
  };

  const submitAnswer = (voloId) => {
    const key = String(voloId || "").trim();
    const answerText = String(answerDrafts[key] || "").trim();
    if (!key || !answerText) return;
    const result = addVoloAnswer(key, { text: answerText });
    if (!result?.entry) return;
    setAnswerDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="volo-page">
      <div className="volo-shell">
        <header className="volo-head">
          <div className="volo-brand">
            <img src="/icons/volo-symbol.svg" alt="Volo symbol" className="volo-brand-mark" />
            <h1>Volo</h1>
          </div>
          <button
            type="button"
            className={`volo-question-trigger ${questionPanelOpen ? "is-open" : ""}`}
            onClick={() => {
              setQuestionPanelOpen((prev) => !prev);
              setComposeOpen(false);
            }}
            aria-expanded={questionPanelOpen}
            aria-label={questionPanelOpen ? "Hide questions panel" : "Show questions panel"}
            title="Questions"
          >
            ?
          </button>
        </header>

        {questionPanelOpen && (
          <button
            type="button"
            className="volo-question-sheet-backdrop"
            onClick={() => setQuestionPanelOpen(false)}
            aria-label="Close questions panel"
          />
        )}
        <aside className={`volo-question-sheet ${questionPanelOpen ? "is-open" : ""}`} aria-hidden={!questionPanelOpen}>
          <header className="volo-question-sheet-head">
            <div>
              <h2>Volo Questions</h2>
              <p>{questionEntries.length} posted</p>
            </div>
            <button
              type="button"
              className="volo-question-sheet-close"
              onClick={() => setQuestionPanelOpen(false)}
              aria-label="Close questions panel"
            >
              <FiX />
            </button>
          </header>

          <section className="volo-compose volo-question-compose" aria-label="Ask a question">
            <textarea
              name="volo-question-text"
              className="volo-input volo-text"
              rows={3}
              placeholder="Ask a question to the Volo community..."
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
            />
            <div className="volo-compose-actions">
              <button type="button" className="volo-btn ghost" onClick={clearQuestionDraft}>
                <FiTrash2 />
                <span>Clear</span>
              </button>
              <button type="button" className="volo-btn primary" onClick={submitQuestion} disabled={!canAskQuestion}>
                {questionSubmitState === "posted" ? <FiCheck /> : <FiHelpCircle />}
                <span>{questionSubmitState === "posted" ? "Asked" : "Post Question"}</span>
              </button>
            </div>
          </section>

          <section className="volo-question-group" aria-label="Top questions">
            <div className="volo-question-group-head">
              <h3>Top Questions</h3>
              <span>{topQuestions.length}</span>
            </div>
            {topQuestionContent}
            <div className="volo-question-list">{topQuestionList}</div>
          </section>

          <section className="volo-question-group" aria-label="Posted questions">
            <div className="volo-question-group-head">
              <h3>Posted Questions</h3>
              <span>{recentQuestions.length}</span>
            </div>
            <div className="volo-question-list">{postedQuestionList}</div>
          </section>
        </aside>

        {composeOpen && (
          <section className="volo-compose" aria-label="Create a volo post">
            <textarea
              name="volo-input-text"
              className="volo-input volo-text"
              rows={4}
              placeholder="What's happening?"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />

            <div className="volo-tools">
              <button type="button" className="volo-tool-btn" onClick={() => setLinks((prev) => [...prev, ""])}>
                <FiLink />
                <span>Add link</span>
              </button>
              <button type="button" className="volo-tool-btn" onClick={() => setMedia((prev) => [...prev, newMediaField("image")])}>
                <FiImage />
                <span>Add image</span>
              </button>
              <button type="button" className="volo-tool-btn" onClick={() => setMedia((prev) => [...prev, newMediaField("video")])}>
                <FiVideo />
                <span>Add video</span>
              </button>
            </div>

            {links.length > 0 && (
              <div className="volo-field-list">
                {links.map((value, index) => (
                  <div key={`volo-link-${index}`} className="volo-inline-field">
                    <FiLink aria-hidden="true" />
                    <input
                      name={`volo-link-${index}`}
                      type="url"
                      className="volo-input"
                      placeholder="https://example.com"
                      value={value}
                      onChange={(event) => updateLink(index, event.target.value)}
                    />
                    <button type="button" className="volo-icon-btn" onClick={() => removeLink(index)} aria-label="Remove link">
                      <FiX />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {media.length > 0 && (
              <div className="volo-field-list">
                {media.map((item) => (
                  <div key={item.id} className="volo-inline-field">
                    {item.type === "video" ? <FiVideo aria-hidden="true" /> : <FiImage aria-hidden="true" />}
                    <input
                      name={`volo-media-${item.id}`}
                      type="url"
                      className="volo-input"
                      placeholder={item.type === "video" ? "Video URL" : "Image URL"}
                      value={item.url}
                      onChange={(event) => updateMediaUrl(item.id, event.target.value)}
                    />
                    <button type="button" className="volo-icon-btn" onClick={() => removeMediaField(item.id)} aria-label="Remove media">
                      <FiX />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="volo-compose-actions">
              <button type="button" className="volo-btn ghost" onClick={clearDraft}>
                <FiTrash2 />
                <span>Clear</span>
              </button>
              <button type="button" className="volo-btn primary" onClick={submitVolo} disabled={!canPost}>
                {submitState === "posted" ? <FiCheck /> : <FiSend />}
                <span>{submitState === "posted" ? "Posted" : "Post Volo"}</span>
              </button>
            </div>
          </section>
        )}

        <section className="volo-feed" aria-label="Volo timeline">
          {volos.length === 0 && <p className="volo-empty">No volos yet. Create your first one.</p>}
          {volos.map((volo) => {
            const isQuestion = String(volo?.entryType || "post").toLowerCase() === "question";
            const answers = Array.isArray(volo?.answers) ? volo.answers : [];
            const answerCount = Math.max(answers.length, Number(volo?.answerCount || 0) || 0);
            const ownerKey = ownerKeyForVolo(volo);
            const ownerProfile = ownerKey ? ownerProfiles[ownerKey] : null;
            const ownerName =
              normalizeText(ownerProfile?.name) ||
              normalizeText(volo?.owner?.name) ||
              normalizeText(volo?.owner?.username) ||
              normalizeText(volo?.owner?.email) ||
              "User";
            const ownerUsername = normalizeText(ownerProfile?.username) || normalizeText(volo?.owner?.username);
            const ownerAvatar =
              normalizeAvatarUrl(ownerProfile?.profilePicUrl) ||
              normalizeAvatarUrl(volo?.owner?.profilePicUrl || volo?.owner?.profilePic) ||
              "/default-avatar.png";
            const profileTarget = buildProfilePath(
              ownerUsername || volo?.owner?.userId || volo?.owner?.email || "me"
            );
            const isMine = Boolean(identity?.userId && volo?.owner?.userId && identity.userId === volo.owner.userId);
            return (
              <article key={volo.id} className="volo-card">
                <header className="volo-card-head">
                  <div className="volo-owner-row">
                    <img
                      src={ownerAvatar}
                      alt={ownerName}
                      className="volo-owner-avatar"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = "/default-avatar.png";
                      }}
                    />
                    <div className="volo-owner-meta">
                      <Link className="volo-owner" to={profileTarget}>
                        {ownerName}
                      </Link>
                      {isQuestion && <span className="volo-question-pill">Question</span>}
                      {isMine && <span className="volo-me">You</span>}
                    </div>
                  </div>
                  <time className="volo-time">{formatVoloTime(volo.createdAt)}</time>
                </header>
                {volo.text && <p className={`volo-copy ${isQuestion ? "volo-copy-question" : ""}`}>{volo.text}</p>}
                {!isQuestion && Array.isArray(volo.links) && volo.links.length > 0 && (
                  <div className="volo-links">
                    {volo.links.map((url) => (
                      <a key={`${volo.id}-${url}`} href={url} target="_blank" rel="noreferrer">
                        {url}
                      </a>
                    ))}
                  </div>
                )}
                {!isQuestion && Array.isArray(volo.media) && volo.media.length > 0 && (
                  <div className="volo-media">
                    {volo.media.map((asset, index) =>
                      asset.type === "video" ? (
                        <video
                          key={`${volo.id}-video-${index}`}
                          src={asset.url}
                          controls
                          preload="metadata"
                          playsInline
                        />
                      ) : (
                        <img key={`${volo.id}-image-${index}`} src={asset.url} alt="Volo attachment" loading="lazy" />
                      )
                    )}
                  </div>
                )}
                {isQuestion && (
                  <div className="volo-answers-wrap">
                    <p className="volo-answer-count">{answerCount} answers</p>
                    {answers.length > 0 ? (
                      <div className="volo-answer-list">
                        {answers.map((answer) => {
                          const answerOwner =
                            normalizeText(answer?.owner?.name) ||
                            normalizeText(answer?.owner?.username) ||
                            normalizeText(answer?.owner?.email) ||
                            "User";
                          return (
                            <div key={answer.id} className="volo-answer-item">
                              <b>{answerOwner}:</b>
                              <span>{answer?.text || ""}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="volo-answer-empty">No answers yet. Be the first to answer.</p>
                    )}
                    <div className="volo-answer-compose">
                      <input
                        name={`volo-answer-${volo.id}`}
                        type="text"
                        className="volo-input"
                        placeholder="Write your answer..."
                        value={String(answerDrafts[volo.id] || "")}
                        onChange={(event) =>
                          setAnswerDrafts((prev) => ({ ...prev, [volo.id]: event.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="volo-btn primary"
                        onClick={() => submitAnswer(volo.id)}
                        disabled={!String(answerDrafts[volo.id] || "").trim()}
                      >
                        <FiSend />
                        <span>Answer</span>
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>

      <div className="volo-fab-wrap">
        <button
          type="button"
          className={`volo-fab ${composeOpen ? "is-open" : ""}`}
          onClick={() => {
            setComposeOpen((prev) => !prev);
            setQuestionPanelOpen(false);
          }}
          aria-expanded={composeOpen}
          aria-label={composeOpen ? "Hide Volo composer" : "Show Volo composer"}
        >
          <FiPlus />
        </button>
      </div>
    </div>
  );
}
