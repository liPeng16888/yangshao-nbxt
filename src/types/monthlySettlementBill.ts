export interface MonthlyBillEntry {
  id: string
  sourceElementKey: string
  date: string
  elementLabel: string
  quantity: number
  unitPrice: number | null
  subtotal: number
}

export type MonthlyBillEntryPatch = Partial<Pick<MonthlyBillEntry, 'date' | 'elementLabel' | 'quantity' | 'unitPrice'>>

export interface MonthlyBillElementTotal {
  sourceElementKey: string
  elementLabel: string
  quantity: number
  amount: number
}

export interface MonthlyBillDraft {
  title: string
  month: string
  customer: string
  customerDisplay: string
  entries: MonthlyBillEntry[]
  elementTotals: MonthlyBillElementTotal[]
  totalAmount: number
}

export interface MonthlyBillTableRow {
  id: string
  date: string
  dateRowSpan: number
  showDate: boolean
  entries: Array<MonthlyBillEntry | null>
  columnKeys: Array<string | null>
}

export interface MonthlyBillTableLayout {
  groupCount: number
  detailRows: MonthlyBillTableRow[]
  summaryRows: Array<Array<MonthlyBillElementTotal | null>>
}

export interface MonthlyBillValidationError {
  field: 'customer' | 'entries' | 'unitPrice' | 'quantity'
  entryId?: string
  message: string
}
