import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";
import "./Profile.css";

export default function Profile() {
  const { username } = useParams();
  const myUserId = localStorage.getItem("userId");
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [loading, setLoading] = useState(false);
  const [requested] = useState(false);

  const isOwnProfile =
    username === "me" || Number(username) === Number(myUserId) || profile?.id === Number(myUserId);

  useEffect(() => {
    setError("");
    setProfile(null);

    if (!username) {
      setError("User not found");
      return;
    }

    api
      .get(`/api/profile/${username}`)
      .then((res) => {
        const data = res.data?.user || res.data;
        setProfile(data);
        setIsFollowing(Boolean(res.data?.isFollowing));
        setFollowers(Number(data?.followers ?? res.data?.followers ?? 0));
      })
      .catch((err) => {
        console.error(err);
        if (err?.response?.status === 401) {
          navigate("/login");
          return;
        }
        setError("User not found");
      });

    api
      .get(`/api/profile/${username}/posts`)
      .then((res) => setPosts(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error(err);
        setPosts([]);
      });
  }, [username, navigate]);

  const handleFollow = async () => {
    if (loading) return;
    setLoading(true);
    const method = isFollowing ? "DELETE" : "POST";

    try {
      await api({ method, url: `/api/follow/${username}` });
      setIsFollowing(!isFollowing);
      setFollowers((prev) => (isFollowing ? prev - 1 : prev + 1));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resolveMediaUrl = (url) => {
    if (!url) return "";
    return toApiUrl(url);
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
            <img src={profile.profilePicUrl || "/default-avatar.png"} alt="Profile" className="profile-pic" />

            <div className="profile-info">
              <h2 className="profile-name">{profile.name || profile.email || profile.username}</h2>
              <p className="bio">{profile.bio || "No bio yet"}</p>

              <p className="profile-stats">
                <b>{followers}</b> followers | <b>{profile.following}</b> following
              </p>

              {!isOwnProfile && (
                <div className="profile-actions">
                  <button
                    onClick={handleFollow}
                    disabled={loading}
                    className={`px-6 py-2 rounded-xl font-semibold ${isFollowing ? "bg-gray-600" : requested ? "bg-yellow-600" : "bg-blue-500"}`}
                  >
                    {loading ? "..." : isFollowing ? "Following" : requested ? "Requested" : "Follow"}
                  </button>
                </div>
              )}

              {isOwnProfile && (
                <div className="profile-actions-own">
                  <button className="profile-cta profile-cta-edit" onClick={() => navigate("/profile-setup")}>
                    Edit Profile
                  </button>
                  <button className="profile-cta profile-cta-upload" onClick={() => navigate("/upload")}>
                    Add Post
                  </button>
                  <button className="profile-cta profile-cta-settings" onClick={() => navigate("/settings")}>
                    Settings
                  </button>
                </div>
              )}
            </div>
          </section>

          {isOwnProfile && (
            <section className="profile-shortcuts">
              <button type="button" className="profile-shortcut-card" onClick={() => navigate("/anonymous/upload")}>
                <h4>Anonymous Upload</h4>
                <p>Share safely without exposing your profile identity.</p>
              </button>
              <button type="button" className="profile-shortcut-card" onClick={() => navigate("/anonymous-feed")}>
                <h4>Anonymous Feed</h4>
                <p>See all approved anonymous posts and interactions.</p>
              </button>
              <button type="button" className="profile-shortcut-card" onClick={() => navigate("/chat")}>
                <h4>Messages</h4>
                <p>Continue conversations and find people faster.</p>
              </button>
            </section>
          )}

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
