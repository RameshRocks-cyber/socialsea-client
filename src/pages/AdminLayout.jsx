import { Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900 text-white flex">

      {/* Sidebar */}
      <div className={`bg-black/40 p-6 space-y-6 
        fixed md:static z-50 h-full w-64 transform 
        ${open ? "translate-x-0" : "-translate-x-full"} 
        md:translate-x-0 transition duration-300`}>

        <h1 className="text-2xl font-bold">Admin</h1>

        <nav className="space-y-4">
          <button onClick={() => navigate("/admin/dashboard")} className="block w-full text-left hover:text-blue-400">Dashboard</button>
          <button onClick={() => navigate("/admin/users")} className="block w-full text-left hover:text-blue-400">Users</button>
          <button onClick={() => navigate("/admin/posts")} className="block w-full text-left hover:text-blue-400">Posts</button>
          <button onClick={() => navigate("/admin/reports")} className="block w-full text-left hover:text-blue-400">Reports</button>
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        <button 
          className="md:hidden bg-blue-600 px-3 py-2 rounded mb-4"
          onClick={() => setOpen(!open)}
        >
          ☰
        </button>

        <Outlet />
      </div>
    </div>
  );
}