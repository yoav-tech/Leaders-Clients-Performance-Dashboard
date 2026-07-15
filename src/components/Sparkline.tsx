"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

interface Props {
  data: { date: string; roas: number | null; revenue: number }[];
  color?: string;
}

// Compact ROAS trend for a brand card. Nulls (no-spend days) render as gaps.
export default function Sparkline({ data, color = "#3b82f6" }: Props) {
  const points = data.map((d) => ({ x: d.date, y: d.roas }));
  const hasData = points.some((p) => p.y !== null);
  if (!hasData) {
    return <div className="h-10 w-full" />;
  }
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="y"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${color})`}
            connectNulls
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
