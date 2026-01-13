import { useState, useEffect } from "react"
import { Link } from "react-router-dom"

export default function Upload() {
  const [file, setFile] = useState(null)
  const [reel, setReel] = useState(false)
  const [msg, setMsg] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    console.log("Upload component mounted")
  }, [])

  const upload = async () => {
    if (!file) {
      setMsg("File required")
      return
    }

    setLoading(true)
    setMsg("")

    try {
      const form = new FormData()
      form.append("file", file)
      form.append("reel", reel)

      const token = localStorage.getItem("token")
      if (!token) throw new Error("Not logged in")

      const res = await fetch("http://localhost:8081/api/posts/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: form
      })

      if (res.ok) {
        setMsg("Upload success")
        setFile(null)
        setReel(false)
      } else {
        const text = await res.text()
        setMsg(`Upload failed: ${text || res.status}`)
      }
    } catch (e) {
      console.error(e)
      setMsg(`Error uploading: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 20, color: "white", background: "#000", minHeight: "100vh" }}>
      <Link to="/" style={{ color: "white", display: "block", marginBottom: 20 }}>&larr; Back to Feed</Link>
      <h2>Upload Post</h2>
      
      <div style={{ marginBottom: 20 }}>
        <input type="file" onChange={e => setFile(e.target.files[0])} style={{ color: "white" }} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={reel}
            onChange={e => setReel(e.target.checked)}
            style={{ width: 20, height: 20 }}
          />
          <span>Upload as Reel</span>
        </label>
      </div>

      <button 
        onClick={upload} 
        disabled={loading}
        style={{ 
          padding: "10px 20px", 
          background: loading ? "#ccc" : "white", 
          color: "black", 
          border: "none", 
          borderRadius: 5, 
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        {loading ? "Uploading..." : "Upload"}
      </button>
      
      {msg && (
        <p style={{ marginTop: 20, color: msg.includes("success") ? "#4caf50" : "#f44336" }}>
          {msg}
          {msg.includes("Not logged in") && <Link to="/login" style={{ marginLeft: 10, color: "white", textDecoration: "underline" }}>Login here</Link>}
        </p>
      )}
    </div>
  )
}
