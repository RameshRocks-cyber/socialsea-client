import { useEffect, useState } from "react"

export default function Notifications() {
  const [items, setItems] = useState([])

  useEffect(() => {
    fetch("http://localhost:8081/api/notifications", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    })
      .then(res => res.json())
      .then(setItems)
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
