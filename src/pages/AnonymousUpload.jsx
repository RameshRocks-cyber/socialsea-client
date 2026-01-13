import { useState, useRef } from "react";
import { Link } from "react-router-dom";

export default function AnonymousUpload() {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef(null);

  const handleUpload = async () => {
    if (!title || !file) {
      setMessage("Title and file required ❗");
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("file", file);

    try {
      const res = await fetch(
        "http://localhost:8081/api/anonymous/upload",
        {
          method: "POST",
          body: formData
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      setMessage("Upload successful ✅");
      setTitle("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error(err);
      setMessage("Upload failed ❌ " + (err.message || ""));
    }
  };

  return (
    <div style={{ padding: 20, background: "#000", minHeight: "100vh", color: "white" }}>
      <nav style={{ marginBottom: 20, display: "flex", gap: 20 }}>
        <Link to="/anonymous-feed" style={{ color: "white" }}>Anonymous Videos</Link>
        <Link to="/anonymous-upload" style={{ color: "white" }}>Upload</Link>
        <Link to="/login" style={{ color: "white" }}>Login</Link>
      </nav>

      <h2>Anonymous Upload</h2>

      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={{ display: "block", marginBottom: 20, padding: 10, width: "100%", maxWidth: 400, background: "#121212", border: "1px solid #363636", color: "white", borderRadius: 4 }}
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={e => setFile(e.target.files[0])}
      />

      <br /><br />

      <button onClick={handleUpload}>Upload</button>

      <p>{message}</p>
    </div>
  );
}
