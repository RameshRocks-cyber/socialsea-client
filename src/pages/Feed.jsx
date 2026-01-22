import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

/* ---------- Follow Stats Component ---------- */
function FollowStats({ username }) {
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);

  useEffect(() => {
    api.get(`/api/follow/${username}/followers`)
      .then(res => setFollowers(res.data))
      .catch(console.error);

    api.get(`/api/follow/${username}/following`)
      .then(res => setFollowing(res.data))
      .catch(console.error);
  }, [username]);

  return (
    <div style={{ fontSize: 13, color: "#aaa" }}>
      <b>{followers}</b> followers · <b>{following}</b> following
    </div>
  );
}

/* ---------- MAIN FEED ---------- */
export default function Feed() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    api.get("/api/posts")
      .then(res => setPosts(res.data))
      .catch(console.error);
  }, []);

  function likePost(postId) {
    api.post(`/api/likes/${postId}`)
      .catch(console.error);
  }

  function followUser(username) {
    api.post(`/api/follow/${username}`)
      .catch(console.error);
  }

  function unfollowUser(username) {
    api.delete(`/api/follow/${username}`)
      .catch(console.error);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#000", minHeight: "100vh", color: "white" }}>
      <nav style={{ width: "100%", padding: "15px", borderBottom: "1px solid #363636", display: "flex", justifyContent: "center", gap: 20, marginBottom: 20, position: "sticky", top: 0, background: "#000", zIndex: 10 }}>
        <Link to="/" style={styles.navLink}>🏠 Home</Link>
        <Link to="/reels" style={styles.navLink}>🎥 Reels</Link>
        <Link to="/upload" style={styles.navLink}>➕ Create</Link>
        <Link to="/notifications" style={styles.navLink}>❤️ Notifications</Link>
        <Link to="/anonymous-feed" style={styles.navLink}>🕵️ Anon</Link>
        <Link to="/anonymous-upload" style={styles.navLink}>📤 Anon Upload</Link>
        <Link to="/login" style={styles.navLink}>Login</Link>
      </nav>

      <div style={{ width: 400 }}>
        {posts.length === 0 && (
          <p style={{ color: "#aaa" }}>No posts yet</p>
        )}

        {posts.map(post => (
          <div key={post.id} style={styles.card}>
            {/* Header */}
            <div style={styles.header}>
              <Link to={`/profile/${post.username}`} style={{ color: "white", textDecoration: "none" }}>
                {post.username}
              </Link>
            </div>

            {/* Media */}
            {post.mediaUrl && (
              <img
                src={post.mediaUrl.startsWith("http") ? post.mediaUrl : `${import.meta.env.VITE_API_BASE}${post.mediaUrl}`}
                alt=""
                style={styles.image}
              />
            )}

            {/* Actions */}
            <div style={styles.actions}>
              <span onClick={() => likePost(post.id)}>❤️</span>
            </div>

            {/* Caption */}
            <p style={{ padding: "0 10px" }}>
              <b>{post.username}</b> {post.content}
            </p>

            {/* Follow */}
            <div style={{ padding: "0 10px 10px" }}>
              <FollowStats username={post.username} />

              <button onClick={() => followUser(post.username)}>
                Follow
              </button>

              <button
                onClick={() => unfollowUser(post.username)}
                style={{ marginLeft: 8 }}
              >
                Unfollow
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- STYLES ---------- */
const styles = {
  card: {
    borderBottom: "1px solid #262626",
    borderRadius: 8,
    marginBottom: 20,
    background: "#000",
    color: "#fff",
    paddingBottom: 20
  },
  header: {
    padding: 10,
    fontWeight: "bold"
  },
  image: {
    width: "100%"
  },
  actions: {
    padding: 10,
    fontSize: 20,
    cursor: "pointer"
  },
  navLink: {
    color: "white",
    textDecoration: "none",
    fontSize: "14px"
  }
};
