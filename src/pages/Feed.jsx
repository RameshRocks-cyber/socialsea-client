import { useEffect, useState } from "react";
import { getFeed, getAnonymousFeed } from "../api/feed";

const Feed = () => {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    // Fetch both the main feed and anonymous feed
    Promise.all([getFeed(), getAnonymousFeed()])
      .then(([mainRes, anonRes]) => {
        // Combine the data from both responses
        const allPosts = [...mainRes.data, ...anonRes.data];
        // Optional: Sort posts by ID (descending) to show newest first
        // allPosts.sort((a, b) => b.id - a.id);
        setPosts(allPosts);
      })
      .catch((err) => console.error("Failed to fetch feed:", err));
  }, []);

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h2>Feed</h2>
      {posts.map((post) => (
        <div key={post.id} className="post">
          <strong>{post.username || "Anonymous"}</strong>
          <p>{post.content}</p>

          {/* Render media only if URL exists */}
          {post.contentUrl && (
            post.contentUrl.endsWith(".mp4") ? (
              <video
                src={post.contentUrl}
                controls
                style={{ maxWidth: "100%", borderRadius: "8px" }}
              />
            ) : (
              <img
                src={post.contentUrl}
                alt="Post"
                style={{ maxWidth: "100%", borderRadius: "8px" }}
              />
            )
          )}
        </div>
      ))}
    </div>
  );
};

export default Feed;
