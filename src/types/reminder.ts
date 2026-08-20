export interface Reminder {
  id: string
  type: 'UNSETTLED_PAYMENT' | 'MONTHLY_PAYMENT' | 'FINANCE_DELETE_APPROVED' | 'FINANCE_DELETE_REJECTED' | 'LAB_SAMPLE_CHANGE_APPROVED' | 'LAB_SAMPLE_CHANGE_REJECTED'
  title: string
  content: string
  sourceType?: string
  sourceId?: string
  readAt?: string | null
  createdAt: string
}
