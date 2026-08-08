import { UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { LabSheetsController } from './lab-sheets.controller'

const frontendUser: CurrentUser = {
  id: 'front-1',
  account: 'front-1',
  username: '前台一',
  role: UserRole.FRONTEND_USER
}

describe('LabSheetsController segmented parameter access', () => {
  const sheets = {
    applyCurrentParametersFromIndex: vi.fn().mockResolvedValue({}),
    addSampleBlocks: vi.fn().mockResolvedValue({})
  }
  const auth = {
    isFeatureProtected: vi.fn(),
    hasAccessGrant: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    sheets.applyCurrentParametersFromIndex.mockResolvedValue({})
    sheets.addSampleBlocks.mockResolvedValue({})
  })

  it('passes a denied completed-sample grant to the apply service', async () => {
    auth.isFeatureProtected.mockResolvedValue(true)
    auth.hasAccessGrant.mockReturnValue(false)
    const controller = new LabSheetsController(sheets as never, auth as never)
    const payload = { parameters: {}, startIndex: 3 }

    await controller.applyCurrentParameters(frontendUser, payload, 'client-1', 'wrong-grant')

    expect(auth.hasAccessGrant).toHaveBeenCalledWith('front-1', 'wrong-grant', 'COMPLETED_SAMPLE_DATA')
    expect(sheets.applyCurrentParametersFromIndex).toHaveBeenCalledWith('front-1', payload, 'client-1', false)
  })

  it('passes an accepted completed-sample grant to the apply service', async () => {
    auth.isFeatureProtected.mockResolvedValue(true)
    auth.hasAccessGrant.mockReturnValue(true)
    const controller = new LabSheetsController(sheets as never, auth as never)

    await controller.applyCurrentParameters(frontendUser, { parameters: {}, startIndex: 3 }, 'client-1', 'valid-grant')

    expect(sheets.applyCurrentParametersFromIndex).toHaveBeenCalledWith(
      'front-1',
      { parameters: {}, startIndex: 3 },
      'client-1',
      true
    )
  })

  it('allows completed-sample fields when the feature is not protected', async () => {
    auth.isFeatureProtected.mockResolvedValue(false)
    const controller = new LabSheetsController(sheets as never, auth as never)

    await controller.applyCurrentParameters(frontendUser, { parameters: {}, startIndex: 1 }, 'client-1')

    expect(auth.hasAccessGrant).not.toHaveBeenCalled()
    expect(sheets.applyCurrentParametersFromIndex).toHaveBeenCalledWith(
      'front-1',
      { parameters: {}, startIndex: 1 },
      'client-1',
      true
    )
  })

  it('passes a denied completed-sample grant to the add-blocks service', async () => {
    auth.isFeatureProtected.mockResolvedValue(true)
    auth.hasAccessGrant.mockReturnValue(false)
    const controller = new LabSheetsController(sheets as never, auth as never)

    await controller.addBlocks(frontendUser, 'sheet-1', 2, 'client-1', 'wrong-grant')

    expect(auth.hasAccessGrant).toHaveBeenCalledWith('front-1', 'wrong-grant', 'COMPLETED_SAMPLE_DATA')
    expect(sheets.addSampleBlocks).toHaveBeenCalledWith('front-1', 'sheet-1', 2, 'client-1', false)
  })

  it('passes an accepted completed-sample grant to the add-blocks service', async () => {
    auth.isFeatureProtected.mockResolvedValue(true)
    auth.hasAccessGrant.mockReturnValue(true)
    const controller = new LabSheetsController(sheets as never, auth as never)

    await controller.addBlocks(frontendUser, 'sheet-1', 1, 'client-1', 'valid-grant')

    expect(sheets.addSampleBlocks).toHaveBeenCalledWith('front-1', 'sheet-1', 1, 'client-1', true)
  })
})
