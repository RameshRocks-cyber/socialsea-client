import { useState } from "react"

export default function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const login = async () => {
    const res = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    })

    const token = await res.text()
    localStorage.setItem("token", token)
    alert("Login success")
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Login</h2>
      <input onChange={e => setUsername(e.target.value)} placeholder="Username" />
      <br /><br />
      <input type="password" onChange={e => setPassword(e.target.value)} placeholder="Password" />
      <br /><br />
      <button onClick={login}>Login</button>
    </div>
  )
}
