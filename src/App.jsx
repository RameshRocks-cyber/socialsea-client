import { useState } from "react";
import AdminLogin from "./admin/AdminLogin";
import Reports from "./admin/Reports";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("token"));

  if (!loggedIn) return <AdminLogin onLogin={() => setLoggedIn(true)} />;

  return <Reports />;
}