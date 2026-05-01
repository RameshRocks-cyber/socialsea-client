import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { buildProfilePath, persistProfileIdentity } from "../utils/profileRoute";
import "./ProfileSetup.css";

const NAME_HINT = "3-20 chars: lowercase letters, numbers, dot, underscore";
const AVATAR_OUTPUT_PX = 512;
const COVER_OUTPUT_MAX_WIDTH_PX = 1280;
const COVER_ASPECT_RATIO = 52 / 21; // matches Profile cover frame (520px wide, 210px tall)

const normalizeUsernameInput = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 20);

function guessOutputExtension(mimeType) {
  const t = String(mimeType || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("bmp")) return "bmp";
  return "jpg";
}

function isHeicLikeFile(file) {
  if (!file) return false;
  const type = String(file?.type || "").trim().toLowerCase();
  if (type.includes("heic") || type.includes("heif")) return true;
  const name = String(file?.name || "").trim().toLowerCase();
  return /\.(heic|heif)$/i.test(name);
}

async function convertHeicToJpegFile(file) {
  const mod = await import("heic2any");
  const heic2any = mod?.default || mod;
  if (typeof heic2any !== "function") throw new Error("HEIC converter not available");

  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!(blob instanceof Blob) || blob.size <= 0) throw new Error("HEIC conversion failed");

  const originalName = String(file?.name || "image").replace(/\.[a-z0-9]+$/i, "");
  return new File([blob], `${originalName}.jpg`, {
    type: blob.type || "image/jpeg",
    lastModified: Date.now(),
  });
}

async function decodeImageSource(file) {
  if (!file) throw new Error("Missing file");

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, revoke: () => bitmap.close?.() };
    } catch {
      try {
        const bitmap = await createImageBitmap(file);
        return { source: bitmap, width: bitmap.width, height: bitmap.height, revoke: () => bitmap.close?.() };
      } catch {
        // fall back to <img>
      }
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode image"));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, revoke: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function computeCenteredCropRect(srcW, srcH, targetAspect) {
  const w = Number(srcW || 0);
  const h = Number(srcH || 0);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }
  const srcAspect = w / h;
  if (srcAspect > targetAspect) {
    const sw = h * targetAspect;
    return { sx: (w - sw) / 2, sy: 0, sw, sh: h };
  }
  const sh = w / targetAspect;
  return { sx: 0, sy: (h - sh) / 2, sw: w, sh };
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    if (!canvas) return resolve(null);
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
      return;
    }
    try {
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const [header, base64] = String(dataUrl || "").split(",");
      const match = /data:([^;]+);base64/i.exec(header || "");
      const type = match?.[1] || "image/png";
      const bin = atob(base64 || "");
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      resolve(new Blob([bytes], { type }));
    } catch {
      resolve(null);
    }
  });
}

async function cropImageFileToAspect(file, aspectRatio, outputWidthPx, outputMime = "image/jpeg") {
  const inputFile = isHeicLikeFile(file) ? await convertHeicToJpegFile(file) : file;
  const decoded = await decodeImageSource(inputFile);
  try {
    const rect = computeCenteredCropRect(decoded.width, decoded.height, aspectRatio);
    if (!rect.sw || !rect.sh) throw new Error("Invalid crop rect");

    const outW = Math.max(1, Math.round(Number(outputWidthPx) || rect.sw));
    const outH = Math.max(1, Math.round(outW / aspectRatio));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Canvas not supported");

    // Avoid black background when encoding to JPEG.
    if (outputMime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
    }

    ctx.drawImage(decoded.source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, outW, outH);

    const blob = await canvasToBlob(canvas, outputMime, 0.92);
    if (!blob) throw new Error("Failed to encode image");

    const originalName = String(file?.name || "image").replace(/\.[a-z0-9]+$/i, "");
    const ext = guessOutputExtension(blob.type || outputMime);
    const outName = `${originalName}.cropped.${ext}`;
    return new File([blob], outName, { type: blob.type || outputMime, lastModified: Date.now() });
  } finally {
    decoded.revoke?.();
  }
}

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
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [coverProcessing, setCoverProcessing] = useState(false);
  const processingTokenRef = useRef({ photo: 0, cover: 0 });

  const nameValid = useMemo(() => /^[a-z0-9._]{3,20}$/.test(name), [name]);

  useEffect(() => {
    if (!preview || typeof preview !== "string" || !preview.startsWith("blob:")) return undefined;
    return () => {
      try {
        URL.revokeObjectURL(preview);
      } catch {
        // ignore revoke failures
      }
    };
  }, [preview]);

  useEffect(() => {
    if (!coverPreview || typeof coverPreview !== "string" || !coverPreview.startsWith("blob:")) return undefined;
    return () => {
      try {
        URL.revokeObjectURL(coverPreview);
      } catch {
        // ignore revoke failures
      }
    };
  }, [coverPreview]);

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
              {photoProcessing ? "Processing..." : "Choose file"}
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0] || null;
                  if (!file) {
                    setPhoto(null);
                    return;
                  }

                  setPhoto(file);
                  setPreview(URL.createObjectURL(file));

                  const token = (processingTokenRef.current.photo += 1);
                  setPhotoProcessing(true);
                  try {
                    const processed = await cropImageFileToAspect(file, 1, AVATAR_OUTPUT_PX, "image/jpeg");
                    if (processingTokenRef.current.photo !== token) return;
                    setPhoto(processed);
                    setPreview(URL.createObjectURL(processed));
                  } catch {
                    // keep original file/preview
                  } finally {
                    if (processingTokenRef.current.photo === token) setPhotoProcessing(false);
                  }
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
            {coverProcessing ? "Processing..." : "Choose cover"}
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0] || null;
                if (!file) {
                  setCoverPhoto(null);
                  return;
                }

                setCoverPhoto(file);
                setCoverPreview(URL.createObjectURL(file));

                const token = (processingTokenRef.current.cover += 1);
                setCoverProcessing(true);
                try {
                  const processed = await cropImageFileToAspect(
                    file,
                    COVER_ASPECT_RATIO,
                    COVER_OUTPUT_MAX_WIDTH_PX,
                    "image/jpeg"
                  );
                  if (processingTokenRef.current.cover !== token) return;
                  setCoverPhoto(processed);
                  setCoverPreview(URL.createObjectURL(processed));
                } catch {
                  // keep original file/preview
                } finally {
                  if (processingTokenRef.current.cover === token) setCoverProcessing(false);
                }
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
