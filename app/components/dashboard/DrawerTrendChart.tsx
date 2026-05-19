"use client";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fmt$ } from "../../data";
import { tooltipStyle } from "./styles";

interface Props {
  data: { month: string; balance: number }[];
}

export default function DrawerTrendChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={110}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="drawerTGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v / 1000}k`} />
        <Tooltip formatter={(v) => [fmt$(Number(v ?? 0)), "Balance"]} contentStyle={tooltipStyle} cursor={{ stroke: "#818cf8", strokeWidth: 1, strokeDasharray: "4 4" }} />
        <Area type="monotone" dataKey="balance" stroke="#818cf8" strokeWidth={2} fill="url(#drawerTGrad)" dot={{ r: 3, fill: "#818cf8", stroke: "#10121a", strokeWidth: 2 }} activeDot={{ r: 4, fill: "#818cf8", stroke: "#10121a", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
