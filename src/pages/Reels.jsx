import { useEffect, useState } from "react";

export default function Reels() {
  const [reels, setReels] = useState([]);

  useEffect(() => {
    fetch("https://your-backend.onrender.com/api/reels")
      .then(res => res.json())
      .then(setReels)
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
          src={reel.mediaUrl}
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
