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

import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatGBP } from '@/lib/formatting'
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

type RangeKey = '3M' | '6M' | '1Y' | '2Y' | '3Y' | 'All'

const RANGES: { key: RangeKey; days: number | null; label: string }[] = [
  { key: '3M', days: 90, label: '3 months' },
  { key: '6M', days: 180, label: '6 months' },
  { key: '1Y', days: 365, label: '1 year' },
  { key: '2Y', days: 730, label: '2 years' },
  { key: '3Y', days: 1095, label: '3 years' },
  { key: 'All', days: null, label: 'All time' },
]

type SmoothingKey = 'none' | '7' | '30' | '90' | '365'

const SMOOTHINGS: { key: SmoothingKey; window: number; label: string }[] = [
  { key: 'none', window: 1, label: 'No smoothing' },
  { key: '7', window: 7, label: '7-day average' },
  { key: '30', window: 30, label: '30-day average' },
  { key: '90', window: 90, label: '90-day average' },
  { key: '365', window: 365, label: '1-year average' },
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

function rollingAverage(values: number[], window: number): number[] {
  if (window <= 1) return values
  const out: number[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= window) sum -= values[i - window]
    out.push(sum / Math.min(i + 1, window))
  }
  return out
}

const NET_WORTH_LABEL = 'Net Worth'

export function NetWorthChart({ snapshots, events, config }: Props) {
  const [range, setRange] = useState<RangeKey>('1Y')
  const [smoothing, setSmoothing] = useState<SmoothingKey>('30')
  // null = all visible; otherwise only this label is visible.
  const [isolated, setIsolated] = useState<string | null>(null)

  const smoothingWindow =
    SMOOTHINGS.find((s) => s.key === smoothing)?.window ?? 1

  // Smooth across the full series first, then slice for the visible range —
  // this keeps the leading edge of the visible window from showing artificially
  // low values from a partial smoothing window.
  const smoothedSeries = useMemo(() => {
    const liabilities = config.filter((c) => c.type === 'liability')
    const assets = config.filter(
      (c) => c.type !== 'liability' && c.type !== 'excluded',
    )
    const integrationLabels = [...liabilities, ...assets].map((c) => c.label)

    const raw: Record<string, number[]> = {
      __netWorth: snapshots.map((s) => s.netWorth),
    }
    for (const label of integrationLabels) {
      raw[label] = snapshots.map((s) => s.integrations[label] ?? 0)
    }

    const smoothed: Record<string, number[]> = {}
    for (const key of Object.keys(raw)) {
      smoothed[key] = rollingAverage(raw[key], smoothingWindow)
    }
    return smoothed
  }, [snapshots, config, smoothingWindow])

  const filteredIndices = useMemo(() => {
    if (snapshots.length === 0) return { start: 0, end: 0 }
    const days = RANGES.find((r) => r.key === range)?.days ?? null
    if (days === null) return { start: 0, end: snapshots.length }
    const latestDate = new Date(`${snapshots.at(-1)!.date}T00:00:00Z`)
    const cutoff = new Date(latestDate)
    cutoff.setUTCDate(cutoff.getUTCDate() - days)
    const cutoffIso = cutoff.toISOString().slice(0, 10)
    const start = snapshots.findIndex((s) => s.date >= cutoffIso)
    return { start: start === -1 ? snapshots.length : start, end: snapshots.length }
  }, [snapshots, range])

  const labels = useMemo(
    () =>
      snapshots.slice(filteredIndices.start, filteredIndices.end).map((s) => s.date),
    [snapshots, filteredIndices],
  )

  const visibleEvents = useMemo(() => {
    if (labels.length === 0) return []
    const first = labels[0]
    const last = labels[labels.length - 1]
    return events.filter((e) => e.date >= first && e.date <= last)
  }, [events, labels])

  const slicedSeries = useMemo(() => {
    const slice = (arr: number[]) =>
      arr.slice(filteredIndices.start, filteredIndices.end)
    const out: Record<string, number[]> = {}
    for (const key of Object.keys(smoothedSeries)) {
      out[key] = slice(smoothedSeries[key])
    }
    return out
  }, [smoothedSeries, filteredIndices])

  // Compute exact y-axis bounds. When a series is isolated, scale to that
  // series alone; otherwise size to the stacked positives/negatives plus the
  // net worth line so the two axes (stacked y + non-stacked yLine) share a
  // single visible range.
  const yBounds = useMemo(() => {
    const liabilityLabels = config
      .filter((c) => c.type === 'liability')
      .map((c) => c.label)
    const assetLabels = config
      .filter((c) => c.type !== 'liability' && c.type !== 'excluded')
      .map((c) => c.label)
    const len = labels.length

    let yMax = 0
    let yMin = 0

    if (isolated !== null) {
      const seriesKey = isolated === NET_WORTH_LABEL ? '__netWorth' : isolated
      const arr = slicedSeries[seriesKey] ?? []
      for (const v of arr) {
        if (v > yMax) yMax = v
        if (v < yMin) yMin = v
      }
    } else {
      const stackLabels = [...liabilityLabels, ...assetLabels]
      for (let i = 0; i < len; i++) {
        let pos = 0
        let neg = 0
        for (const label of stackLabels) {
          const v = slicedSeries[label]?.[i] ?? 0
          if (v >= 0) pos += v
          else neg += v
        }
        if (pos > yMax) yMax = pos
        if (neg < yMin) yMin = neg
      }
      const nw = slicedSeries.__netWorth ?? []
      for (const v of nw) {
        if (v > yMax) yMax = v
        if (v < yMin) yMin = v
      }
    }

    const pad = (yMax - yMin) * 0.05 || Math.max(Math.abs(yMax), 1) * 0.1
    return { min: yMin - pad, max: yMax + pad }
  }, [slicedSeries, labels, config, isolated])

  const chartData = useMemo<ChartData<'line'>>(() => {
    const liabilities = config.filter((c) => c.type === 'liability')
    const assets = config.filter(
      (c) => c.type !== 'liability' && c.type !== 'excluded',
    )

    const isHidden = (label: string) =>
      isolated !== null && isolated !== label

    const seriesDataset = (c: IntegrationConfig) => ({
      label: c.label,
      data: slicedSeries[c.label] ?? [],
      borderColor: c.colour,
      backgroundColor: withAlpha(c.colour, 0.55),
      borderWidth: 1,
      pointRadius: 0,
      pointHoverRadius: 3,
      // When isolated, this dataset stops filling between layers.
      fill: isolated !== null ? 'origin' : true,
      yAxisID: 'y',
      tension: 0.25,
      hidden: isHidden(c.label),
    })

    return {
      labels,
      datasets: [
        ...liabilities.map(seriesDataset),
        ...assets.map(seriesDataset),
        {
          label: NET_WORTH_LABEL,
          data: slicedSeries.__netWorth ?? [],
          borderColor: '#f8fafc',
          backgroundColor: '#f8fafc',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: false,
          yAxisID: 'yLine',
          tension: 0.25,
          hidden: isHidden(NET_WORTH_LABEL),
        },
      ],
    }
  }, [labels, slicedSeries, config, isolated])

  const annotations = useMemo(() => {
    const out: Record<string, object> = {}
    visibleEvents.forEach((e, i) => {
      out[`event-${i}`] = {
        type: 'line',
        scaleID: 'x',
        value: e.date,
        borderColor: '#a78bfa',
        borderWidth: 1.5,
        borderDash: [4, 4],
        label: {
          content: e.label,
          display: true,
          position: 'start',
          backgroundColor: '#a78bfa',
          color: '#0b0a13',
          font: { size: 11, weight: 600 },
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
          // Click isolates a single series. Clicking the already-isolated
          // series restores the full stack.
          onClick(_e, legendItem, legend) {
            const idx = legendItem.datasetIndex
            if (idx === undefined) return
            const label = legend.chart.data.datasets[idx].label as
              | string
              | undefined
            if (!label) return
            setIsolated((prev) => (prev === label ? null : label))
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
          min: yBounds.min,
          max: yBounds.max,
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
        // Hidden axis sharing y's range so the Net Worth line is plotted
        // at its absolute value rather than being pulled into the stack.
        yLine: {
          stacked: false,
          display: false,
          min: yBounds.min,
          max: yBounds.max,
          grid: { drawOnChartArea: false },
        },
      },
    }),
    [annotations, yBounds],
  )

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Smoothing</span>
            <Select
              value={smoothing}
              onValueChange={(v) => setSmoothing(v as SmoothingKey)}
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMOOTHINGS.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Range</span>
            <Select
              value={range}
              onValueChange={(v) => setRange(v as RangeKey)}
            >
              <SelectTrigger size="sm" className="w-35">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div style={{ height: 500 }}>
          <Line data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  )
}
