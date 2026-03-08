import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import {
  formatDateTime,
  getCreatedAt,
  getPostComments,
  getPostLikes,
  getPostOwner,
  getPostType,
  getPostViews,
  loadModerationNotices,
  saveModerationNotice
} from "../admin/adminMetrics";

export default function AdminPosts() {
  const [posts, setPosts] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busyByPostId, setBusyByPostId] = useState({});
  const [noticeTextByPostId, setNoticeTextByPostId] = useState({});
  const [notices, setNotices] = useState([]);

  const normalizePostList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.posts)) return payload.posts;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const toAdminPostShape = (post) => ({
    ...post,
    description: post?.description || post?.caption || post?.content || "",
    contentUrl: post?.contentUrl || post?.mediaUrl || post?.imageUrl || post?.videoUrl || "",
    mediaUrl: post?.mediaUrl || post?.contentUrl || post?.imageUrl || post?.videoUrl || "",
    approved: post?.approved ?? true
  });
  const isValidPost = (post) => {
    if (!post || typeof post !== "object") return false;
    const hasId = post.id !== undefined && post.id !== null && `${post.id}`.trim() !== "";
    const hasMedia = Boolean(post.mediaUrl || post.contentUrl || post.imageUrl || post.videoUrl);
    return hasId && hasMedia;
  };

  const dedupePosts = (list) => {
    const byId = new Map();
    for (const post of list) {
      byId.set(String(post.id), post);
    }
    return Array.from(byId.values());
  };

  const loadPosts = async () => {
    setError("");

    const defaultBase = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
    const baseCandidates = [
      defaultBase,
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "https://socialsea.co.in"
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);

    const endpointCandidates = ["/api/admin/posts", "/api/feed"];

    let bestPosts = [];
    let lastError = null;

    for (const base of baseCandidates) {
      for (const endpoint of endpointCandidates) {
        try {
          const res = await api.get(endpoint, {
            baseURL: base,
            skipAuth: true,
            suppressAuthRedirect: true,
            skipRefresh: true
          });

          const list = dedupePosts(normalizePostList(res?.data).map(toAdminPostShape).filter(isValidPost));
          if (list.length > bestPosts.length) {
            bestPosts = list;
          }
        } catch (err) {
          lastError = err;
        }
      }
    }

    setPosts(bestPosts);

    if (bestPosts.length === 0 && lastError) {
      console.error(lastError);
      const status = lastError?.response?.status;
      const message = lastError?.response?.data?.message || lastError?.message || "Failed to load posts";
      setError(status ? `Failed to load posts (${status}): ${message}` : `Failed to load posts: ${message}`);
      return;
    }

    setError("");
  };

  useEffect(() => {
    loadPosts();
    setNotices(loadModerationNotices());
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return posts;
    const q = query.toLowerCase();
    return posts.filter((post) =>
      `${post?.id || ""} ${getPostOwner(post)} ${post?.email || ""} ${getPostType(post)} ${post?.description || post?.content || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [posts, query]);

  const noticeCountByPostId = useMemo(() => {
    return notices.reduce((acc, item) => {
      if (item.targetType !== "post") return acc;
      acc[item.targetId] = (acc[item.targetId] || 0) + 1;
      return acc;
    }, {});
  }, [notices]);

  const latestNoticeByPostId = useMemo(() => {
    return notices.reduce((acc, item) => {
      if (item.targetType !== "post" || acc[item.targetId]) return acc;
      acc[item.targetId] = item;
      return acc;
    }, {});
  }, [notices]);

  const issueNotice = (post, severity) => {
    const message = String(noticeTextByPostId[post.id] || "").trim() || (severity === "yellow" ? "Post requires review." : "Post flagged for urgent moderation.");
    const next = saveModerationNotice({
      id: `${severity}-post-${post.id}-${Date.now()}`,
      targetType: "post",
      targetId: post.id,
      targetLabel: `Post #${post.id}`,
      severity,
      message,
      createdAt: new Date().toISOString()
    });
    setNotices(next);
    setNoticeTextByPostId((prev) => ({ ...prev, [post.id]: "" }));
  };

  const removePost = async (post) => {
    setBusyByPostId((prev) => ({ ...prev, [post.id]: true }));
    try {
      await api.delete(`/api/admin/posts/${post.id}`);
      issueNotice(post, "red");
      setPosts((prev) => prev.filter((item) => item.id !== post.id));
    } catch (err) {
      console.error(err);
      setError("Failed to remove post");
    } finally {
      setBusyByPostId((prev) => ({ ...prev, [post.id]: false }));
    }
  };

  const totals = useMemo(() => {
    return posts.reduce(
      (acc, post) => {
        acc.likes += getPostLikes(post);
        acc.comments += getPostComments(post);
        acc.views += getPostViews(post);
        return acc;
      },
      { likes: 0, comments: 0, views: 0 }
    );
  }, [posts]);

  return (
    <section className="admin-page-grid">
      <section className="admin-stat-grid">
        <div className="admin-stat-card admin-stat-card-static">
          <p>Tracked Posts</p>
          <h3>{posts.length}</h3>
          <span>{posts.filter((post) => post?.approved === false).length} pending approval</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Total Likes</p>
          <h3>{totals.likes}</h3>
          <span>Across admin post results</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Total Comments</p>
          <h3>{totals.comments}</h3>
          <span>Conversation volume</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Total Views</p>
          <h3>{totals.views}</h3>
          <span>Audience reach signal</span>
        </div>
      </section>

      <section className="admin-table-panel">
        <header className="admin-table-head admin-table-head-stack">
          <div>
            <h3>Post Monitor</h3>
            <p className="admin-head-note">Search any post, inspect engagement and take moderation action.</p>
            <p className="admin-head-meta">Showing {filtered.length} of {posts.length} posts</p>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search post id, owner, type or caption"
          />
        </header>

        {error && <p className="admin-error">{error}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table admin-table-rich">
            <thead>
              <tr>
                <th>Post</th>
                <th>Owner</th>
                <th>Type</th>
                <th>Engagement</th>
                <th>Status</th>
                <th>Created</th>
                <th>Moderation</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((post) => {
                const busy = !!busyByPostId[post.id];
                const latestNotice = latestNoticeByPostId[post.id];
                const noticeCount = noticeCountByPostId[post.id] || 0;
                const mediaHref = post.contentUrl || post.mediaUrl || "";

                return (
                  <tr key={post.id}>
                    <td>
                      <div className="admin-entity-cell">
                        <strong>#{post.id}</strong>
                        <span>{post.description || post.content || "No caption"}</span>
                        {mediaHref && (
                          <a href={mediaHref} target="_blank" rel="noreferrer">
                            Open media
                          </a>
                        )}
                      </div>
                    </td>
                    <td>{getPostOwner(post)}</td>
                    <td>{getPostType(post)}</td>
                    <td>
                      <div className="admin-entity-cell">
                        <strong>{getPostViews(post)} views</strong>
                        <span>{getPostLikes(post)} likes | {getPostComments(post)} comments</span>
                      </div>
                    </td>
                    <td>
                      <div className="admin-entity-cell">
                        <span className={`admin-badge ${post.approved === false ? "warning" : "success"}`}>
                          {post.approved === false ? "Needs review" : "Live"}
                        </span>
                        <span>{noticeCount} notice(s)</span>
                      </div>
                    </td>
                    <td>{formatDateTime(getCreatedAt(post))}</td>
                    <td>
                      <div className="admin-action-stack">
                        <textarea
                          value={noticeTextByPostId[post.id] || ""}
                          onChange={(e) => setNoticeTextByPostId((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          placeholder="Write a moderation note"
                          rows={2}
                        />
                        {latestNotice && <span className="admin-inline-note">{latestNotice.severity.toUpperCase()} | {latestNotice.message}</span>}
                        <div className="admin-row-actions">
                          <button type="button" className="admin-btn warning" onClick={() => issueNotice(post, "yellow")}>
                            Yellow Notice
                          </button>
                          <button type="button" className="admin-btn danger" onClick={() => issueNotice(post, "red")}>
                            Red Notice
                          </button>
                          <button type="button" className="admin-btn ghost" onClick={() => removePost(post)} disabled={busy}>
                            {busy ? "Removing..." : "Remove post"}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!error && filtered.length === 0 && <p className="admin-empty">No posts found.</p>}
      </section>
    </section>
  );
}





