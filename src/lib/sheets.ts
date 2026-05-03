import { parseMoney, toIsoDate } from './formatting'

export interface DailySnapshot {
  date: string
  netWorth: number
  integrations: Record<string, number>
}

export interface ChartEvent {
  date: string
  label: string
}

export type IntegrationType =
  | 'cash'
  | 'business'
  | 'investment'
  | 'liability'
  | 'excluded'

export interface IntegrationConfig {
  label: string
  type: IntegrationType
  sectionLabel: string
  colour: string
  active: boolean
}

export interface DashboardData {
  snapshots: DailySnapshot[]
  events: ChartEvent[]
  config: IntegrationConfig[]
}

export class AuthExpiredError extends Error {
  constructor(message = 'Access token rejected by Google Sheets API') {
    super(message)
    this.name = 'AuthExpiredError'
  }
}

const SHEET_ID = import.meta.env.VITE_SPREADSHEET_ID as string | undefined

function assertSheetId(): string {
  if (!SHEET_ID) {
    throw new Error(
      'Missing VITE_SPREADSHEET_ID — copy .env.example to .env and fill in your spreadsheet ID.',
    )
  }
  return SHEET_ID
}

interface SheetsValuesResponse {
  range?: string
  majorDimension?: string
  values?: string[][]
}

async function fetchSheet(
  sheetName: string,
  accessToken: string,
): Promise<string[][]> {
  const sheetId = assertSheetId()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    sheetId,
  )}/values/${encodeURIComponent(sheetName)}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 401 || res.status === 403) {
    throw new AuthExpiredError(
      `Google Sheets API returned ${res.status} — please sign in again.`,
    )
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body?.error?.message) detail = body.error.message
    } catch {
      // ignore parse failures, fall back to statusText
    }
    throw new Error(`Failed to fetch "${sheetName}" sheet: ${detail}`)
  }

  const data = (await res.json()) as SheetsValuesResponse
  return data.values ?? []
}

const VALID_TYPES: IntegrationType[] = [
  'cash',
  'business',
  'investment',
  'liability',
  'excluded',
]

export async function fetchConfig(
  accessToken: string,
): Promise<IntegrationConfig[]> {
  const rows = await fetchSheet('Config', accessToken)
  if (rows.length === 0) {
    throw new Error(
      'Config sheet is empty — add header row "Label, Type, SectionLabel, Colour, Active" and at least one integration.',
    )
  }
  const out: IntegrationConfig[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const label = (row[0] ?? '').trim()
    const type = (row[1] ?? '').trim().toLowerCase() as IntegrationType
    const sectionLabel = (row[2] ?? '').trim()
    const colour = (row[3] ?? '').trim()
    const activeRaw = (row[4] ?? '').trim().toUpperCase()
    if (!label) continue
    if (!VALID_TYPES.includes(type)) continue
    out.push({
      label,
      type,
      sectionLabel,
      colour,
      active: activeRaw === 'TRUE',
    })
  }
  return out.filter((c) => c.active)
}

export async function fetchEvents(accessToken: string): Promise<ChartEvent[]> {
  const rows = await fetchSheet('Events', accessToken)
  const out: ChartEvent[] = []
  for (let i = 1; i < rows.length; i++) {
    const date = toIsoDate(rows[i][0])
    const label = (rows[i][1] ?? '').trim()
    if (!date || !label) continue
    out.push({ date, label })
  }
  return out
}

export async function fetchSnapshots(
  accessToken: string,
): Promise<DailySnapshot[]> {
  const rows = await fetchSheet('Data', accessToken)
  if (rows.length < 2) return []

  const header = rows[0].map((h) => (h ?? '').trim())
  const dateIdx = header.findIndex((h) => h.toLowerCase() === 'date')
  const netWorthIdx = header.findIndex((h) => h.toLowerCase() === 'net worth')
  if (dateIdx === -1) {
    throw new Error('Data sheet header is missing a "Date" column.')
  }
  if (netWorthIdx === -1) {
    throw new Error('Data sheet header is missing a "Net Worth" column.')
  }

  const integrationCols = header
    .map((label, idx) => ({ label, idx }))
    .filter(({ idx, label }) => idx !== dateIdx && idx !== netWorthIdx && label !== '')

  const prev: Record<string, number> = {}
  for (const { label } of integrationCols) prev[label] = 0
  let prevNetWorth = 0

  const snapshots: DailySnapshot[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const date = toIsoDate(row[dateIdx])
    if (!date) continue

    const netWorthParsed = parseMoney(row[netWorthIdx])
    const netWorth = netWorthParsed ?? prevNetWorth
    prevNetWorth = netWorth

    const integrations: Record<string, number> = {}
    for (const { label, idx } of integrationCols) {
      const parsed = parseMoney(row[idx])
      const v = parsed ?? prev[label]
      integrations[label] = v
      prev[label] = v
    }

    snapshots.push({ date, netWorth, integrations })
  }

  snapshots.sort((a, b) => a.date.localeCompare(b.date))
  return snapshots
}

export async function fetchAll(accessToken: string): Promise<DashboardData> {
  const [snapshots, events, config] = await Promise.all([
    fetchSnapshots(accessToken),
    fetchEvents(accessToken),
    fetchConfig(accessToken),
  ])
  return { snapshots, events, config }
}
