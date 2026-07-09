export type PaymentMethod = 'cash' | 'online'
export type FinanceDeleteRequestStatus = '' | 'PENDING' | 'APPROVED' | 'REJECTED'

export interface FinanceEntry {
  id: string
  paymentDate: string
  item: string
  amount: number
  paymentMethod: PaymentMethod
  screenshotUrl?: string
  screenshotUrls?: string[]
  remark?: string
  deleteRequestId?: string
  deleteRequestStatus?: FinanceDeleteRequestStatus
}

export interface FinancePayload {
  paymentDate: string
  item: string
  amount: number
  paymentMethod: PaymentMethod
  screenshotUrl?: string
  screenshotUrls?: string[]
  remark?: string
}
