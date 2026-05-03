import { useMemo, useState } from 'react'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import annotationPlugin from 'chartjs-plugin-annotation'
import type { ChartOptions, ChartData } from 'chart.js'
import { Line } from 'react-chartjs-2'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatGBP, lightenHex } from '@/lib/formatting'
import type {
  ChartEvent,
  DailySnapshot,
  IntegrationConfig,
} from '@/lib/sheets'

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  LineController,
  Filler,
  Tooltip,
  Legend,
  annotationPlugin,
)

type RangeKey = '3M' | '6M' | '1Y' | 'All'

const RANGES: { key: RangeKey; days: number | null; label: string }[] = [
  { key: '3M', days: 90, label: '3M' },
  { key: '6M', days: 180, label: '6M' },
  { key: '1Y', days: 365, label: '1Y' },
  { key: 'All', days: null, label: 'All' },
]

interface Props {
  snapshots: DailySnapshot[]
  events: ChartEvent[]
  config: IntegrationConfig[]
}

function withAlpha(hex: string, alpha: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return hex
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${m[1]}${a}`
}

export function NetWorthChart({ snapshots, events, config }: Props) {
  const [range, setRange] = useState<RangeKey>('1Y')

  const filteredSnapshots = useMemo(() => {
    if (snapshots.length === 0) return snapshots
    const days = RANGES.find((r) => r.key === range)?.days ?? null
    if (days === null) return snapshots
    const latestDate = new Date(`${snapshots.at(-1)!.date}T00:00:00Z`)
    const cutoff = new Date(latestDate)
    cutoff.setUTCDate(cutoff.getUTCDate() - days)
    const cutoffIso = cutoff.toISOString().slice(0, 10)
    return snapshots.filter((s) => s.date >= cutoffIso)
  }, [snapshots, range])

  const visibleEvents = useMemo(() => {
    if (filteredSnapshots.length === 0) return []
    const first = filteredSnapshots[0].date
    const last = filteredSnapshots.at(-1)!.date
    return events.filter((e) => e.date >= first && e.date <= last)
  }, [events, filteredSnapshots])

  const chartData = useMemo<ChartData<'line'>>(() => {
    const labels = filteredSnapshots.map((s) => s.date)
    const liabilities = config.filter((c) => c.type === 'liability')
    const assets = config.filter(
      (c) => c.type !== 'liability' && c.type !== 'excluded',
    )

    const seriesDataset = (c: IntegrationConfig) => ({
      label: c.label,
      data: filteredSnapshots.map((s) => s.integrations[c.label] ?? 0),
      borderColor: c.colour,
      backgroundColor: withAlpha(c.colour, 0.55),
      borderWidth: 1,
      pointRadius: 0,
      pointHoverRadius: 3,
      fill: true,
      stack: 'main',
      tension: 0.25,
    })

    return {
      labels,
      datasets: [
        // Liabilities first (anchor below zero)
        ...liabilities.map(seriesDataset),
        // Assets next (stack above zero)
        ...assets.map(seriesDataset),
        // Net Worth line on top, drawn outside the stack
        {
          label: 'Net Worth',
          data: filteredSnapshots.map((s) => s.netWorth),
          borderColor: '#000000',
          backgroundColor: '#000000',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: false,
          stack: 'netWorth',
          tension: 0.25,
        },
      ],
    }
  }, [filteredSnapshots, config])

  const annotations = useMemo(() => {
    const out: Record<string, object> = {}
    visibleEvents.forEach((e, i) => {
      out[`event-${i}`] = {
        type: 'line',
        scaleID: 'x',
        value: e.date,
        borderColor: '#6366f1',
        borderWidth: 1.5,
        borderDash: [4, 4],
        label: {
          content: e.label,
          display: true,
          position: 'start',
          backgroundColor: '#6366f1',
          color: '#ffffff',
          font: { size: 11 },
          rotation: -90,
          yAdjust: -8,
        },
      }
    })
    return out
  }, [visibleEvents])

  const options = useMemo<ChartOptions<'line'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#cbd5e1',
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const value = (ctx.raw as number) ?? 0
              return `${ctx.dataset.label}: ${formatGBP(value)}`
            },
          },
        },
        annotation: { annotations },
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month' },
          grid: { color: 'rgba(148, 163, 184, 0.1)' },
          ticks: { color: '#94a3b8' },
        },
        y: {
          stacked: true,
          grid: {
            color: (ctx) =>
              ctx.tick.value === 0
                ? 'rgba(148, 163, 184, 0.5)'
                : 'rgba(148, 163, 184, 0.1)',
          },
          ticks: {
            color: '#94a3b8',
            callback: (value) => formatGBP(value as number),
          },
        },
      },
    }),
    [annotations],
  )

  // Tint the card border with the cash section colour if available, else default.
  const accent = config.find((c) => c.type === 'cash')?.colour
  const accentBorder = accent ? lightenHex(accent, 0.2) : undefined

  return (
    <Card style={accentBorder ? { borderColor: 'transparent' } : undefined}>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-end gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              size="sm"
              variant={range === r.key ? 'default' : 'ghost'}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <div style={{ height: 500 }}>
          <Line data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  )
}
