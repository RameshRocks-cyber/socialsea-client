import React, { useState } from "react";
import { uploadAnonymousPost } from "../api/anonymous";

const AnonymousUpload = () => {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState("");
  const [upiId, setUpiId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const parseError = (err) => {
    const data = err?.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      if (typeof data.message === "string" && data.message.trim()) return data.message;
      try {
        return JSON.stringify(data);
      } catch {
        return "Anonymous upload failed";
      }
    }
    if (typeof err?.message === "string" && err.message.trim()) return err.message;
    return "Anonymous upload failed";
  };

  const onSubmit = async () => {
    if (!file) {
      setMsg("File is required");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("description", description || "");

    try {
      setLoading(true);
      setMsg("");
      await uploadAnonymousPost(form);
      setMsg("Uploaded anonymously. Waiting for admin approval.");
      setFile(null);
      setDescription("");
      setUpiId("");
      setAccountNumber("");
      setIfscCode("");
    } catch (err) {
      setMsg(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Anonymous Upload</h1>
        <p style={styles.subtitle}>Share your thoughts privately. No identity stored.</p>

        <label style={styles.uploadBox}>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ display: "none" }}
          />
          {file ? file.name : "Click to choose a file"}
        </label>

        <textarea
          placeholder="Write something (optional)..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={styles.textarea}
        />

        <input
          type="text"
          placeholder="UPI ID (optional)"
          value={upiId}
          onChange={(e) => setUpiId(e.target.value)}
          style={styles.input}
        />

        <input
          type="text"
          placeholder="Bank Account Number (optional)"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          style={styles.input}
        />

        <input
          type="text"
          placeholder="IFSC Code (optional)"
          value={ifscCode}
          onChange={(e) => setIfscCode(e.target.value)}
          style={styles.input}
        />

        <button style={styles.button} onClick={onSubmit} disabled={loading}>
          {loading ? "Uploading..." : "Upload Anonymously"}
        </button>

        {msg ? <p style={styles.msg}>{msg}</p> : null}
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  card: {
    background: "rgba(255,255,255,0.08)",
    backdropFilter: "blur(15px)",
    padding: "40px",
    borderRadius: "20px",
    width: "400px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    textAlign: "center",
    color: "white"
  },
  title: {
    marginBottom: "10px",
    fontSize: "28px"
  },
  subtitle: {
    fontSize: "14px",
    marginBottom: "25px",
    opacity: 0.8
  },
  uploadBox: {
    display: "block",
    padding: "15px",
    border: "2px dashed #00c6ff",
    borderRadius: "12px",
    marginBottom: "20px",
    cursor: "pointer",
    transition: "0.3s"
  },
  textarea: {
    width: "100%",
    height: "100px",
    borderRadius: "10px",
    border: "none",
    padding: "10px",
    marginBottom: "20px",
    resize: "none"
  },
  input: {
    width: "100%",
    padding: "10px",
    marginBottom: "15px",
    borderRadius: "10px",
    border: "none",
    outline: "none"
  },
  button: {
    width: "100%",
    padding: "12px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(90deg, #00c6ff, #0072ff)",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "0.3s"
  },
  msg: {
    marginTop: "12px",
    fontSize: "14px",
    color: "#dce9ff"
  }
};

export default AnonymousUpload;
