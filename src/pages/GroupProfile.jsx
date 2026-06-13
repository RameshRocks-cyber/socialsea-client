import { useEffect, useMemo, useRef, useState } from "react";
import { FiArrowLeft, FiCamera, FiChevronRight, FiClock, FiSave, FiUsers } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";
import { buildProfilePath } from "../utils/profileRoute";
import "./GroupProfile.css";

const normalizeAvatarImageSrc = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const pathOnly = raw.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0] || "";
  if (/^\/?api\/[a-z]{1,2}$/i.test(pathOnly)) return "";
  if (/^\/?[a-z]{1,2}$/i.test(pathOnly)) return "";
  return toApiUrl(raw);
};

const formatDate = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
};

export default function GroupProfile() {
  const { groupId: rawGroupId } = useParams();
  const groupId = String(rawGroupId || "").trim();
  const groupThreadId = groupId ? `group:${groupId}` : "";
  const navigate = useNavigate();
  const photoInputRef = useRef(null);

  const [group, setGroup] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [draftBio, setDraftBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [memberProfilesById, setMemberProfilesById] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const members = useMemo(() => (Array.isArray(group?.members) ? group.members : []), [group?.members]);
  const canEdit = Boolean(group?.canEdit);
  const avatarSrc = normalizeAvatarImageSrc(group?.profilePic || group?.profilePicUrl);
  const currentName = String(group?.name || "").trim();
  const currentBio = String(group?.bio || group?.description || "").trim();
  const titleName = currentName || "Group";

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      setError("Group not found");
      return undefined;
    }

    let cancelled = false;

    const loadGroup = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get(`/api/chat/groups/${encodeURIComponent(groupId)}`);
        if (cancelled) return;
        const nextGroup = res?.data || {};
        setGroup(nextGroup);
        setDraftName(String(nextGroup?.name || ""));
        setDraftBio(String(nextGroup?.bio || nextGroup?.description || ""));
      } catch (err) {
        if (cancelled) return;
        setGroup(null);
        setError(err?.response?.data?.message || "Could not load group profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadGroup();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!members.length) {
      setMemberProfilesById({});
      return undefined;
    }

    let cancelled = false;

    const loadMemberProfiles = async () => {
      const entries = await Promise.all(
        members.map(async (member) => {
          const memberKey = String(member?.id || "").trim();
          if (!memberKey) return null;

          try {
            const res = await api.get(`/api/profile/${encodeURIComponent(memberKey)}`);
            const profile = res?.data?.user || res?.data || {};
            return [
              memberKey,
              {
                username: String(profile?.username || member?.username || "").trim(),
                bio: String(profile?.bio || profile?.description || "").trim(),
                profilePic: String(profile?.profilePicUrl || profile?.profilePic || "").trim(),
                name: String(profile?.name || member?.name || "").trim()
              }
            ];
          } catch (err) {
            if (Number(err?.response?.status || 0) === 404) {
              return [
                memberKey,
                {
                  hidden: true
                }
              ];
            }
            return [
              memberKey,
              {
                username: String(member?.username || "").trim(),
                bio: String(member?.bio || member?.description || "").trim(),
                profilePic: String(member?.profilePic || "").trim(),
                name: String(member?.name || "").trim()
              }
            ];
          }
        })
      );

      if (cancelled) return;
      setMemberProfilesById(Object.fromEntries(entries.filter(Boolean)));
    };

    loadMemberProfiles();

    return () => {
      cancelled = true;
    };
  }, [members]);

  const openChat = () => {
    if (groupThreadId) {
      navigate(`/chat/${groupThreadId}`);
      return;
    }
    navigate("/chat");
  };

  const handleSave = async () => {
    if (!canEdit || !groupId) return;
    const nextName = draftName.trim();
    const nextBio = draftBio.trim();
    const payload = {};
    if (nextName !== currentName) payload.name = nextName;
    if (nextBio !== currentBio) payload.bio = nextBio;
    if (!Object.keys(payload).length) {
      setNotice("No changes to save");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await api.patch(`/api/chat/groups/${encodeURIComponent(groupId)}`, payload);
      const nextGroup = res?.data || {};
      setGroup(nextGroup);
      setDraftName(String(nextGroup?.name || ""));
      setDraftBio(String(nextGroup?.bio || nextGroup?.description || ""));
      setNotice("Group updated");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not update group.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoPicked = async (event) => {
    const file = event?.target?.files?.[0];
    if (event?.target) event.target.value = "";
    if (!file || !canEdit || !groupId) return;

    setPhotoSaving(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await api.post(`/api/chat/groups/${encodeURIComponent(groupId)}/photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const nextGroup = res?.data || {};
      setGroup(nextGroup);
      setDraftName(String(nextGroup?.name || ""));
      setDraftBio(String(nextGroup?.bio || nextGroup?.description || ""));
      setNotice("Photo updated");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not update photo.");
    } finally {
      setPhotoSaving(false);
    }
  };

  const openMemberProfile = (member) => {
    const targetPath = buildProfilePath(member);
    if (targetPath) navigate(targetPath);
  };

  const resolvedMembers = useMemo(
    () =>
      members.map((member) => {
        const memberKey = String(member?.id || "").trim();
        const profile = memberProfilesById[memberKey] || {};
        return {
          ...member,
          profile,
          hidden: Boolean(profile?.hidden)
        };
      }),
    [members, memberProfilesById]
  );
  const visibleMembers = useMemo(
    () => resolvedMembers.filter((member) => !member?.hidden),
    [resolvedMembers]
  );

  return (
    <div className="group-profile-page">
      <div className="group-profile-shell">
        <header className="group-profile-topbar">
          <button type="button" className="group-profile-topbar-button group-profile-back" onClick={openChat}>
            <FiArrowLeft />
            Back to chat
          </button>

          <div className="group-profile-topbar-copy">
            <span className="group-profile-kicker">Group profile</span>
            <h1>{titleName}</h1>
          </div>

          <button type="button" className="group-profile-topbar-button group-profile-chat-link" onClick={openChat}>
            Open chat
          </button>
        </header>

        {error && <div className="group-profile-alert">{error}</div>}

        {loading ? (
          <div className="group-profile-loading">Loading group profile...</div>
        ) : group ? (
          <>
            <section className="group-profile-hero">
              <div className="group-profile-hero-band" />
              <div className="group-profile-hero-body">
                <div className="group-profile-avatar-card">
                  <button
                    type="button"
                    className="group-profile-avatar-button"
                    onClick={() => {
                      if (canEdit) photoInputRef.current?.click();
                    }}
                    disabled={!canEdit || photoSaving}
                  >
                    {avatarSrc ? (
                      <img src={avatarSrc} alt={titleName} className="group-profile-avatar" />
                    ) : (
                      <span className="group-profile-avatar-fallback">{titleName.slice(0, 1).toUpperCase()}</span>
                    )}
                  </button>

                  {canEdit && (
                    <button
                      type="button"
                      className="group-profile-photo-btn"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoSaving}
                    >
                      <FiCamera />
                      {photoSaving ? "Uploading..." : "Change photo"}
                    </button>
                  )}

                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="group-profile-hidden-input"
                    onChange={handlePhotoPicked}
                  />
                </div>

                <div className="group-profile-copy">
                  {canEdit ? (
                    <input
                      className="group-profile-name-input"
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      maxLength={120}
                      placeholder="Group name"
                    />
                  ) : (
                    <h2 className="group-profile-name">{titleName}</h2>
                  )}

                  <div className="group-profile-meta-line">
                    <span className="group-profile-meta-item">
                      <FiUsers />
                      {visibleMembers.length} members
                    </span>
                    {group?.ownerName && <span className="group-profile-meta-item">Admin: {group.ownerName}</span>}
                    {group?.createdAt && (
                      <span className="group-profile-meta-item">
                        <FiClock />
                        Created {formatDate(group.createdAt)}
                      </span>
                    )}
                    {group?.lastAt && (
                      <span className="group-profile-meta-item">Latest activity {formatDate(group.lastAt)}</span>
                    )}
                  </div>

                  <div className="group-profile-bio-card">
                    <div className="group-profile-card-head">
                      <strong>Bio</strong>
                      {canEdit && <small>{draftBio.trim().length}/500</small>}
                    </div>

                    {canEdit ? (
                      <textarea
                        className="group-profile-bio-input"
                        rows={5}
                        maxLength={500}
                        placeholder="Write a group bio..."
                        value={draftBio}
                        onChange={(event) => setDraftBio(event.target.value)}
                      />
                    ) : (
                      <p className="group-profile-bio-text">{currentBio || "No group bio yet."}</p>
                    )}
                  </div>

                  {canEdit && (
                    <div className="group-profile-actions">
                      <button type="button" className="group-profile-save" onClick={handleSave} disabled={saving}>
                        <FiSave />
                        {saving ? "Saving..." : "Save changes"}
                      </button>
                    </div>
                  )}

                  {!!notice && <p className="group-profile-notice">{notice}</p>}
                </div>
              </div>
            </section>

            <section className="group-profile-section">
              <div className="group-profile-section-head">
                <div>
                  <h3>Members</h3>
                  <p>{visibleMembers.length} total</p>
                </div>
              </div>

              {visibleMembers.length === 0 ? (
                <p className="group-profile-empty">No members found.</p>
              ) : (
                <div className="group-profile-member-list">
                  {visibleMembers.map((member) => {
                    const memberUserId = String(member?.profile?.username || member?.username || member?.id || "").trim();
                    const memberName = String(member?.profile?.name || member?.name || memberUserId || "Member").trim() || "Member";
                    const memberBio = String(
                      member?.profile?.bio ||
                        member?.profile?.description ||
                        member?.bio ||
                        member?.description ||
                        ""
                    ).trim();
                    const memberPic = normalizeAvatarImageSrc(member?.profile?.profilePic || member?.profilePic);

                    return (
                      <button
                        key={String(member?.id || memberUserId || memberName)}
                        type="button"
                        className="group-profile-member-item"
                        onClick={() => openMemberProfile(member)}
                      >
                        <span className="group-profile-member-avatar">
                          {memberPic ? (
                            <img src={memberPic} alt={memberName} />
                          ) : (
                            memberName.slice(0, 1).toUpperCase()
                          )}
                        </span>

                        <span className="group-profile-member-meta">
                          <span className="group-profile-member-title-row">
                            <strong>
                              {memberName}
                              {member?.isAdmin && <span className="group-profile-member-role">Admin</span>}
                            </strong>
                            <FiChevronRight className="group-profile-member-arrow" />
                          </span>
                          {memberBio ? <small className="group-profile-member-bio">{memberBio}</small> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="group-profile-loading">No group profile available.</div>
        )}
      </div>
    </div>
  );
}
