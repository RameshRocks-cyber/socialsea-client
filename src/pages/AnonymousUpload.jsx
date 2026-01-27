import { useState, useRef } from "react";
import { Link } from "react-router-dom";

export default function AnonymousUpload() {
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  const upload = async () => {
    try {
      const form = new FormData();
      form.append("caption", caption);
      form.append("file", file);

      const res = await fetch(
        import.meta.env.VITE_API_URL + "/api/anonymous/upload",
        {
          method: "POST",
          body: form, // ❌ DO NOT set headers manually
        }
      );

      const data = await res.json();
      console.log(data);
      alert("Uploaded for review ✅");
    } catch (err) {
      console.error(err);
      alert("Upload failed ❌");
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
        placeholder="Caption"
        value={caption}
        onChange={e => setCaption(e.target.value)}
        style={{ display: "block", marginBottom: 20, padding: 10, width: "100%", maxWidth: 400, background: "#121212", border: "1px solid #363636", color: "white", borderRadius: 4 }}
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={e => setFile(e.target.files[0])}
      />

      <br /><br />

      <button onClick={upload}>Upload</button>
    </div>
  );
}
