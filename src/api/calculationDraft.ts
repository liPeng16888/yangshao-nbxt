import axios from 'axios'
import request from '@/utils/request'
import type {
  CalculationDraft,
  CalculationDraftKind,
  CalculationDraftSaveRequest,
  CalculationDraftServerKind
} from '@/types/calculationDraft'

export class CalculationDraftConflictError<T = unknown> extends Error {
  readonly serverDraft: CalculationDraft<T>
  readonly cause: unknown

  constructor(serverDraft: CalculationDraft<T>, cause?: unknown) {
    super('计算草稿与服务器版本冲突')
    this.name = 'CalculationDraftConflictError'
    this.serverDraft = serverDraft
    this.cause = cause
  }
}

export async function getCalculationDraft<T>(kind: CalculationDraftKind): Promise<CalculationDraft<T>> {
  const value = await request.get<unknown, unknown>(`/calculation-drafts/${kind}`)
  return requireDraft<T>(value, kind)
}

export async function saveCalculationDraft<T>(
  kind: CalculationDraftKind,
  body: CalculationDraftSaveRequest<T>
): Promise<CalculationDraft<T>> {
  try {
    const value = await request.put<unknown, unknown>(`/calculation-drafts/${kind}`, body)
    return requireDraft<T>(value, kind)
  } catch (error) {
    const serverDraft = authoritativeConflict<T>(error, kind)
    if (serverDraft) throw new CalculationDraftConflictError(serverDraft, error)
    throw error
  }
}

function authoritativeConflict<T>(error: unknown, kind: CalculationDraftKind) {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null
  const data = error.response.data
  if (!isPlainObject(data) || data.code !== 'CALCULATION_DRAFT_CONFLICT') return null
  return parseDraft<T>(data.serverDraft, kind)
}

function requireDraft<T>(value: unknown, kind: CalculationDraftKind): CalculationDraft<T> {
  const draft = parseDraft<T>(value, kind)
  if (!draft) throw new TypeError('计算草稿响应格式无效')
  return draft
}

function parseDraft<T>(value: unknown, kind: CalculationDraftKind): CalculationDraft<T> | null {
  if (!isPlainObject(value)) return null
  const expectedKind = serverKind(kind)
  if (
    value.kind !== expectedKind ||
    !Object.hasOwn(value, 'payload') ||
    !isPlainObject(value.payload) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    value.updatedAt !== null && typeof value.updatedAt !== 'string'
  ) {
    return null
  }
  return {
    kind: expectedKind,
    payload: value.payload as T,
    revision: value.revision as number,
    updatedAt: value.updatedAt as string | null
  }
}

function serverKind(kind: CalculationDraftKind): CalculationDraftServerKind {
  return kind === 'standard-sample' ? 'STANDARD_SAMPLE' : 'COEFFICIENT'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
