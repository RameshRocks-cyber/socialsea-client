import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

export default function Profile() {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    fetch(`http://localhost:8081/api/profile/${username}`)
      .then(res => res.json())
      .then(setProfile);

    fetch(`http://localhost:8081/api/profile/${username}/posts`)
      .then(res => res.json())
      .then(setPosts);
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

  if (!profile) return <p>Loading...</p>;

  return (
    <div style={{ padding: 20 }}>
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
