import { useQuery } from "@tanstack/react-query";
import { getFeedPosts, getAnonymousFeedPosts } from "../api/feed";
import { feedPageQueryKey } from "../api/queryKeys";

const Feed = () => {
  const { data: posts = [], isPending, error } = useQuery({
    queryKey: feedPageQueryKey(),
    queryFn: async () => {
      const [mainPosts, anonymousPosts] = await Promise.all([
        getFeedPosts(),
        getAnonymousFeedPosts()
      ]);
      return [...mainPosts, ...anonymousPosts];
    },
    staleTime: 60_000,
    retry: 1
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2>Feed</h2>
      {isPending && <p>Loading feed...</p>}
      {error && <p>Failed to fetch feed.</p>}
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
