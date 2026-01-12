import { useEffect, useState } from "react";

export default function AnonymousFeed() {
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    fetch("http://localhost:8081/api/anonymous/feed")
      .then(res => res.json())
      .then(setVideos)
      .catch(console.error);
  }, []);

  function likeVideo(id) {
    fetch(`http://localhost:8081/api/anonymous/like/${id}`, {
      method: "POST"
    });
  }

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ color: "white" }}>Anonymous Videos</h2>

      {videos.length === 0 && (
        <p style={{ color: "#aaa" }}>No videos yet</p>
      )}

      {videos.map(v => (
        <div
          key={v.id}
          style={{
            maxWidth: 400,
            marginBottom: 40,
            borderRadius: 12,
            overflow: "hidden",
            background: "#000"
          }}
        >
          {/* Video */}
          <video
            src={`http://localhost:8081${v.videoUrl}`}
            controls
            style={{ width: "100%" }}
          />

          {/* Actions */}
          <div style={{ padding: 10 }}>
            <button
              onClick={() => likeVideo(v.id)}
              style={{
                background: "none",
                color: "white",
                border: "none",
                fontSize: 18,
                cursor: "pointer"
              }}
            >
              ❤️ Like
            </button>
          </div>

          {/* Comment box */}
          <input
            placeholder="Add a comment..."
            style={{
              background: "#000",
              border: "none",
              borderTop: "1px solid #262626",
              color: "white",
              padding: 10,
              width: "100%",
              outline: "none"
            }}
          />
        </div>
      ))}
    </div>
  );
}
