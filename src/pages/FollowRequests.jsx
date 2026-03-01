import { useEffect, useState } from "react";
import api from "../api/axios";

export default function FollowRequests() {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    api.get("/api/follow/requests")
      .then((res) => setRequests(Array.isArray(res.data) ? res.data : []))
      .catch(console.error);
  }, []);

  const accept = (id) => {
    api.post(`/api/follow/requests/${id}/accept`)
      .then(() => {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      })
      .catch(console.error);
  };

  const reject = (id) => {
    api.post(`/api/follow/requests/${id}/reject`)
      .then(() => {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      })
      .catch(console.error);
  };

  return (
    <div className="pt-28 text-white p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl mb-4 font-bold">Follow Requests</h2>

      {requests.length === 0 && <p>No pending requests.</p>}

      {requests.map((r) => (
        <div key={r.id} className="flex justify-between items-center mb-4 bg-white/5 p-4 rounded-xl">
          <span className="font-semibold">{r.sender?.username || "User"}</span>

          <div className="flex gap-2">
            <button onClick={() => accept(r.id)} className="bg-green-600 px-3 py-1 rounded hover:bg-green-700 transition">
              Accept
            </button>
            <button onClick={() => reject(r.id)} className="bg-red-600 px-3 py-1 rounded hover:bg-red-700 transition">
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}