import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { buildProfilePath, persistProfileIdentity } from "../utils/profileRoute";

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
  const [preview, setPreview] = useState("");
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
        const completed = Boolean(p?.profileCompleted);
        const id = String(p?.id || localStorage.getItem("userId") || "");

        setUserId(id);
        setName(existingName);
        setBio(existingBio);
        setPreview(existingPic);
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
      if (userId) form.append("userId", userId);
      form.append("name", name);
      form.append("bio", bio || "");
      if (photo) form.append("profilePic", photo);

      const res = await api.post("/api/profile/setup", form);
      const savedProfile = res?.data?.user || res?.data || {};
      const savedId = String(savedProfile?.id || userId || localStorage.getItem("userId") || "me");
      persistProfileIdentity(savedProfile);
      localStorage.setItem("profileCompleted", "true");
      navigate(buildProfilePath(savedProfile, savedId), { replace: true });
    } catch (err) {
      const message = err?.response?.data?.message || "Failed to update profile";
      const serverSuggestions = err?.response?.data?.suggestions;
      setError(String(message));
      if (Array.isArray(serverSuggestions)) setSuggestions(serverSuggestions);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ maxWidth: 460, margin: "24px auto", padding: 16 }}>Loading profile...</div>;
  }

  return (
    <div style={{ maxWidth: 460, margin: "24px auto", padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>{isEditMode ? "Edit Profile" : "Create Profile"}</h2>
      <p style={{ marginTop: 0, opacity: 0.8 }}>{NAME_HINT}</p>

      <img
        src={preview || "/default-avatar.png"}
        alt="Profile preview"
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          objectFit: "cover",
          display: "block",
          marginBottom: 12
        }}
      />

      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          setPhoto(file);
          if (file) setPreview(URL.createObjectURL(file));
        }}
      />

      <input
        placeholder="username"
        value={name}
        onChange={(e) => setName(normalizeUsernameInput(e.target.value))}
        style={{ width: "100%", marginTop: 12, padding: 10, boxSizing: "border-box" }}
      />

      <div style={{ minHeight: 24, marginTop: 6 }}>
        {!nameValid && !!name && <small style={{ color: "#f66" }}>{NAME_HINT}</small>}
        {nameValid && checkingName && <small>Checking username...</small>}
        {nameValid && !checkingName && nameAvailable === true && <small style={{ color: "#56d364" }}>Username available</small>}
        {nameValid && !checkingName && nameAvailable === false && <small style={{ color: "#f66" }}>Username already taken</small>}
      </div>

      {suggestions.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setName(s)}
              style={{ padding: "6px 10px", borderRadius: 14, border: "1px solid #355", background: "transparent", cursor: "pointer" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <textarea
        placeholder="bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        style={{ width: "100%", marginTop: 8, minHeight: 90, padding: 10, boxSizing: "border-box" }}
      />

      {error && <p style={{ color: "#f66", marginTop: 8 }}>{error}</p>}

      <button
        onClick={submit}
        disabled={saving || !nameValid || nameAvailable === false || checkingName}
        style={{ marginTop: 10, padding: "10px 14px", cursor: "pointer" }}
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
