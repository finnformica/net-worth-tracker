import { useMemo } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatGBPPrecise, lightenHex } from '@/lib/formatting'
import type { DailySnapshot, IntegrationConfig } from '@/lib/sheets'

interface Props {
  snapshots: DailySnapshot[]
  config: IntegrationConfig[]
}

interface SectionGroup {
  label: string
  colour: string
  rows: IntegrationConfig[]
}

function groupBySection(config: IntegrationConfig[]): SectionGroup[] {
  const groups: SectionGroup[] = []
  for (const c of config) {
    const existing = groups.find((g) => g.label === c.sectionLabel)
    if (existing) existing.rows.push(c)
    else
      groups.push({
        label: c.sectionLabel,
        colour: c.colour,
        rows: [c],
      })
  }
  return groups
}

const SPARK_W = 96
const SPARK_H = 28

function Sparkline({
  values,
  stroke,
}: {
  values: number[]
  stroke: string
}) {
  if (values.length < 2) {
    return <svg width={SPARK_W} height={SPARK_H} aria-hidden="true" />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = SPARK_W / (values.length - 1)
  const path = values
    .map((v, i) => {
      const x = i * stepX
      const y = SPARK_H - ((v - min) / range) * SPARK_H
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  )
}

export function BreakdownTable({ snapshots, config }: Props) {
  const groups = useMemo(() => groupBySection(config), [config])
  const latest = snapshots.at(-1)
  const last90 = useMemo(() => snapshots.slice(-90), [snapshots])

  if (!latest) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-hidden rounded-b-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-6 py-2 font-medium">Integration</th>
                <th className="px-6 py-2 font-medium text-right">Current</th>
                <th className="px-6 py-2 font-medium text-right w-[120px]">
                  Last 90 days
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const headerBg = group.colour
                const rowBg = lightenHex(group.colour, 0.85)
                return (
                  <RenderGroup
                    key={group.label}
                    group={group}
                    headerBg={headerBg}
                    rowBg={rowBg}
                    latestRow={latest}
                    last90={last90}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function RenderGroup({
  group,
  headerBg,
  rowBg,
  latestRow,
  last90,
}: {
  group: SectionGroup
  headerBg: string
  rowBg: string
  latestRow: DailySnapshot
  last90: DailySnapshot[]
}) {
  const subtotal = group.rows.reduce(
    (sum, r) => sum + (latestRow.integrations[r.label] ?? 0),
    0,
  )

  return (
    <>
      <tr style={{ backgroundColor: headerBg }}>
        <td
          colSpan={2}
          className="px-6 py-2 font-semibold text-sm text-slate-900"
        >
          {group.label}
        </td>
        <td
          className="px-6 py-2 text-right font-semibold text-sm text-slate-900"
        >
          {formatGBPPrecise(subtotal)}
        </td>
      </tr>
      {group.rows.map((row) => {
        const value = latestRow.integrations[row.label] ?? 0
        const sparkValues = last90.map(
          (s) => s.integrations[row.label] ?? 0,
        )
        return (
          <tr
            key={row.label}
            style={{ backgroundColor: rowBg }}
            className="border-b border-black/5"
          >
            <td className="px-6 py-2 text-slate-800">{row.label}</td>
            <td className="px-6 py-2 text-right tabular-nums text-slate-800">
              {formatGBPPrecise(value)}
            </td>
            <td className="px-6 py-2 text-right">
              <span className="inline-flex justify-end">
                <Sparkline values={sparkValues} stroke={row.colour} />
              </span>
            </td>
          </tr>
        )
      })}
    </>
  )
}
