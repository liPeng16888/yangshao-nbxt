export interface BlacklistRecord {
  id: string
  uploadedAt: string
  uploadedBy: string
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

export interface BlacklistCheckResult {
  hit: boolean
  records: BlacklistRecord[]
}
