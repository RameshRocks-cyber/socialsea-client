import { useEffect, useState } from "react"

export default function Admin() {
  const [users, setUsers] = useState([])
  const [posts, setPosts] = useState([])

  useEffect(() => {
    fetch("http://localhost:8081/api/admin/users", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    })
      .then(res => res.json())
      .then(setUsers)

    fetch("http://localhost:8081/api/admin/posts", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    })
      .then(res => res.json())
      .then(setPosts)
  }, [])

  function ban(id) {
    fetch(`http://localhost:8081/api/admin/users/${id}/ban`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    })
  }

  function del(id) {
    fetch(`http://localhost:8081/api/admin/posts/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    })
  }

  const token = localStorage.getItem("token")
  if (!token) return null

  const user = JSON.parse(atob(token.split(".")[1]))
  if (user.role !== "ADMIN") return null

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
          <img src={`http://localhost:8081${p.mediaUrl}`} width="100" alt="" />
          <button onClick={() => del(p.id)}>Delete</button>
        </div>
      ))}
    </div>
  )
}