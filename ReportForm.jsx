import { useState } from "react";
import api from "../api/axios";

export default function ReportForm({ postId }) {
  const [reason, setReason] = useState("");

  const submit = async () => {
    await api.post(`/public/report/${postId}?reason=${encodeURIComponent(reason)}`);
    alert("Report submitted");
  };

  return (
    <div>
      <textarea onChange={e => setReason(e.target.value)} />
      <button onClick={submit}>Report</button>
    </div>
  );
}