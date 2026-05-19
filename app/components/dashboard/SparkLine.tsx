"use client";
import { LineChart, Line, ResponsiveContainer } from "recharts";

export default function SparkLine({ data, stroke }: { data: { i: number; v: number }[]; stroke: string }) {
  return (
    <ResponsiveContainer width="100%" height={28}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
