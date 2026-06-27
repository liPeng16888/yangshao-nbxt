export interface Reminder {
  id: string
  type: 'UNSETTLED_PAYMENT' | 'MONTHLY_PAYMENT'
  title: string
  content: string
  sourceType?: string
  sourceId?: string
  readAt?: string | null
  createdAt: string
}
