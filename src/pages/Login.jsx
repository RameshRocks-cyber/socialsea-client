import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import api from "../api/axios"
import { successToast, errorToast } from "../utils/toast.js"

export default function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const navigate = useNavigate()

  useEffect(() => {
    console.log("VITE_API_URL:", import.meta.env.VITE_API_URL)
    console.log("Axios baseURL:", api.defaults.baseURL)
    api.get("/health")
      .then(res => console.log("Health:", res.data))
      .catch(err => console.error("Health Check Failed:", err))
  }, [])

  const login = async () => {
    try {
      const res = await api.post("/auth/login", { email: username, password })
      localStorage.setItem("accessToken", res.data.accessToken)
      localStorage.setItem("refreshToken", res.data.refreshToken)
      localStorage.setItem("role", res.data.role)
      localStorage.setItem("auth", JSON.stringify({
        role: res.data.role,
        permissions: res.data.permissions
      }))
      successToast("Logged in successfully 🎉")
      navigate("/")
    } catch (err) {
      console.error(err)
      if (err.response) {
        console.log("Status:", err.response.status)
        console.log("Data:", err.response.data)
      }
      console.log("Request Headers:", err.config?.headers)
      errorToast("Login failed")
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.box}>
        <h1 style={styles.logo}>SocialSea</h1>
        
        <input 
          onChange={e => setUsername(e.target.value)} 
          placeholder="Phone number, username, or email" 
          style={styles.input}
        />
        <input 
          type="password" 
          onChange={e => setPassword(e.target.value)} 
          placeholder="Password" 
          style={styles.input}
        />
        
        <button onClick={login} style={styles.button}>Log in</button>
      </div>

      <div style={styles.box}>
        <p style={styles.text}>
          Don't have an account? <Link to="/register" style={styles.link}>Sign up</Link>
        </p>
      </div>

      <div style={{ display: "flex", gap: 20, marginBlockStart: 20 }}>
        <Link to="/anonymous-feed" style={{ color: "#8e8e8e", textDecoration: "none", fontSize: "14px" }}>Anonymous Feed</Link>
        <Link to="/anonymous-upload" style={{ color: "#8e8e8e", textDecoration: "none", fontSize: "14px" }}>Anonymous Upload</Link>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minBlockSize: "100vh",
    backgroundColor: "#000",
    color: "#fff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    padding: "10px"
  },
  box: {
    border: "1px solid #363636",
    backgroundColor: "#000",
    padding: "20px",
    inlineSize: "100%",
    maxInlineSize: "350px",
    marginBlockEnd: "10px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxSizing: "border-box"
  },
  logo: {
    fontSize: "3rem",
    marginBlockEnd: "30px",
    marginBlockStart: "0",
    fontFamily: "cursive"
  },
  input: {
    inlineSize: "100%",
    padding: "9px 8px",
    marginBlockEnd: "6px",
    backgroundColor: "#121212",
    border: "1px solid #363636",
    borderRadius: "3px",
    color: "#fff",
    fontSize: "12px",
    outline: "none",
    boxSizing: "border-box"
  },
  button: {
    inlineSize: "100%",
    backgroundColor: "#0095f6",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    padding: "7px 16px",
    fontWeight: "600",
    cursor: "pointer",
    marginBlockStart: "15px",
    fontSize: "14px"
  },
  text: {
    fontSize: "14px",
    margin: "15px 0"
  },
  link: {
    color: "#0095f6",
    textDecoration: "none",
    fontWeight: "600"
  }
}
