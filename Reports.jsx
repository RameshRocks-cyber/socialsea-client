import { useEffect, useState } from "react";
import api from "../api/axios";

export default function Reports() {
  const [reports, setReports] = useState([]);

  useEffect(() => {
    api.get("/admin/reports/pending")
       .then(res => setReports(res.data));
  }, []);

  const resolve = async (id) => {
    await api.post(`/admin/reports/resolve/${id}`);
    setReports(reports.filter(r => r.id !== id));
  };

  return (
    <div>
      <h3>Pending Reports</h3>
      {reports.map(r => (
        <div key={r.id}>
          <p>{r.reason}</p>
          <button onClick={() => resolve(r.id)}>Resolve</button>
        </div>
      ))}
    </div>
  );
}