import { useState } from "react";
import api from "../api/axios";

export default function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = async () => {
    const res = await api.post("/auth/admin/login", { email, password });
    localStorage.setItem("token", res.data.token);
    onLogin();
  };

  return (
    <div>
      <h2>Admin Login</h2>
      <input placeholder="Email" onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
      <button onClick={login}>Login</button>
    </div>
  );
}