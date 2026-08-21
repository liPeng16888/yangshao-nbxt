export interface Customer {
  id: string
  updatedAt?: string
  name: string
  phone?: string
  wechat?: string
  wechatNickname?: string
  note?: string
}

export interface CustomerPayload {
  name?: string
  phone?: string
  wechat?: string
  wechatNickname?: string
  note?: string
}
