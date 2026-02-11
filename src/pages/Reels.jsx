import { useEffect, useState } from "react";
import api from "../api/axios";

export default function Reels() {
  const [reels, setReels] = useState([]);

  useEffect(() => {
    api.get("/api/reels")
      .then(res => setReels(res.data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        overflowY: "scroll",
        scrollSnapType: "y mandatory"
      }}
    >
      {reels.map(reel => (
        <video
          key={reel.id}
          src={`${import.meta.env.VITE_API_BASE_URL}${reel.mediaUrl}`}
          autoPlay
          loop
          muted
          controls={false}
          style={{
            height: "100vh",
            width: "100%",
            objectFit: "cover",
            scrollSnapAlign: "start"
          }}
        />
      ))}
    </div>
  );
}
