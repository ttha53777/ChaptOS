"use client";
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fmt$ } from "../../data";
import { tooltipStyle } from "./styles";
import { ChartWidget } from "./widgets";

interface Props {
  liveBalance: number;
  liveProjected: number;
  liveTrend: { month: string; balance: number }[];
  totalDoorRev: number;
  partyCount: number;
  partyChartData: { name: string; revenue: number }[];
  brotherCount: number;
  goodCount: number;
  statusChartData: { name: string; count: number; fill: string }[];
  onTrackSvc: number;
  serviceHoursGoal: number;
  svcChartData: { name: string; hours: number }[];
}

export default function DashboardCharts({
  liveBalance,
  liveTrend,
  totalDoorRev,
  partyCount,
  partyChartData,
  brotherCount,
  goodCount,
  statusChartData,
  onTrackSvc,
  serviceHoursGoal,
  svcChartData,
}: Props) {
  return (
    <div id="sec-treasury" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ChartWidget title="Treasury Trend" stat={fmt$(liveBalance)} caption="Jan – May 2026" accentColor="#818cf8">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={1}>
          <AreaChart data={liveTrend} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
            <defs>
              <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#818cf8" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#818cf8" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v / 1000}k`} />
            <Tooltip formatter={(v) => [fmt$(Number(v ?? 0)), "Balance"]} contentStyle={tooltipStyle} cursor={{ stroke: "#818cf8", strokeWidth: 1, strokeDasharray: "4 4" }} />
            <Area type="monotone" dataKey="balance" stroke="#818cf8" strokeWidth={2} fill="url(#tGrad)" dot={false} activeDot={{ r: 4, fill: "#818cf8", stroke: "#10121a", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWidget>

      <ChartWidget title="Door Revenue" stat={fmt$(totalDoorRev)} caption={`${partyCount} events`} accentColor="#f472b6">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={1}>
          <BarChart data={partyChartData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}`} />
            <Tooltip formatter={(v) => [fmt$(Number(v ?? 0)), "Revenue"]} contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="revenue" fill="#818cf8" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWidget>

      <ChartWidget title="Status Mix" stat={`${goodCount} / ${brotherCount} Good`} caption={`${brotherCount} brothers`} accentColor="#34d399">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={1}>
          <BarChart data={statusChartData} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip formatter={(v) => [v, "Brothers"]} contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {statusChartData.map((entry, idx) => <Cell key={`sc-${idx}`} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartWidget>

      <ChartWidget title="Service Hours" stat={`${onTrackSvc} / ${brotherCount} on track`} caption={`Goal: ${serviceHoursGoal}h`} accentColor="#34d399">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={1}>
          <BarChart data={svcChartData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [`${v}h`, "Service"]} contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="hours" fill="#34d399" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWidget>
    </div>
  );
}
