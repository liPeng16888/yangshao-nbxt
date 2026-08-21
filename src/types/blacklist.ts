export interface BlacklistRecord {
  id: string
  uploadedAt: string
  updatedAt?: string
  uploadedBy: string
  canManage?: boolean
  phone?: string
  wechat?: string
  wechatNickname?: string
  amount?: number
  images: string[]
  other?: string
  note?: string
}

export interface BlacklistPayload {
  phone?: string
  wechat?: string
  wechatNickname?: string
  amount?: number | null
  images: string[]
  other?: string
  note?: string
}

export type BlacklistUpdatePayload = BlacklistPayload & { baseUpdatedAt: string }

export interface BlacklistCheckResult {
  hit: boolean
  records: BlacklistRecord[]
}
