import { useState } from "react";
import { API_BASE_URL } from "../api/axios";

export default function Upload() {
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [msg, setMsg] = useState("");

  const upload = async () => {
    if (!file) {
      setMsg("File required");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("caption", caption);

    const res = await fetch(
      `${API_BASE_URL}/api/anonymous/upload`,
      {
        method: "POST",
        body: form
      }
    );

    const data = await res.json();
    setMsg(data.message);
  };

  return (
    <div>
      <h2>Anonymous Upload</h2>

      <input
        placeholder="Caption"
        value={caption}
        onChange={e => setCaption(e.target.value)}
      />

      <input
        type="file"
        onChange={e => setFile(e.target.files[0])}
      />

      <button onClick={upload}>Upload</button>

      {msg && <p>{msg}</p>}
    </div>
  );
}
