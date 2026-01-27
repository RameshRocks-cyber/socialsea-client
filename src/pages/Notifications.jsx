import { useEffect, useState } from "react"
import api from "../api/axios"

export default function Notifications() {
  const [items, setItems] = useState([])

  useEffect(() => {
    api.get("/api/notifications")
      .then(res => setItems(res.data))
      .catch(console.error)
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <h2>Notifications</h2>

      {items.map(n => (
        <div
          key={n.id}
          style={{
            padding: 10,
            borderBottom: "1px solid #262626",
            opacity: n.read ? 0.6 : 1
          }}
        >
          {n.message}
        </div>
      ))}
    </div>
  )
}
