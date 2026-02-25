import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import "./Profile.css";

export default function Profile() {
  const { username: userIdFromUrl } = useParams();
  const myUserId = localStorage.getItem("userId");
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  const isOwnProfile = Number(userIdFromUrl) === Number(myUserId);

  useEffect(() => {
    setError("");
    setProfile(null);

    if (!userIdFromUrl) {
      setError("User not found");
      return;
    }

    api.get(`/api/profile/${userIdFromUrl}`)
      .then((res) => setProfile(res.data))
      .catch((err) => {
        console.error(err);
        setError("User not found");
      });

    api.get(`/api/profile/${userIdFromUrl}/posts`)
      .then((res) => setPosts(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error(err);
        setPosts([]);
      });
  }, [userIdFromUrl]);

  const follow = () => {
    if (!profile?.username) return;
    api.post(`/api/follow/${profile.username}`).catch(console.error);
  };

  const unfollow = () => {
    if (!profile?.username) return;
    api.delete(`/api/follow/${profile.username}`).catch(console.error);
  };

  const resolveMediaUrl = (url) => {
    if (!url) return "";
    return url.startsWith("http") ? url : `${import.meta.env.VITE_API_URL}${url}`;
  };

  const logout = () => {
    localStorage.clear();
    navigate("/login");
  };

  return (
    <div className="profile-page">
      {error && <div>{error}</div>}
      {!error && !profile && <div>Loading...</div>}

      {!error && profile && (
        <>
          <section className="profile-header">
            <img
              src={profile.profilePicUrl || "/default-avatar.png"}
              alt="Profile"
              className="profile-pic"
            />

            <div className="profile-info">
              <h2 className="profile-name">{profile.name || profile.email || profile.username}</h2>
              <p className="bio">{profile.bio || "No bio yet"}</p>

              <p className="profile-stats">
                <b>{profile.followers}</b> followers · <b>{profile.following}</b> following
              </p>

              {!isOwnProfile && (
                <div className="profile-actions">
                  <button className="follow-btn" onClick={follow}>Follow</button>
                  <button className="unfollow-btn" onClick={unfollow}>
                    Unfollow
                  </button>
                </div>
              )}

              {isOwnProfile && (
                <div className="profile-actions">
                  <button
                    className="edit-profile-btn"
                    onClick={() => navigate("/profile-setup")}
                  >
                    Edit Profile
                  </button>

                  <button
                    className="add-post-btn"
                    onClick={() => navigate("/post-upload")}
                  >
                    Add Post
                  </button>
                </div>
              )}
            </div>
          </section>

          <hr className="profile-divider" />

          <h3 className="profile-posts-title">Posts</h3>
          <div className="profile-posts-grid">
            {posts.length === 0 && <p>No posts yet</p>}
            {posts.map((post) => (
              <div key={post.id} className="profile-post-card">
                {post.type === "IMAGE" && post.contentUrl?.trim() && (
                  <img src={resolveMediaUrl(post.contentUrl)} alt="" />
                )}

                {post.type === "VIDEO" && post.contentUrl?.trim() && (
                  <video src={resolveMediaUrl(post.contentUrl)} controls />
                )}
              </div>
            ))}
          </div>

          {isOwnProfile && (
            <button className="logout-btn-profile" onClick={logout}>
              Logout
            </button>
          )}
        </>
      )}
    </div>
  );
}
