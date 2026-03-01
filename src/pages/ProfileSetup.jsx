import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

export default function ProfileSetup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);

  const isProfileComplete = (profile) => {
    const explicit = Boolean(profile?.profileCompleted);
    const hasName = Boolean(String(profile?.name || "").trim());
    const hasPic = Boolean(String(profile?.profilePic || profile?.profilePicUrl || "").trim());
    return explicit || hasName || hasPic;
  };

  useEffect(() => {
    api.get("/api/profile/me")
      .then((res) => {
        const completed = isProfileComplete(res?.data);
        if (completed) {
          const targetId = res?.data?.id || localStorage.getItem("userId");
          navigate(`/profile/${targetId || "me"}`, { replace: true });
        }
      })
      .catch(() => {});
  }, [navigate]);

  const submit = async () => {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      alert("User not logged in properly. Please login again.");
      return;
    }

    const form = new FormData();
    form.append("userId", userId);
    form.append("name", name);
    form.append("bio", bio);
    if (photo) form.append("profilePic", photo);

    await api.post("/api/profile/setup", form);
    localStorage.setItem("profileCompleted", "true");
    alert("Profile updated!");
    navigate(`/profile/${userId}`);
  };

  return (
    <div style={{ maxWidth: 400, margin: "auto", textAlign: "center" }}>
      <h2>Complete Your Profile</h2>

      {/* Profile Preview */}
      <img
        src={preview || "/avatar.png"}
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          objectFit: "cover",
          marginBottom: 10,
        }}
      />

      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files[0];
          setPhoto(file);
          setPreview(URL.createObjectURL(file));
        }}
      />

      <input
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: "100%", marginTop: 10 }}
      />

      <textarea
        placeholder="Your bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        style={{ width: "100%", marginTop: 10 }}
      />

      <button onClick={submit} style={{ marginTop: 10 }}>
        Save
      </button>
    </div>
  );
}
