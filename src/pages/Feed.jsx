import { useEffect, useState } from "react";

/* ---------- Follow Stats Component ---------- */
function FollowStats({ username }) {
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);

  useEffect(() => {
    fetch(`http://localhost:8081/api/follow/${username}/followers`)
      .then(res => res.text())
      .then(setFollowers);

    fetch(`http://localhost:8081/api/follow/${username}/following`)
      .then(res => res.text())
      .then(setFollowing);
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
    fetch("http://localhost:8081/api/posts", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    })
      .then(res => res.json())
      .then(setPosts)
      .catch(console.error);
  }, []);

  function likePost(postId) {
    fetch(`http://localhost:8081/api/likes/${postId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    });
  }

  function followUser(username) {
    fetch(`http://localhost:8081/api/follow/${username}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    });
  }

  function unfollowUser(username) {
    fetch(`http://localhost:8081/api/follow/${username}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    });
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
      <div style={{ width: 400 }}>
        {posts.length === 0 && (
          <p style={{ color: "#aaa" }}>No posts yet</p>
        )}

        {posts.map(post => (
          <div key={post.id} style={styles.card}>
            {/* Header */}
            <div style={styles.header}>{post.username}</div>

            {/* Media */}
            {post.mediaUrl && (
              <img
                src={`http://localhost:8081${post.mediaUrl}`}
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
    border: "1px solid #262626",
    borderRadius: 8,
    marginBottom: 20,
    background: "#000",
    color: "#fff"
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
  }
};
