export default function Unauthorized() {
  return (
    <div style={{ padding: 40, color: "white", background: "#000", minBlockSize: "100vh" }}>
      <h2>🚫 Access Denied</h2>
      <p>You don’t have permission to view this page.</p>
    </div>
  );
}