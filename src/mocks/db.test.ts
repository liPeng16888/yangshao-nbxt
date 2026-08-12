import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'

let db: typeof import('./db')

describe('segmented parameter mock database validation', () => {
  beforeEach(async () => {
    vi.resetModules()
    db = await import('./db')
  })

  it.each([0, -1, 1.5, Number.NaN, '1', true, [1]])(
    'rejects a non-positive-integer start index without mutating the mock sheet: %s',
    async (startIndex) => {
      const before = await db.mockCurrentLabSheet()

      await expect(db.mockApplyParametersFromIndex(defaultLabParameters, startIndex as never))
        .rejects.toThrow('起始样品编号必须是正整数')

      expect(await db.mockCurrentLabSheet()).toEqual(before)
    }
  )

  it.each([
    null,
    { ...defaultLabParameters, ironFactor: Number.NaN },
    { ...defaultLabParameters, ironFactor: Number.POSITIVE_INFINITY },
    { ...defaultLabParameters, ironFactor: '25' },
    Object.fromEntries(Object.entries(defaultLabParameters).filter(([key]) => key !== 'ironFactor'))
  ])('rejects incomplete or non-finite parameter payloads without mutation', async (parameters) => {
    const before = await db.mockCurrentLabSheet()

    await expect(db.mockApplyParametersFromIndex(parameters as never, 1))
      .rejects.toThrow('参数必须是有限数值')

    expect(await db.mockCurrentLabSheet()).toEqual(before)
  })

  it('rejects a missing boundary atomically', async () => {
    const before = await db.mockCurrentLabSheet()
    const changed = { ...defaultLabParameters, ironFactor: 99 }

    await expect(db.mockApplyParametersFromIndex(changed, 999))
      .rejects.toThrow('起始样品不存在，请刷新后重新选择')

    expect(await db.mockCurrentLabSheet()).toEqual(before)
  })

  it('marks blank snapshots before the boundary while keeping sheet parameters unmarked', async () => {
    const changed = { ...defaultLabParameters, ironFactor: 99 }

    const result = await db.mockApplyParametersFromIndex(changed, 3)

    expect(result.parameters).not.toHaveProperty('segmentedApplication')
    expect(result.sampleBlocks[1].parameterSnapshot).toMatchObject({
      ironFactor: defaultLabParameters.ironFactor,
      segmentedApplication: true
    })
    expect(result.sampleBlocks[2].parameterSnapshot).toMatchObject({
      ironFactor: 99,
      segmentedApplication: true
    })
  })

  it('keeps an initial blank block on its original parameters after a later boundary', async () => {
    const before = await db.mockCurrentLabSheet()
    const originalBlock = before.sampleBlocks[1]
    const parametersA = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }

    const applied = await db.mockApplyParametersFromIndex(parametersA, 3)

    expect(applied.sampleBlocks[1].parameterSnapshot).toEqual({
      ...originalBlock.parameterSnapshot,
      segmentedApplication: true
    })
    expect(applied.sampleBlocks[1].inputs).toEqual(originalBlock.inputs)
    expect(applied.sampleBlocks[1].results).toEqual(originalBlock.results)

    const saved = await db.mockSaveSampleBlock(applied.id, {
      id: applied.sampleBlocks[1].id,
      changedFields: { ironRaw: 2 }
    })

    expect(saved.parameterSnapshot).toMatchObject({
      ironFactor: defaultLabParameters.ironFactor,
      segmentedApplication: true
    })
    expect(saved.results.iron).toBe(57.036)
  })

  it('keeps an added blank block on parameters A after applying parameters B from the next boundary', async () => {
    const parametersA = { ...defaultLabParameters, ironBlank: 0, ironFactor: 10 }
    const parametersB = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }

    await db.mockApplyParametersFromIndex(parametersA, 3)
    const withAddedBlocks = await db.mockAddSampleBlocks((await db.mockCurrentLabSheet()).id, 2)
    const originalBlock11 = withAddedBlocks.sampleBlocks[10]

    const applied = await db.mockApplyParametersFromIndex(parametersB, 12)

    expect(applied.sampleBlocks[10].parameterSnapshot).toEqual({
      ...originalBlock11.parameterSnapshot,
      segmentedApplication: true
    })
    expect(applied.sampleBlocks[10].inputs).toEqual(originalBlock11.inputs)
    expect(applied.sampleBlocks[10].results).toEqual(originalBlock11.results)
    expect(applied.sampleBlocks[11].parameterSnapshot).toMatchObject({
      ironFactor: 25,
      segmentedApplication: true
    })

    const saved = await db.mockSaveSampleBlock(applied.id, {
      id: applied.sampleBlocks[10].id,
      changedFields: { ironRaw: 2 }
    })

    expect(saved.parameterSnapshot).toMatchObject({
      ironFactor: 10,
      segmentedApplication: true
    })
    expect(saved.results.iron).toBe(20)
  })
})

describe('frontend subaccount mock lifecycle', () => {
  beforeEach(async () => {
    vi.resetModules()
    db = await import('./db')
  })

  it('creates, updates, disables, resets and deletes a subaccount without exposing passwords', async () => {
    const created = await db.mockCreateFrontendSubAccount({
      account: 'operator01',
      username: '操作员一号',
      password: 'secret123',
      confirmPassword: 'secret123',
      permissions: ['DATA_MAIN', 'DATA_MAIN', 'REPORTS'],
      requiresAccessGuardPassword: true
    })

    expect(created.permissions).toEqual(['DATA_MAIN', 'REPORTS'])
    expect(created).not.toHaveProperty('password')
    expect(created).not.toHaveProperty('passwordHash')
    expect(created).not.toHaveProperty('passwordCipher')

    const login = await db.mockLogin({ account: 'operator01', password: 'secret123' })
    expect(login.user).toMatchObject({
      role: 'FRONTEND_SUB_USER',
      dataOwnerId: 'u-admin',
      isFrontendSubAccount: true,
      permissions: ['DATA_MAIN', 'REPORTS']
    })

    const updated = await db.mockUpdateFrontendSubAccount(created.id, {
      username: '数据操作员',
      permissions: ['DATA_STANDARD_SAMPLE'],
      requiresAccessGuardPassword: false
    })
    expect(updated).toMatchObject({
      username: '数据操作员',
      permissions: ['DATA_STANDARD_SAMPLE'],
      requiresAccessGuardPassword: false,
      permissionVersion: 2
    })

    await db.mockSetFrontendSubAccountStatus(created.id, true, '暂时停用')
    expect(await db.mockFrontendSubAccounts()).toEqual([
      expect.objectContaining({ disabled: true, disabledReason: '暂时停用', permissionVersion: 3 })
    ])

    await expect(db.mockResetFrontendSubAccountPassword(created.id, {
      currentPassword: 'wrong',
      newPassword: 'newpass123',
      confirmPassword: 'newpass123'
    })).rejects.toThrow('主账号当前密码错误')

    await db.mockResetFrontendSubAccountPassword(created.id, {
      currentPassword: 'admin123',
      newPassword: 'newpass123',
      confirmPassword: 'newpass123'
    })
    expect((await db.mockFrontendSubAccounts())[0].permissionVersion).toBe(4)
    await expect(db.mockLogin({ account: 'operator01', password: 'secret123' })).rejects.toThrow('子账号已停用')

    await db.mockSetFrontendSubAccountStatus(created.id, false)
    await expect(db.mockLogin({ account: 'operator01', password: 'secret123' })).rejects.toThrow('账号或密码错误')
    await expect(db.mockLogin({ account: 'operator01', password: 'newpass123' })).resolves.toMatchObject({
      user: { role: 'FRONTEND_SUB_USER' }
    })

    await db.mockDeleteFrontendSubAccount(created.id)
    expect(await db.mockFrontendSubAccounts()).toEqual([])
  })
})
