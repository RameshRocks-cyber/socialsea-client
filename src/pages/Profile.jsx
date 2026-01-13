import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

export default function Profile() {
  console.log("Profile component rendering");
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    console.log("Profile page mounted for:", username);
    setError("");
    setProfile(null);

    fetch(`http://localhost:8081/api/profile/${username}`)
      .then(async res => {
        if (!res.ok) {
          throw new Error("User not found");
        }
        return res.json();
      })
      .then(data => {
        console.log("Profile data:", data);
        setProfile(data);
      })
      .catch(err => {
        console.error(err);
        setError("User not found");
      });

    fetch(`http://localhost:8081/api/profile/${username}/posts`)
      .then(res => res.json())
      .then(data => {
        console.log("Posts data:", data);
        setPosts(Array.isArray(data) ? data : []);
      })
      .catch(console.error);
  }, [username]);

  function follow() {
    fetch(`http://localhost:8081/api/follow/${username}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    });
  }

  function unfollow() {
    fetch(`http://localhost:8081/api/follow/${username}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    });
  }

  return (
    <div style={{ padding: 20, color: "white", background: "#000", minHeight: "100vh" }}>
      <nav style={{ marginBottom: 20, display: "flex", gap: 20 }}>
        <Link to="/" style={{ color: "white" }}>Feed</Link>
        <Link to="/upload" style={{ color: "white" }}>Upload</Link>
        <Link to="/reels" style={{ color: "white" }}>Reels</Link>
        <Link to="/notifications" style={{ color: "white" }}>Notifications</Link>
        <Link to="/login" style={{ color: "white" }}>Login</Link>
        <Link to="/register" style={{ color: "white" }}>Create Account</Link>
      </nav>

      {error && <div>{error}</div>}
      {!error && !profile && <div>Loading...</div>}

      {!error && profile && (
        <>
      {/* Profile Header */}
      <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "#333"
          }}
        />

        <div>
          <h2>{profile.username}</h2>

          <p style={{ margin: "10px 0" }}>
            <b>{profile.followers}</b> followers ·{" "}
            <b>{profile.following}</b> following
          </p>

          <button style={btn} onClick={follow}>Follow</button>
          <button
            style={{ ...btn, background: "#555", marginLeft: 10 }}
            onClick={unfollow}
          >
            Unfollow
          </button>
        </div>
      </div>

      <hr style={{ margin: "20px 0", borderColor: "#262626" }} />

      {/* Posts Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 3
        }}
      >
        {posts.map(p => (
          <img
            key={p.id}
            src={`http://localhost:8081${p.mediaUrl}`}
            alt=""
            style={{ width: "100%" }}
          />
        ))}
      </div>
        </>
      )}
    </div>
  );
}

/* ---------- Styles ---------- */
const btn = {
  background: "#0095f6",
  border: "none",
  padding: "6px 14px",
  color: "white",
  borderRadius: 6,
  cursor: "pointer"
};
