import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { buildProfilePath, persistProfileIdentity } from "../utils/profileRoute";
import "./ProfileSetup.css";

const NAME_HINT = "3-20 chars: lowercase letters, numbers, dot, underscore";

const normalizeUsernameInput = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 20);

export default function ProfileSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get("mode") === "edit";

  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [photo, setPhoto] = useState(null);
  const [coverPhoto, setCoverPhoto] = useState(null);
  const [preview, setPreview] = useState("");
  const [coverPreview, setCoverPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nameAvailable, setNameAvailable] = useState(null);
  const [checkingName, setCheckingName] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const nameValid = useMemo(() => /^[a-z0-9._]{3,20}$/.test(name), [name]);

  useEffect(() => {
    let active = true;

    api
      .get("/api/profile/me")
      .then((res) => {
        if (!active) return;
        const p = res?.data || {};
        const existingName = normalizeUsernameInput(p?.name || "");
        const existingBio = String(p?.bio || "");
        const existingPic = String(p?.profilePicUrl || p?.profilePic || "");
        const existingCover = String(p?.coverUrl || p?.coverPhotoUrl || p?.profileCoverUrl || "");
        const completed =
          Boolean(p?.profileCompleted) ||
          Boolean(existingName) ||
          Boolean(existingBio.trim()) ||
          Boolean(existingPic) ||
          Boolean(existingCover);
        const id = String(p?.id || localStorage.getItem("userId") || "");

        setUserId(id);
        setName(existingName);
        setBio(existingBio);
        setPreview(existingPic);
        setCoverPreview(existingCover);
        persistProfileIdentity(p);

        if (completed && !isEditMode) {
          navigate(buildProfilePath(p, id), { replace: true });
          return;
        }
      })
      .catch(() => {
        if (active) setError("Failed to load your profile");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isEditMode, navigate]);

  useEffect(() => {
    if (!name.trim()) {
      setNameAvailable(null);
      setSuggestions([]);
      return;
    }
    if (!nameValid) {
      setNameAvailable(false);
      setSuggestions([]);
      return;
    }

    let active = true;
    setCheckingName(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get("/api/profile/name/check", { params: { name } });
        if (!active) return;
        setNameAvailable(Boolean(res?.data?.available));
        setSuggestions(Array.isArray(res?.data?.suggestions) ? res.data.suggestions : []);
      } catch {
        if (!active) return;
        setNameAvailable(null);
        setSuggestions([]);
      } finally {
        if (active) setCheckingName(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [name, nameValid]);

  const submit = async () => {
    setError("");
    if (!nameValid) {
      setError(NAME_HINT);
      return;
    }
    if (nameAvailable === false) {
      setError("Username is taken. Pick one from suggestions.");
      return;
    }

    setSaving(true);
    try {
      const form = new FormData();
      // backend resolves current user from auth; only send userId when strictly numeric
      const safeUserId = String(userId || "").trim();
      if (/^\d+$/.test(safeUserId)) form.append("userId", safeUserId);
      form.append("name", name);
      form.append("bio", bio || "");
      if (photo) form.append("profilePic", photo);
      if (coverPhoto) {
        ["coverPhoto", "cover", "coverImage"].forEach((key) => form.append(key, coverPhoto));
      }

      const res = await api.post("/api/profile/setup", form);
      const savedProfile = res?.data?.user || res?.data || {};
      const savedId = String(savedProfile?.id || userId || localStorage.getItem("userId") || "me");
      persistProfileIdentity(savedProfile);
      localStorage.setItem("profileCompleted", "true");
      if (coverPhoto) {
        const bust = String(Date.now());
        sessionStorage.setItem("profile_cover_bust", bust);
        localStorage.setItem("profile_cover_bust", bust);
      }
      localStorage.removeItem("socialsea_profile_cache_v1");
      navigate(buildProfilePath(savedProfile, savedId), { replace: true });
    } catch (err) {
      const payload = err?.response?.data;
      const message =
        payload?.message ||
        payload?.error ||
        (typeof payload === "string" ? payload : "") ||
        "Failed to update profile";
      const serverSuggestions = err?.response?.data?.suggestions;
      setError(String(message));
      if (Array.isArray(serverSuggestions)) setSuggestions(serverSuggestions);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="profile-setup loading">Loading profile...</div>;
  }

  return (
    <div className="profile-setup">
      <div className="profile-setup-card">
        <h2>{isEditMode ? "Edit Profile" : "Create Profile"}</h2>
        <p className="hint">{NAME_HINT}</p>

        <div className="avatar-row">
          <img
            src={preview || "/default-avatar.png"}
            alt="Profile preview"
            className="avatar-preview"
          />
          <div>
            <label className="field-label">Profile photo</label>
            <label className="file-btn">
              Choose file
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setPhoto(file);
                  if (file) setPreview(URL.createObjectURL(file));
                }}
              />
            </label>
          </div>
        </div>

        <div className="cover-block">
          <label className="field-label">Cover photo</label>
          {coverPreview ? (
            <img
              src={coverPreview}
              alt="Cover preview"
              className="cover-preview"
            />
          ) : null}
          <label className="file-btn">
            Choose cover
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setCoverPhoto(file);
                if (file) setCoverPreview(URL.createObjectURL(file));
              }}
            />
          </label>
        </div>

        <label className="field-label">Username</label>
        <input
          className="text-input"
          placeholder="username"
          value={name}
          onChange={(e) => setName(normalizeUsernameInput(e.target.value))}
        />

        <div className="status-row">
          {!nameValid && !!name && <small className="error-text">{NAME_HINT}</small>}
          {nameValid && checkingName && <small className="muted-text">Checking username...</small>}
          {nameValid && !checkingName && nameAvailable === true && <small className="ok-text">Username available</small>}
          {nameValid && !checkingName && nameAvailable === false && <small className="error-text">Username already taken</small>}
        </div>

        {suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setName(s)}
                className="chip"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <label className="field-label">Bio</label>
        <textarea
          className="text-area"
          placeholder="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />

        {error && <p className="error-text">{error}</p>}

        <button
          onClick={submit}
          disabled={saving || !nameValid || nameAvailable === false || checkingName}
          className="primary-btn"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
