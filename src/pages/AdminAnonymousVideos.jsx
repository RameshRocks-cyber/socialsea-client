import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { formatDateTime, getCreatedAt, getPostLikes, getPostViews } from "../admin/adminMetrics";
import { resolveMediaUrl } from "../utils/mediaUrl";

const STATUS_ENDPOINTS = [
  { status: "pending", url: "/api/admin/anonymous/pending" },
  { status: "approved", url: "/api/admin/anonymous/approved" },
  { status: "rejected", url: "/api/admin/anonymous/rejected" }
];

const VIDEO_URL_HINT_REGEX = /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)(\?|#|$)/i;

const readStatus = (post, fallbackStatus = "pending") => {
  if (post?.rejected === true) return "rejected";
  if (post?.approved === true) return "approved";
  return fallbackStatus;
};

const isVideoAnonymousPost = (post) => {
  if (!post || typeof post !== "object") return false;
  const type = String(post?.type || post?.mediaType || post?.contentType || "").toLowerCase();
  if (type.includes("video")) return true;
  const url = String(post?.contentUrl || post?.mediaUrl || post?.videoUrl || "").toLowerCase();
  if (!url) return false;
  if (url.includes("/video/upload/")) return true;
  return VIDEO_URL_HINT_REGEX.test(url);
};

const normalizeAnonymousVideo = (post, fallbackStatus = "pending") => {
  if (!isVideoAnonymousPost(post)) return null;
  const idText = String(post?.id || "").trim();
  if (!idText) return null;
  return {
    ...post,
    id: idText,
    status: readStatus(post, fallbackStatus),
    contentUrl: String(post?.contentUrl || post?.mediaUrl || post?.videoUrl || "").trim(),
    description: String(post?.description || post?.content || post?.caption || "").trim(),
    likeCount: Number(post?.likeCount ?? post?.likesCount ?? post?.likes ?? 0) || 0,
    viewCount: Number(post?.viewCount ?? post?.viewsCount ?? post?.views ?? 0) || 0,
    createdAt: getCreatedAt(post)
  };
};

const statusBadgeClass = (status) => {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
};

const statusLabel = (status) => {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
};

const statusSortScore = (status) => {
  if (status === "pending") return 0;
  if (status === "approved") return 1;
  return 2;
};

export default function AdminAnonymousVideos() {
  const [videos, setVideos] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadVideos = async () => {
    setLoading(true);
    setError("");

    const responses = await Promise.allSettled(
      STATUS_ENDPOINTS.map((entry) =>
        api.get(entry.url, {
          suppressAuthRedirect: true,
          timeout: 12000
        })
      )
    );

    const byId = new Map();
    let successCount = 0;

    responses.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      successCount += 1;
      const fallbackStatus = STATUS_ENDPOINTS[index]?.status || "pending";
      const list = Array.isArray(result.value?.data) ? result.value.data : [];
      list.forEach((item) => {
        const normalized = normalizeAnonymousVideo(item, fallbackStatus);
        if (!normalized) return;
        const existing = byId.get(normalized.id);
        if (!existing || statusSortScore(normalized.status) < statusSortScore(existing.status)) {
          byId.set(normalized.id, normalized);
        }
      });
    });

    const sorted = Array.from(byId.values()).sort((a, b) => {
      const aDate = new Date(a?.createdAt || 0).getTime();
      const bDate = new Date(b?.createdAt || 0).getTime();
      if (Number.isFinite(bDate - aDate) && bDate !== aDate) return bDate - aDate;
      return Number(b.id) - Number(a.id);
    });

    setVideos(sorted);
    if (successCount === 0) setError("Failed to load anonymous videos.");
    setLoading(false);
  };

  useEffect(() => {
    void loadVideos();
  }, []);

  const filteredVideos = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return videos.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!q) return true;
      const searchable = `${item.id} ${item.description} ${item.status} ${item.contentUrl}`.toLowerCase();
      return searchable.includes(q);
    });
  }, [videos, query, statusFilter]);

  const stats = useMemo(() => {
    return videos.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "pending") acc.pending += 1;
        if (item.status === "approved") acc.approved += 1;
        if (item.status === "rejected") acc.rejected += 1;
        acc.likes += getPostLikes(item);
        acc.views += getPostViews(item);
        return acc;
      },
      { total: 0, pending: 0, approved: 0, rejected: 0, likes: 0, views: 0 }
    );
  }, [videos]);

  return (
    <section className="admin-page-grid">
      <section className="admin-stat-grid">
        <div className="admin-stat-card admin-stat-card-static">
          <p>Anonymous Videos</p>
          <h3>{stats.total}</h3>
          <span>Uploaded in anonymous section</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Pending Review</p>
          <h3>{stats.pending}</h3>
          <span>Need approval action</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Approved</p>
          <h3>{stats.approved}</h3>
          <span>Visible in anonymous feed</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Rejected</p>
          <h3>{stats.rejected}</h3>
          <span>Hidden from feed</span>
        </div>
      </section>

      <section className="admin-table-panel">
        <header className="admin-table-head admin-table-head-stack">
          <div>
            <h3>Anonymous Video Uploads</h3>
            <p className="admin-head-note">Review all uploaded anonymous videos across pending, approved and rejected states.</p>
            <p className="admin-head-meta">Showing {filteredVideos.length} of {videos.length} videos</p>
          </div>
          <input name="adminanonymousvideos-input-175"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by id, caption, URL or status"
          />
          <div className="admin-row-actions">
            <button
              type="button"
              className={`admin-btn ${statusFilter === "all" ? "success" : "ghost"}`}
              onClick={() => setStatusFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`admin-btn ${statusFilter === "pending" ? "warning" : "ghost"}`}
              onClick={() => setStatusFilter("pending")}
            >
              Pending
            </button>
            <button
              type="button"
              className={`admin-btn ${statusFilter === "approved" ? "success" : "ghost"}`}
              onClick={() => setStatusFilter("approved")}
            >
              Approved
            </button>
            <button
              type="button"
              className={`admin-btn ${statusFilter === "rejected" ? "danger" : "ghost"}`}
              onClick={() => setStatusFilter("rejected")}
            >
              Rejected
            </button>
            <button type="button" className="admin-link-btn" onClick={() => void loadVideos()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>

        {error && <p className="admin-error">{error}</p>}
        {!error && loading && <p className="admin-head-note">Loading anonymous videos...</p>}

        <div className="admin-anon-grid">
          {filteredVideos.map((item) => (
            <article key={item.id} className="admin-anon-card">
              <div className="admin-anon-media">
                {item.contentUrl ? (
                  <video src={resolveMediaUrl(item.contentUrl)} controls preload="metadata" />
                ) : (
                  <span>No media</span>
                )}
              </div>
              <div className="admin-anon-body">
                <p>
                  <strong>ID:</strong> #{item.id}
                </p>
                <p>
                  <strong>Status:</strong>{" "}
                  <span className={`admin-badge ${statusBadgeClass(item.status)}`}>{statusLabel(item.status)}</span>
                </p>
                <p>
                  <strong>Caption:</strong> {item.description || "No description"}
                </p>
                <p>
                  <strong>Engagement:</strong> {getPostViews(item)} views | {getPostLikes(item)} likes
                </p>
                <p>
                  <strong>Uploaded:</strong> {formatDateTime(item.createdAt)}
                </p>
                <div className="admin-anon-actions">
                  <a className="admin-link-btn" href={resolveMediaUrl(item.contentUrl)} target="_blank" rel="noreferrer">
                    Open video
                  </a>
                </div>
              </div>
            </article>
          ))}
          {!loading && !error && filteredVideos.length === 0 && <p className="admin-empty">No anonymous videos found.</p>}
        </div>
      </section>
    </section>
  );
}

