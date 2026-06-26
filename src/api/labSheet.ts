import request, { useMocks } from '@/utils/request'
import type { LabParameter, LabSheet, SampleBlock } from '@/types/labSheet'
import {
  mockAddSampleBlocks,
  mockCurrentLabSheet,
  mockCurrentParameters,
  mockLabHistory,
  mockLabSheetByDate,
  mockSaveSampleBlock,
  mockUpdateParameters
} from '@/mocks/db'

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
  return request.put('/lab-sheets/parameters/current', parameters)
}

export async function addSampleBlocks(sheetId: string, count: number): Promise<LabSheet> {
  if (useMocks) return mockAddSampleBlocks(sheetId, count)
  return request.post(`/lab-sheets/${sheetId}/sample-blocks`, { count })
}

export async function saveSampleBlock(sheetId: string, block: SampleBlock): Promise<SampleBlock> {
  if (useMocks) return mockSaveSampleBlock(sheetId, block)
  return request.put(`/lab-sheets/${sheetId}/cells`, block)
}

export async function getLabSheetHistory(): Promise<Array<{ id: string; date: string; readonly: boolean }>> {
  if (useMocks) return mockLabHistory()
  return request.get('/lab-sheets/history')
}
