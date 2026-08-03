export interface FinanceBarData {
  labels: string[]
  values: number[]
}

export interface FinancePieItem {
  name: string
  value: number
}

interface IncomeRow {
  date?: unknown
  totalAmount?: unknown
  statusSummaries?: Array<{ status?: unknown; amount?: unknown }>
}

interface ExpenseRow {
  paymentDate?: unknown
  item?: unknown
  amount?: unknown
}

export function buildIncomeBarData(rows: IncomeRow[]): FinanceBarData {
  return buildBarData(rows, (row) => String(row.date || ''), (row) => row.totalAmount)
}

export function buildIncomePieData(rows: IncomeRow[]): FinancePieItem[] {
  const amounts = new Map<string, number>()
  rows.forEach((row) => {
    row.statusSummaries?.forEach((summary) => {
      const name = String(summary.status || '未选择')
      amounts.set(name, (amounts.get(name) || 0) + toNumber(summary.amount))
    })
  })
  return mapToPieData(amounts)
}

export function buildExpenseBarData(rows: ExpenseRow[]): FinanceBarData {
  return buildBarData(rows, (row) => String(row.paymentDate || ''), (row) => row.amount)
}

export function buildExpensePieData(rows: ExpenseRow[]): FinancePieItem[] {
  const amounts = new Map<string, number>()
  rows.forEach((row) => {
    const name = String(row.item || '').trim() || '未分类'
    amounts.set(name, (amounts.get(name) || 0) + toNumber(row.amount))
  })
  return mapToPieData(amounts)
}

function buildBarData<T>(rows: T[], getLabel: (row: T) => string, getValue: (row: T) => unknown): FinanceBarData {
  const amounts = new Map<string, number>()
  rows.forEach((row) => {
    const label = getLabel(row)
    if (!label) return
    amounts.set(label, (amounts.get(label) || 0) + toNumber(getValue(row)))
  })
  const entries = [...amounts.entries()].sort(([left], [right]) => left.localeCompare(right))
  return { labels: entries.map(([label]) => label), values: entries.map(([, value]) => value) }
}

function mapToPieData(amounts: Map<string, number>): FinancePieItem[] {
  return [...amounts.entries()]
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value }))
}

function toNumber(value: unknown) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? numeric : 0
}
