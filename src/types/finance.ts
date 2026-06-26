export type PaymentMethod = 'cash' | 'online'

export interface FinanceEntry {
  id: string
  paymentDate: string
  item: string
  amount: number
  paymentMethod: PaymentMethod
  screenshotUrl?: string
  remark?: string
}

export interface FinancePayload {
  paymentDate: string
  item: string
  amount: number
  paymentMethod: PaymentMethod
  screenshotUrl?: string
  remark?: string
}
