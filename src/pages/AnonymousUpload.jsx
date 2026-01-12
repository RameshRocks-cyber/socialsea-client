import { useState } from "react";

export default function AnonymousUpload() {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");

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

      if (!res.ok) throw new Error();

      setMessage("Upload successful ✅");
      setTitle("");
      setFile(null);
    } catch (err) {
      setMessage("Upload failed ❌");
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Anonymous Upload</h2>

      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />

      <br /><br />

      <input
        type="file"
        onChange={e => setFile(e.target.files[0])}
      />

      <br /><br />

      <button onClick={handleUpload}>Upload</button>

      <p>{message}</p>
    </div>
  );
}
