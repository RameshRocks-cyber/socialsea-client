import { useState } from "react";
import api from "../api/axios";

export default function AnonymousUpload() {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      alert("Please select a file");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "type",
      file.type.startsWith("video") ? "VIDEO" : "IMAGE"
    );
    const safeDescription = description?.trim() || " ";
    formData.append("description", safeDescription);

    try {
      setLoading(true);
      await api.post("/api/anonymous/upload", formData);
      alert("Uploaded successfully 🎉");
      setFile(null);
      setDescription("");
    } catch (err) {
      alert("Upload failed ❌");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxInlineSize: 400, margin: "auto", padding: 20, color: "white" }}>
      <h2>Anonymous Upload</h2>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="file"
          accept="image/*,video/*"
          onChange={(e) => setFile(e.target.files[0])}
        />

        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ color: "black", padding: 5 }}
        />

        <button type="submit" disabled={loading} style={{ padding: 10, cursor: "pointer" }}>
          {loading ? "Uploading..." : "Upload"}
        </button>
      </form>
    </div>
  );
}
