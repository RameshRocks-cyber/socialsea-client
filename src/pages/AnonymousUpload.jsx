import React, { useState } from "react";

const AnonymousUpload = () => {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState("");
  const [upiId, setUpiId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>🕶 Anonymous Upload</h1>
        <p style={styles.subtitle}>
          Share your thoughts privately. No identity stored.
        </p>

        <label style={styles.uploadBox}>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
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

        <button style={styles.button}>
          🚀 Upload Anonymously
        </button>
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
    alignItems: "center",
  },
  card: {
    background: "rgba(255,255,255,0.08)",
    backdropFilter: "blur(15px)",
    padding: "40px",
    borderRadius: "20px",
    width: "400px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    textAlign: "center",
    color: "white",
  },
  title: {
    marginBottom: "10px",
    fontSize: "28px",
  },
  subtitle: {
    fontSize: "14px",
    marginBottom: "25px",
    opacity: 0.8,
  },
  uploadBox: {
    display: "block",
    padding: "15px",
    border: "2px dashed #00c6ff",
    borderRadius: "12px",
    marginBottom: "20px",
    cursor: "pointer",
    transition: "0.3s",
  },
  textarea: {
    width: "100%",
    height: "100px",
    borderRadius: "10px",
    border: "none",
    padding: "10px",
    marginBottom: "20px",
    resize: "none",
  },
  input: {
    width: "100%",
    padding: "10px",
    marginBottom: "15px",
    borderRadius: "10px",
    border: "none",
    outline: "none",
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
    transition: "0.3s",
  },
};

export default AnonymousUpload;