import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatGBP } from '@/lib/formatting'
import type { DailySnapshot, IntegrationConfig } from '@/lib/sheets'

interface Props {
  snapshots: DailySnapshot[]
  config: IntegrationConfig[]
}

function findSnapshotOnOrBefore(
  snapshots: DailySnapshot[],
  isoDate: string,
): DailySnapshot | undefined {
  // snapshots are sorted ascending — walk from the end.
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (snapshots[i].date <= isoDate) return snapshots[i]
  }
  return undefined
}

function isoDaysBefore(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export function SummaryCards({ snapshots, config }: Props) {
  const latest = snapshots.at(-1)
  if (!latest) return null

  const liabilityLabels = new Set(
    config.filter((c) => c.type === 'liability').map((c) => c.label),
  )
  const assetLabels = new Set(
    config
      .filter((c) => c.type !== 'liability' && c.type !== 'excluded')
      .map((c) => c.label),
  )

  let totalAssets = 0
  let totalLiabilities = 0
  for (const [label, value] of Object.entries(latest.integrations)) {
    if (assetLabels.has(label)) totalAssets += value
    else if (liabilityLabels.has(label)) totalLiabilities += value
  }

  const thirtyDaysAgoIso = isoDaysBefore(latest.date, 30)
  const prior = findSnapshotOnOrBefore(snapshots, thirtyDaysAgoIso)
  const monthDelta = prior ? latest.netWorth - prior.netWorth : null
  const monthDeltaPositive = monthDelta !== null && monthDelta >= 0

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Net Worth
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold tracking-tight">
            {formatGBP(latest.netWorth)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Total Assets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold tracking-tight text-emerald-400">
            {formatGBP(totalAssets)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Total Liabilities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold tracking-tight text-rose-400">
            {formatGBP(totalLiabilities)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            30-day change
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthDelta === null ? (
            <div className="text-3xl font-semibold tracking-tight text-muted-foreground">
              —
            </div>
          ) : (
            <div
              className={`flex items-center gap-1.5 text-3xl font-semibold tracking-tight ${
                monthDeltaPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {monthDeltaPositive ? (
                <ArrowUpRight className="size-6" />
              ) : (
                <ArrowDownRight className="size-6" />
              )}
              {formatGBP(Math.abs(monthDelta))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
