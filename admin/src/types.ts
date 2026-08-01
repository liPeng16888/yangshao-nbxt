export type AdminRole = 'ROOT_ADMIN' | 'SUB_ADMIN'

export interface AdminUser {
  id: string
  account: string
  username: string
  role: AdminRole
}

export interface FrontendOption {
  id: string
  account: string
  name: string
  disabled: boolean
}

export interface ApiPageState {
  loading: boolean
}

export interface AdminCustomerOverviewRow {
  frontendUserId: string
  frontendUserName: string
  customerKey: string
  customer: string
  customerDisplay: string
  sampleCount: number
  totalAmount: number
  firstDetectionDate: string
  lastDetectionDate: string
}
