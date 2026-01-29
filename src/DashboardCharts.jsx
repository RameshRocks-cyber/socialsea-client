import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";

export default function DashboardCharts({ data }) {
  return (
    <div style={{ marginTop: 40 }}>
      <h3>📈 Growth</h3>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data.users}>
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="count" stroke="#4f46e5" />
        </LineChart>
      </ResponsiveContainer>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data.posts}>
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="count" stroke="#16a34a" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}