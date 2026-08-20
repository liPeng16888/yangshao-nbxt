import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'

let db: typeof import('./db')

const protectedDenied = { protected: true, allowed: false } as const
const protectedGranted = { protected: true, allowed: true } as const

async function expectMockRetestHttpError(
  operation: () => Promise<unknown>,
  status: number,
  data: Record<string, unknown>,
  errorMessage: string
) {
  const error = await operation().then(
    () => new Error('expected operation to reject'),
    (reason: unknown) => reason
  )
  expect(error).toBeInstanceOf(Error)
  expect(error).toMatchObject({ message: errorMessage })
  expect((error as { response?: unknown }).response).toEqual({ status, data })
  return error as Error & { response: { status: number; data: Record<string, unknown> } }
}

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

describe('sample retest mock lifecycle', () => {
  beforeEach(async () => {
    vi.resetModules()
    db = await import('./db')
  })

  it('snapshots parameters per creation, recomputes results, latches everFilled and voids irreversibly', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const block = sheet.sampleBlocks[0]
    const first = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [block.id], idempotencyKey: 'create-1'
    }))[0]

    await db.mockUpdateParameters({ ...defaultLabParameters, ironBlank: 0, ironFactor: 10 })
    const second = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [block.id], idempotencyKey: 'create-2'
    }))[0]

    expect([first.sequence, second.sequence]).toEqual([1, 2])
    expect(first.parameterSnapshot?.ironFactor).toBe(defaultLabParameters.ironFactor)
    expect(second.parameterSnapshot?.ironFactor).toBe(10)

    const saved = await db.mockSaveSampleRetest(sheet.id, first.id, {
      idempotencyKey: 'save-1', baseUpdatedAt: first.updatedAt,
      baseInputs: { ironRaw: null }, changedFields: { ironRaw: 0 }
    })
    expect(saved).toMatchObject({ everFilled: true, inputs: { ironRaw: 0 } })
    expect(saved.results.iron).toBe(-1.164)

    const cleared = await db.mockSaveSampleRetest(sheet.id, first.id, {
      idempotencyKey: 'save-2', baseUpdatedAt: saved.updatedAt,
      baseInputs: { ironRaw: 0 }, changedFields: { ironRaw: null }
    })
    expect(cleared).toMatchObject({ everFilled: true, inputs: { ironRaw: null } })
    await expect(db.mockDeleteSampleRetest(sheet.id, first.id, {
      idempotencyKey: 'delete-filled', baseUpdatedAt: cleared.updatedAt
    })).rejects.toThrow('已录入数据的复样只能作废')

    const voided = await db.mockVoidSampleRetest(sheet.id, first.id, {
      idempotencyKey: 'void-1', baseUpdatedAt: cleared.updatedAt, reason: '复核失败'
    })
    expect(voided).toMatchObject({
      status: 'VOID', readonly: true, voidReason: '复核失败',
      voidedById: 'u-admin', updatedById: 'u-admin'
    })
    expect(voided.voidedAt).toEqual(expect.any(String))
    await expect(db.mockSaveSampleRetest(sheet.id, first.id, {
      idempotencyKey: 'save-after-void', baseUpdatedAt: voided.updatedAt, changedFields: { ironRaw: 1 }
    })).rejects.toThrow('已作废的复样不能再修改')
  })

  it('replays idempotently, physically deletes only blank retests and never reuses their sequence', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const block = sheet.sampleBlocks[0]
    const payload = { sampleBlockIds: [block.id], idempotencyKey: 'create-1' }
    const first = await db.mockCreateSampleRetests(sheet.id, payload)
    const replay = await db.mockCreateSampleRetests(sheet.id, payload)
    expect(replay).toEqual(first)
    expect((await db.mockCurrentLabSheet()).sampleBlocks[0].retests).toHaveLength(1)

    const deleted = await db.mockDeleteSampleRetest(sheet.id, first[0].id, {
      idempotencyKey: 'delete-1', baseUpdatedAt: first[0].updatedAt
    })
    expect(deleted).toEqual({ id: first[0].id, sampleBlockId: block.id, deleted: true })
    await expect(db.mockDeleteSampleRetest(sheet.id, first[0].id, {
      idempotencyKey: 'delete-1', baseUpdatedAt: first[0].updatedAt
    })).resolves.toEqual(deleted)

    const next = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [block.id], idempotencyKey: 'create-2'
    }))[0]
    expect(next.sequence).toBe(2)
  })

  it('rejects stale exact-version operations and historical-date writes', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const retest = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'create-1'
    }))[0]

    await expect(db.mockDeleteSampleRetest(sheet.id, retest.id, {
      idempotencyKey: 'delete-stale', baseUpdatedAt: '2026-08-19T00:00:00.000Z'
    })).rejects.toThrow('该复样已被修改，请刷新后重试')

    const historical = await db.mockLabSheetByDate('2026-08-19')
    await expect(db.mockCreateSampleRetests(historical.id, {
      sampleBlockIds: [historical.sampleBlocks[0].id], idempotencyKey: 'history-create'
    })).rejects.toThrow('历史日期表格仅支持查看，不能修改')
  })

  it('redacts completed-parent retests on mock reads without the current access grant', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const block = sheet.sampleBlocks[0]
    const retest = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [block.id], idempotencyKey: 'create-1'
    }))[0]
    await db.mockSaveSampleRetest(sheet.id, retest.id, {
      idempotencyKey: 'save-1', baseUpdatedAt: retest.updatedAt, changedFields: { ironRaw: 1 }
    })
    await db.mockSaveSampleBlock(sheet.id, {
      id: block.id,
      changedFields: { completed: true }
    })

    const protectedSheet = await db.mockCurrentLabSheet(protectedDenied)
    expect(protectedSheet.sampleBlocks[0].retests[0]).toMatchObject({
      sensitiveFieldsHidden: true,
      inputs: { ironRaw: null },
      results: { iron: null },
      parameterSnapshot: null
    })
    const grantedSheet = await db.mockCurrentLabSheet(protectedGranted)
    expect(grantedSheet.sampleBlocks[0].retests[0].parameterSnapshot).toEqual(retest.parameterSnapshot)
  })

  it('accepts only detection fields and normalizes every nonfinite detection value to null', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const retest = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'create-1'
    }))[0]
    const changedFields = {
      ironRaw: Number.POSITIVE_INFINITY,
      titaniumRaw: Number.NaN,
      moisture: 0,
      sampleNumber: '不允许混入'
    }

    const saved = await db.mockSaveSampleRetest(sheet.id, retest.id, {
      idempotencyKey: 'save-nonfinite',
      baseUpdatedAt: retest.updatedAt,
      changedFields
    })

    expect(saved.inputs).toMatchObject({ ironRaw: null, titaniumRaw: null, moisture: 0 })
    expect(saved.inputs).not.toHaveProperty('sampleNumber')
    expect(saved.everFilled).toBe(true)
  })

  it('merges a stale different-field save and returns an Axios-compatible safe-latest 409 for a stale same-field save', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const original = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'create-1'
    }))[0]
    const first = await db.mockSaveSampleRetest(sheet.id, original.id, {
      idempotencyKey: 'save-iron', baseUpdatedAt: original.updatedAt,
      baseInputs: { ironRaw: null }, changedFields: { ironRaw: 1 }
    })

    const merged = await db.mockSaveSampleRetest(sheet.id, original.id, {
      idempotencyKey: 'save-silicon-stale', baseUpdatedAt: original.updatedAt,
      baseInputs: { siliconRaw: null }, changedFields: { siliconRaw: 2 }
    })
    expect(merged.inputs).toMatchObject({ ironRaw: 1, siliconRaw: 2 })

    await expect(db.mockSaveSampleRetest(sheet.id, original.id, {
      idempotencyKey: 'save-iron-stale', baseUpdatedAt: original.updatedAt,
      baseInputs: { ironRaw: null }, changedFields: { ironRaw: 3 }
    })).rejects.toMatchObject({
      response: {
        status: 409,
        data: {
          code: 'SAMPLE_RETEST_INPUT_CONFLICT',
          message: '该复样已被另一台设备修改，请确认后再保存',
          fields: ['ironRaw'],
          retest: expect.objectContaining({
            id: original.id,
            inputs: expect.objectContaining({ ironRaw: 1 }),
            results: expect.any(Object),
            parameterSnapshot: expect.any(Object)
          })
        }
      }
    })
    expect(first.inputs.ironRaw).toBe(1)
  })

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['invalid', 'not-a-date'],
    ['date-only', '2026-08-20']
  ])('rejects a %s Mock SAVE baseUpdatedAt before mutation', async (_case, baseUpdatedAt) => {
    const sheet = await db.mockCurrentLabSheet()
    const created = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: `create-${_case}`
    }))[0]

    await expect(db.mockSaveSampleRetest(sheet.id, created.id, {
      idempotencyKey: `save-${_case}`,
      baseUpdatedAt,
      changedFields: { ironRaw: 1 }
    } as never)).rejects.toThrow('缺少或无效的复样版本时间')
    expect((await db.mockCurrentLabSheet()).sampleBlocks[0].retests[0].inputs.ironRaw).toBeNull()
  })

  it('rejects a Mock SAVE version ahead of the persisted updatedAt', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const created = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'create-future-version'
    }))[0]
    const futureVersion = new Date(Date.parse(created.updatedAt) + 1).toISOString()

    await expect(db.mockSaveSampleRetest(sheet.id, created.id, {
      idempotencyKey: 'save-future-version',
      baseUpdatedAt: futureVersion,
      baseInputs: { ironRaw: null },
      changedFields: { ironRaw: 1 }
    })).rejects.toMatchObject({
      response: {
        status: 409,
        data: expect.objectContaining({ code: 'SAMPLE_RETEST_VERSION_CONFLICT' })
      }
    })
    expect((await db.mockCurrentLabSheet()).sampleBlocks[0].retests[0].inputs.ironRaw).toBeNull()
  })

  it.each([
    ['missing', null],
    ['incomplete', { ironFactor: 10 }],
    ['nonfinite', { ...defaultLabParameters, ironFactor: Number.POSITIVE_INFINITY }]
  ])('rejects a %s persisted Mock parameter snapshot instead of applying default coefficients', async (_case, snapshot) => {
    const sheet = await db.mockCurrentLabSheet()
    const created = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: `create-bad-snapshot-${_case}`
    }))[0]
    db.setMockSampleRetestParameterSnapshotForTest(created.id, snapshot)

    await expectMockRetestHttpError(() => db.mockSaveSampleRetest(sheet.id, created.id, {
      idempotencyKey: `save-bad-snapshot-${_case}`,
      baseUpdatedAt: created.updatedAt,
      changedFields: { ironRaw: 1 }
    }), 422, {
      code: 'SAMPLE_RETEST_PARAMETER_SNAPSHOT_INVALID',
      message: '复样参数快照无效，无法保存'
    }, '复样参数快照无效')
    db.setMockSampleRetestParameterSnapshotForTest(created.id, defaultLabParameters)
    expect((await db.mockCurrentLabSheet()).sampleBlocks[0].retests[0].inputs.ironRaw).toBeNull()
  })

  it.each([
    ['missing', null],
    ['incomplete', { ironFactor: 9876 }],
    ['nonfinite', { ...defaultLabParameters, ironFactor: Number.POSITIVE_INFINITY }]
  ])('rejects a %s persisted Mock snapshot on visible reads without returning sensitive values', async (_case, snapshot) => {
    const sheet = await db.mockCurrentLabSheet()
    const created = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: `create-bad-read-${_case}`
    }))[0]
    const saved = await db.mockSaveSampleRetest(sheet.id, created.id, {
      idempotencyKey: `save-secret-read-${_case}`,
      baseUpdatedAt: created.updatedAt,
      changedFields: { ironRaw: 4321 }
    })
    db.setMockSampleRetestParameterSnapshotForTest(saved.id, snapshot)

    let thrown: unknown
    try {
      await db.mockCurrentLabSheet()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).toMatchObject({ message: '复样参数快照无效' })
    expect((thrown as { response?: unknown }).response).toEqual({
      status: 422,
      data: {
        code: 'SAMPLE_RETEST_PARAMETER_SNAPSHOT_INVALID',
        message: '复样参数快照无效，无法读取'
      }
    })
    const serialized = JSON.stringify(thrown)
    expect(serialized).not.toContain('4321')
    expect(serialized).not.toContain('9876')
    expect(serialized).not.toContain('ironFactor')
  })

  it('returns Axios-compatible 404 errors for missing samples and retests across lifecycle operations', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const operations = [
      () => db.mockCreateSampleRetests(sheet.id, {
        sampleBlockIds: ['missing-block'], idempotencyKey: 'missing-create'
      }),
      () => db.mockSaveSampleRetest(sheet.id, 'missing-retest', {
        idempotencyKey: 'missing-save', baseUpdatedAt: '2026-08-20T09:00:00.000Z', changedFields: { ironRaw: 1 }
      }),
      () => db.mockDeleteSampleRetest(sheet.id, 'missing-retest', {
        idempotencyKey: 'missing-delete', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
      }),
      () => db.mockVoidSampleRetest(sheet.id, 'missing-retest', {
        idempotencyKey: 'missing-void', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
      })
    ]
    for (const operation of operations) {
      const message = operation === operations[0] ? '未找到样品' : '未找到复样'
      await expectMockRetestHttpError(operation, 404, { code: 'SAMPLE_RETEST_NOT_FOUND', message }, message)
    }
  })

  it('returns Axios-compatible 404 errors for every cross-tenant retest mutation', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const [saveTarget, deleteTarget, voidTarget] = await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'tenant-target-save'
    }).then(async ([first]) => {
      const [second] = await db.mockCreateSampleRetests(sheet.id, {
        sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'tenant-target-delete'
      })
      const [third] = await db.mockCreateSampleRetests(sheet.id, {
        sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'tenant-target-void'
      })
      return [first, second, third]
    })
    await db.mockRegister({
      username: '其他租户', account: 'tenant-2', password: 'secret123',
      confirmPassword: 'secret123', inviteCode: 'YANGSHAO-2026'
    })

    const crossTenantWrites = [
      () => db.mockCreateSampleRetests(sheet.id, {
        sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'cross-tenant-create'
      }),
      () => db.mockSaveSampleRetest(sheet.id, saveTarget.id, {
        idempotencyKey: 'cross-tenant-save', baseUpdatedAt: saveTarget.updatedAt, changedFields: { ironRaw: 1 }
      }),
      () => db.mockDeleteSampleRetest(sheet.id, deleteTarget.id, {
        idempotencyKey: 'cross-tenant-delete', baseUpdatedAt: deleteTarget.updatedAt
      }),
      () => db.mockVoidSampleRetest(sheet.id, voidTarget.id, {
        idempotencyKey: 'cross-tenant-void', baseUpdatedAt: voidTarget.updatedAt
      })
    ]
    for (const write of crossTenantWrites) {
      await expectMockRetestHttpError(
        write,
        404,
        { code: 'SAMPLE_RETEST_NOT_FOUND', message: '未找到表格' },
        '未找到表格'
      )
    }
  })

  it('allows completed writes when unprotected, denies protected writes without a grant, and allows a valid grant', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const block = sheet.sampleBlocks[0]
    await db.mockSaveSampleBlock(sheet.id, { id: block.id, changedFields: { completed: true } })

    const unprotected = await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [block.id], idempotencyKey: 'unprotected-create'
    })
    expect(unprotected[0].sensitiveFieldsHidden).toBe(false)

    await expect(db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [block.id], idempotencyKey: 'protected-denied-create'
    }, protectedDenied)).rejects.toThrow('已完成样品需要验证后才能创建复样')

    await expect(db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [block.id], idempotencyKey: 'protected-granted-create'
    }, protectedGranted)).resolves.toEqual([
      expect.objectContaining({ sensitiveFieldsHidden: false })
    ])
  })

  it('replays SAVE and VOID snapshots without duplicate mutation', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const created = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'create-1'
    }))[0]
    const savePayload = {
      idempotencyKey: 'save-1', baseUpdatedAt: created.updatedAt, changedFields: { ironRaw: 1 }
    }
    const saved = await db.mockSaveSampleRetest(sheet.id, created.id, savePayload)
    const saveReplay = await db.mockSaveSampleRetest(sheet.id, created.id, savePayload)
    expect(saveReplay).toEqual(saved)
    expect((await db.mockCurrentLabSheet()).sampleBlocks[0].retests).toHaveLength(1)

    const voidPayload = {
      idempotencyKey: 'void-1', baseUpdatedAt: saved.updatedAt, reason: '复核失败'
    }
    const voided = await db.mockVoidSampleRetest(sheet.id, created.id, voidPayload)
    const voidReplay = await db.mockVoidSampleRetest(sheet.id, created.id, voidPayload)
    expect(voidReplay).toEqual(voided)
    expect((await db.mockCurrentLabSheet()).sampleBlocks[0].retests).toEqual([
      expect.objectContaining({ id: created.id, status: 'VOID', updatedAt: voided.updatedAt })
    ])
  })

  it('reports a VOID cross-operation idempotency conflict before missing-row lookup', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const created = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'create-1'
    }))[0]
    await db.mockDeleteSampleRetest(sheet.id, created.id, {
      idempotencyKey: 'shared-key', baseUpdatedAt: created.updatedAt
    })

    await expect(db.mockVoidSampleRetest(sheet.id, created.id, {
      idempotencyKey: 'shared-key', baseUpdatedAt: created.updatedAt
    })).rejects.toThrow('幂等请求编号已用于不同的复样操作')
  })

  it('rejects VOID for a persistently blank retest and marks historical reads readonly', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const blank = (await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'create-1'
    }))[0]
    await expect(db.mockVoidSampleRetest(sheet.id, blank.id, {
      idempotencyKey: 'void-blank', baseUpdatedAt: blank.updatedAt
    })).rejects.toThrow('未录入数据的复样可以直接删除')

    vi.setSystemTime(new Date(Date.parse(`${sheet.date}T04:00:00.000Z`) + 86_400_000))
    try {
      const historical = await db.mockLabSheetByDate(sheet.date)
      expect(historical.readonly).toBe(true)
      expect(historical.sampleBlocks.every((block) => block.readonly)).toBe(true)
      expect(historical.sampleBlocks[0].retests[0]).toMatchObject({ id: blank.id, readonly: true })
    } finally {
      vi.useRealTimers()
    }
  })

  it('enforces DATA_MAIN for every subaccount retest mutation while keeping main and permitted subaccounts functional', async () => {
    const sheet = await db.mockCurrentLabSheet()
    const [saveTarget, deleteTarget, voidTarget] = await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'main-create-save-target'
    }).then(async ([first]) => {
      const [second] = await db.mockCreateSampleRetests(sheet.id, {
        sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'main-create-delete-target'
      })
      const [third] = await db.mockCreateSampleRetests(sheet.id, {
        sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'main-create-void-target'
      })
      return [first, second, third]
    })
    const filledVoidTarget = await db.mockSaveSampleRetest(sheet.id, voidTarget.id, {
      idempotencyKey: 'main-fill-void-target', baseUpdatedAt: voidTarget.updatedAt, changedFields: { ironRaw: 1 }
    })
    await db.mockCreateFrontendSubAccount({
      account: 'no-data-main', username: '无数据权限', password: 'secret123', confirmPassword: 'secret123',
      permissions: ['REPORTS'], requiresAccessGuardPassword: false
    })
    await db.mockCreateFrontendSubAccount({
      account: 'with-data-main', username: '有数据权限', password: 'secret123', confirmPassword: 'secret123',
      permissions: ['DATA_MAIN'], requiresAccessGuardPassword: false
    })
    await db.mockLogin({ account: 'no-data-main', password: 'secret123' })

    const deniedWrites = [
      () => db.mockCreateSampleRetests(sheet.id, {
        sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'denied-create'
      }),
      () => db.mockSaveSampleRetest(sheet.id, saveTarget.id, {
        idempotencyKey: 'denied-save', baseUpdatedAt: saveTarget.updatedAt, changedFields: { ironRaw: 2 }
      }),
      () => db.mockDeleteSampleRetest(sheet.id, deleteTarget.id, {
        idempotencyKey: 'denied-delete', baseUpdatedAt: deleteTarget.updatedAt
      }),
      () => db.mockVoidSampleRetest(sheet.id, voidTarget.id, {
        idempotencyKey: 'denied-void', baseUpdatedAt: filledVoidTarget.updatedAt
      })
    ]
    for (const denied of deniedWrites) {
      const error = await expectMockRetestHttpError(
        denied,
        403,
        {
          message: '子账号没有该菜单的访问权限',
          error: 'Forbidden',
          statusCode: 403
        },
        '当前子账号没有数据计算权限'
      )
      expect(error.response.data).not.toHaveProperty('code')
    }

    await db.mockLogin({ account: 'with-data-main', password: 'secret123' })
    const [permittedSaveTarget] = await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'permitted-create-save'
    })
    await expect(db.mockSaveSampleRetest(sheet.id, permittedSaveTarget.id, {
      idempotencyKey: 'permitted-save', baseUpdatedAt: permittedSaveTarget.updatedAt, changedFields: { ironRaw: 3 }
    })).resolves.toMatchObject({ updatedById: expect.any(String), inputs: { ironRaw: 3 } })
    const [permittedDeleteTarget] = await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'permitted-create-delete'
    })
    await expect(db.mockDeleteSampleRetest(sheet.id, permittedDeleteTarget.id, {
      idempotencyKey: 'permitted-delete', baseUpdatedAt: permittedDeleteTarget.updatedAt
    })).resolves.toMatchObject({ deleted: true })
    const [permittedVoidTarget] = await db.mockCreateSampleRetests(sheet.id, {
      sampleBlockIds: [sheet.sampleBlocks[0].id], idempotencyKey: 'permitted-create-void'
    })
    const permittedFilled = await db.mockSaveSampleRetest(sheet.id, permittedVoidTarget.id, {
      idempotencyKey: 'permitted-fill', baseUpdatedAt: permittedVoidTarget.updatedAt, changedFields: { ironRaw: 4 }
    })
    await expect(db.mockVoidSampleRetest(sheet.id, permittedVoidTarget.id, {
      idempotencyKey: 'permitted-void', baseUpdatedAt: permittedFilled.updatedAt
    })).resolves.toMatchObject({ status: 'VOID', readonly: true })
  })
})
