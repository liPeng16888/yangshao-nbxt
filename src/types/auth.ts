export interface AuthUser {
  id: string
  username: string
  account: string
  role: 'admin' | 'staff'
}

export interface LoginPayload {
  account: string
  password: string
}

export interface RegisterPayload {
  username: string
  account: string
  password: string
  confirmPassword: string
  inviteCode: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}
