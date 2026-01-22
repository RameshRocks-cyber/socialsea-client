import { useEffect, useState } from "react";
import api from "../api/axios";

export default function Feed() {
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    api.get("/health")
      .then(() => setStatus("Backend connected ✅"))
      .catch(() => setStatus("Backend not reachable ❌"));
  }, []);

  return <h2>{status}</h2>;
}