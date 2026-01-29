import { useEffect, useState } from "react";
import api from "./api/axios";

export default function ReportedPosts() {
  const [reports, setReports] = useState([]);

  useEffect(() => {
    api.get("/admin/reports").then(res => setReports(res.data));
  }, []);

  return (
    <>
      <div style={{ padding: "20px" }}>
        <h3>🚩 Reported Posts</h3>

        {reports.map((r) => (
          <div key={r.id} style={{ borderBlockEnd: "1px solid #ccc" }}>
            <p><strong>Reason:</strong> {r.reason}</p>
            <p>{r.postContent}</p>
          </div>
        ))}
      </div>
    </>
  );
}