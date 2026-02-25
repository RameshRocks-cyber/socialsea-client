import { useEffect, useState } from "react"
import api from "../api/axios"

export default function Notifications() {
  const [items, setItems] = useState([])

  const emailToName = (email) => {
    const raw = (email || "").split("@")[0] || ""
    const withoutDigits = raw.replace(/\d+$/g, "")
    const spaced = withoutDigits.replace(/[._-]+/g, " ").trim()
    if (!spaced) return raw || "User"
    return spaced
      .split(" ")
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }

  const formatNotificationMessage = (message) => {
    if (!message) return ""
    return message.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      (email) => emailToName(email)
    )
  }

  useEffect(() => {
    api.get("/api/notifications")
      .then(res => setItems(res.data))
      .catch(console.error)
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <h2>Notifications</h2>
      {items.length === 0 && <p>No notifications yet.</p>}

      {items.map(n => (
        <div
          key={n.id}
          style={{
            padding: 10,
            borderBottom: "1px solid #262626",
            opacity: n.read ? 0.6 : 1
          }}
        >
          {formatNotificationMessage(n.message)}
        </div>
      ))}
    </div>
  )
}
