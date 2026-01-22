import { useEffect, useState } from "react";
import api from "../api/axios";

export default function Feed() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    api.get("/posts")
      .then(res => setPosts(res.data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div>
      {posts.length === 0 ? (
        <p>No posts yet</p>
      ) : (
        posts.map((p, i) => <p key={i}>{p}</p>)
      )}
    </div>
  );
}
