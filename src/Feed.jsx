import { useState, useEffect } from 'react';
import api from './api/axios';

export default function Feed() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    api.get('/public/posts')
      .then(res => setPosts(res.data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div>
      <h2>Latest Posts</h2>
      {posts.map(post => (
        <div key={post.id} style={{ border: '1px solid #ddd', margin: '10px 0', padding: '10px' }}>
          <h3>{post.title}</h3>
          <p>{post.content}</p>
        </div>
      ))}
    </div>
  );
}