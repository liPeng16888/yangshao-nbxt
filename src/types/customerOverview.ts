export interface CustomerOverviewRow {
  customerKey: string
  customer: string
  customerDisplay: string
  sampleCount: number
  totalAmount: number
  firstDetectionDate: string
  lastDetectionDate: string
}

export type CustomerOverviewSortField =
  | 'customerDisplay'
  | 'sampleCount'
  | 'totalAmount'
  | 'firstDetectionDate'
  | 'lastDetectionDate'

export type SortDirection = 'asc' | 'desc'
