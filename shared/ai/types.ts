import type { AiMenuEntry } from '../../server/src/ai/ai-menu-catalog'
export interface AiModelOption { id: string; name: string; vision: boolean; tools: boolean }
export interface AiBootstrap { enabled: boolean; dailyRequestLimit: number; adminReadOnly: boolean; models: AiModelOption[]; owners: { id: string; account: string; username: string }[] }
export interface AiPreview { title: string; account: string; location: string; fields: { key: string; label: string; before: unknown; after: unknown }[]; warnings: string[] }
export interface AiProposal { id: string; resource: string; status: string; preview: AiPreview; expiresAt: string }
export interface AiChatResponse { conversationId: string; answer: string; proposals: AiProposal[] }
export interface AiRule { resource: string; readFields: string[]; writeFields: string[] }
export interface AiAccount { id: string; account: string; username: string; role: string; parentFrontendUserId?: string | null }
export interface AiConfiguredModel extends AiModelOption { modelId: string; baseUrl: string; enabled: boolean; allowedUserIds: string[]; hasApiKey: boolean }
export interface AiConfig {
  settings: { enabled: boolean; dailyRequestLimit: number; blockedFields: Record<string, string[]>; revision: number }
  models: AiConfiguredModel[]
  accounts: AiAccount[]
  policies: { subjectId: string; enabled: boolean; rules: AiRule[] }[]
  catalog: AiMenuEntry[]
}
export interface FeishuStatus { state: string; lastError: string; connectedAt: string | null; lastReceivedAt: string | null; lastSentAt: string | null }
export interface FeishuConfig { appId: string; publicSiteUrl: string; enabled: boolean; hasSecret: boolean; revision: number; status?: FeishuStatus }
export interface FeishuBinding { id: string; userId: string; openId: string; defaultModelId: string; enabled: boolean; revokedAt: string | null; updatedAt: string; user: (AiAccount & { disabled: boolean; deletedAt: string | null }) | null }
