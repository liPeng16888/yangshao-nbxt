export type FrontendPreferenceSection =
  | 'LAB_REPORT_TEMPLATE'
  | 'LAB_REPORT_SMS_TEMPLATE'
  | 'LAB_REPORT_SAMPLE_UNITS'
  | 'LAB_ELEMENT_GROUPS'

export interface FrontendPreferenceRecord<T = unknown> {
  section: FrontendPreferenceSection
  value: T
  version: number
  updatedAt: string
  updatedBy: { id: string; username: string }
}

export interface CachedFrontendPreference<T = unknown> {
  ownerId: string
  section: FrontendPreferenceSection
  server: FrontendPreferenceRecord<T> | null
  pendingValue?: T
  pendingBaseVersion?: number
}

export type FrontendPreferenceStatus =
  | 'idle'
  | 'loading'
  | 'saved'
  | 'saving'
  | 'queued'
  | 'conflict'
  | 'error'

export interface FrontendPreferenceConflict<T = unknown> {
  localValue: T
  server: FrontendPreferenceRecord<T> | null
  serverVersion: number
}
