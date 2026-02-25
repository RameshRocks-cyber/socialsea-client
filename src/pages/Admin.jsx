import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import api from "../api/axios"

export default function Admin() {
  const [users, setUsers] = useState([])
  const [posts, setPosts] = useState([])

  useEffect(() => {
    api.get("/api/admin/users")
      .then(res => setUsers(res.data))
      .catch(console.error)

    api.get("/api/admin/posts")
      .then(res => setPosts(res.data))
      .catch(console.error)
  }, [])

  function ban(id) {
    api.post(`/api/admin/users/${id}/ban`)
  }

  function del(id) {
    api.delete(`/api/admin/posts/${id}`)
  }

  const role = localStorage.getItem("role")
  if (role !== "ADMIN") {
    return <Navigate to="/home" />
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin Dashboard</h2>

      <h3>Users</h3>
      {users.map(u => (
        <div key={u.id}>
          {u.username} ({u.role})
          <button onClick={() => ban(u.id)}>Ban</button>
        </div>
      ))}

      <h3>Posts</h3>
      {posts.map(p => (
        <div key={p.id}>
          <img src={`${import.meta.env.VITE_API_URL}${p.mediaUrl}`} width="100" alt="" />
          <button onClick={() => del(p.id)}>Delete</button>
        </div>
      ))}
    </div>
  )
}