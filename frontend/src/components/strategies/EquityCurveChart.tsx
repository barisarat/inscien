"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatEt, formatEtTick } from "@/lib/time"

export type EquityPoint = { ts: string; equity: number }

function formatTick(value: string, intraday: boolean, useEt: boolean) {
  // ts may be a date (YYYY-MM-DD) or ISO timestamp; intraday bars need the time.
  const text = value ?? ""
  if (useEt && intraday) return formatEtTick(text, true)
  return intraday ? text.slice(5, 16).replace("T", " ") : text.slice(0, 10)
}

function formatLabel(value: string, intraday: boolean, useEt: boolean) {
  const text = value ?? ""
  if (useEt && intraday) return formatEt(text)
  return intraday ? text.slice(0, 16).replace("T", " ") : text.slice(0, 10)
}

function formatMoney(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function EquityCurveChart({
  points,
  height = 200,
  frequency,
  easternTime = false,
}: {
  points: EquityPoint[]
  height?: number
  frequency?: string
  easternTime?: boolean
}) {
  const intraday = frequency != null && frequency !== "1day"
  const data = useMemo(
    () => points.filter((point) => point.equity != null),
    [points]
  )

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border-light)" vertical={false} />
        <XAxis
          dataKey="ts"
          tickFormatter={(value: string) => formatTick(value, intraday, easternTime)}
          minTickGap={48}
          tick={{ fill: "var(--text-3)", fontSize: 11 }}
          stroke="var(--border)"
        />
        <YAxis
          domain={["auto", "auto"]}
          width={56}
          tickFormatter={(value: number) => formatMoney(value)}
          tick={{ fill: "var(--text-3)", fontSize: 11 }}
          stroke="var(--border)"
        />
        <Tooltip
          formatter={(value: number) => [
            `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
            "Equity",
          ]}
          labelFormatter={(value: string) => formatLabel(value, intraday, easternTime)}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-xs)",
            color: "var(--text)",
          }}
          labelStyle={{ color: "var(--text-2)" }}
        />
        <Line
          type="monotone"
          dataKey="equity"
          stroke="var(--accent)"
          strokeWidth={1.6}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
