import request, { useMocks } from '@/utils/request'
import type { LabParameter, LabSheet, SampleBlock, SampleBlockSavePayload } from '@/types/labSheet'
import {
  mockAddSampleBlocks,
  mockCurrentLabSheet,
  mockCurrentParameters,
  mockLabHistory,
  mockLabSheetByDate,
  mockSaveSampleBlock,
  mockUpdateParameters
} from '@/mocks/db'

const CLIENT_ID_KEY = 'ys_lab_sheet_client_id'

export type LabSheetRealtimeEvent =
  | {
      type: 'connected'
      frontendUserId: string
      date: string
      updatedAt: string
    }
  | {
      type: 'block-saved'
      frontendUserId: string
      date: string
      sheetId: string
      sourceClientId?: string
      updatedAt: string
      block: SampleBlock
    }
  | {
      type: 'parameters-updated'
      frontendUserId: string
      date: string
      sheetId: string
      sourceClientId?: string
      updatedAt: string
      parameters: LabParameter
    }
  | {
      type: 'sheet-reloaded'
      frontendUserId: string
      date: string
      sheetId: string
      sourceClientId?: string
      updatedAt: string
      sheet: LabSheet
    }
  | {
      type: 'heartbeat'
      updatedAt: string
    }

export function getLabSheetClientId() {
  if (typeof window === 'undefined') return 'server'
  const existing = window.sessionStorage.getItem(CLIENT_ID_KEY)
  if (existing) return existing
  const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  window.sessionStorage.setItem(CLIENT_ID_KEY, next)
  return next
}

export function createLabSheetEventSource(date: string) {
  if (useMocks || typeof window === 'undefined' || typeof EventSource === 'undefined') return null
  const token = window.localStorage.getItem('ys_token')
  if (!token) return null
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api'
  const baseUrl = apiBase.startsWith('http') ? apiBase : `${window.location.origin}${apiBase}`
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/lab-sheets/stream`)
  url.searchParams.set('date', date)
  url.searchParams.set('token', token)
  return new EventSource(url.toString())
}

function clientHeaders() {
  return { headers: { 'X-YS-Client-Id': getLabSheetClientId() } }
}

export async function getCurrentLabSheet(): Promise<LabSheet> {
  if (useMocks) return mockCurrentLabSheet()
  return request.get('/lab-sheets/current')
}

export async function getLabSheetByDate(date: string): Promise<LabSheet> {
  if (useMocks) return mockLabSheetByDate(date)
  return request.get('/lab-sheets', { params: { date } })
}

export async function getCurrentParameters(): Promise<LabParameter> {
  if (useMocks) return mockCurrentParameters()
  return request.get('/lab-sheets/parameters/current')
}

export async function updateCurrentParameters(parameters: LabParameter): Promise<LabParameter> {
  if (useMocks) return mockUpdateParameters(parameters)
  return request.put('/lab-sheets/parameters/current', parameters, clientHeaders())
}

export async function addSampleBlocks(sheetId: string, count: number): Promise<LabSheet> {
  if (useMocks) return mockAddSampleBlocks(sheetId, count)
  return request.post(`/lab-sheets/${sheetId}/sample-blocks`, { count }, clientHeaders())
}

export async function saveSampleBlock(sheetId: string, block: SampleBlockSavePayload): Promise<SampleBlock> {
  if (useMocks) return mockSaveSampleBlock(sheetId, block)
  return request.put(`/lab-sheets/${sheetId}/cells`, block, clientHeaders())
}

export async function getLabSheetHistory(): Promise<Array<{ id: string; date: string; readonly: boolean }>> {
  if (useMocks) return mockLabHistory()
  return request.get('/lab-sheets/history')
}
