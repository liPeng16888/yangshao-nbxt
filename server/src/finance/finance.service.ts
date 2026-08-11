import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { FinanceDeletionRequestStatus, FinanceDeletionRequestType, MonthlySettlementStatus, PaymentMethod, Prisma, ReminderType } from '@prisma/client'
import dayjs from 'dayjs'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from '../auth/current-user'
import { AdminAccessService } from '../admin/admin-access.service'
import { RemindersService } from '../reminders/reminders.service'
import { currentMonthInBeijing, datesBetween, todayInBeijing } from '../common/date'
import { toMoney } from '../common/money'
import { calculateResults, defaultLabParameters } from '../common/lab'
import { requiredBaseUpdatedAt, staleWrite } from '../common/optimistic-concurrency'
import { TenantRealtimeService } from '../realtime/tenant-realtime.service'

const incomeStatuses = ['已结款', '未结款', '月结款', '预存款', '未选择'] as const
const paidMonthlySettlementRemark = '此款项已结清'
const monthlyElementDefinitions = [
  { key: 'aluminum', label: '铝' },
  { key: 'silicon', label: '硅' },
  { key: 'iron', label: '铁' },
  { key: 'aluminumSiliconRatio', label: '铝硅比' },
  { key: 'sulfur', label: '硫' },
  { key: 'carbon', label: '碳' },
  { key: 'moisture', label: '水分' },
  { key: 'calcium', label: '钙' },
  { key: 'magnesium', label: '镁' },
  { key: 'whiteness', label: '白度' },
  { key: 'density', label: '比重' },
  { key: 'titanium', label: '钛' },
  { key: 'burnLoss', label: '灼减' }
] as const
const monthlyElementAliases: Record<(typeof monthlyElementDefinitions)[number]['key'], string[]> = {
  aluminum: ['三氧化二铝', '氧化铝', '铝', 'Al₂O₃', 'Al2O3'],
  silicon: ['二氧化硅', '氧化硅', '硅', 'SiO₂', 'SiO2'],
  iron: ['三氧化二铁', '氧化铁', '铁', 'Fe₂O₃', 'Fe2O3'],
  aluminumSiliconRatio: ['铝硅比', 'A/S'],
  sulfur: ['全硫', '硫', 'S'],
  carbon: ['碳', 'C'],
  moisture: ['水分', '水份', 'H₂O', 'H2O'],
  calcium: ['氧化钙', '钙', 'CaO'],
  magnesium: ['氧化镁', '镁', 'MgO'],
  whiteness: ['白度'],
  density: ['比重'],
  titanium: ['钛', 'Ti'],
  burnLoss: ['灼减', '烧失', 'LOI']
}
type IncomeStatus = (typeof incomeStatuses)[number]
type MonthlyElementCount = { key: string; label: string; count: number }
type FrontendExpensePayload = {
  paymentDate: string
  item: string
  amount: number
  paymentMethod: PaymentMethod
  screenshotUrl?: string
  screenshotUrls?: string[]
  remark?: string
}
type FinanceDeletionSourcePayload = {
  sourceType?: string
  sourceId?: string
  reason?: string
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAccess: AdminAccessService,
    private readonly reminders: RemindersService,
    private readonly realtime?: TenantRealtimeService
  ) {}

  async listFrontendExpenses(frontendUserId: string, month = currentMonthInBeijing()) {
    const rows = await this.prisma.financeEntry.findMany({
      where: { frontendUserId, paymentDate: { startsWith: month } },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }]
    })
    const pendingMap = await this.pendingDeletionRequestMap(frontendUserId, FinanceDeletionRequestType.EXPENSE, rows.map((row) => row.id))
    return rows.map((row) => this.expenseDto(row, pendingMap.get(row.id)))
  }

  async createFrontendExpense(frontendUserId: string, actorUserIdOrPayload: string | FrontendExpensePayload, maybePayload?: FrontendExpensePayload) {
    const actorUserId = typeof actorUserIdOrPayload === 'string' ? actorUserIdOrPayload : frontendUserId
    const payload = typeof actorUserIdOrPayload === 'string' ? maybePayload! : actorUserIdOrPayload
    this.assertValidExpensePayload(payload)
    const screenshotUrls = this.normalizeScreenshotUrls(payload.screenshotUrls, payload.screenshotUrl)
    const row = await this.prisma.financeEntry.create({
      data: {
        frontendUserId,
        paymentDate: payload.paymentDate,
        item: payload.item,
        amount: toMoney(payload.amount),
        paymentMethod: payload.paymentMethod,
        screenshotUrl: this.serializeScreenshotUrls(screenshotUrls),
        remark: payload.remark || null
      }
    })
    this.publish(frontendUserId, actorUserId, 'finance-expenses', row.id, 'create', row.createdAt)
    return this.expenseDto(row)
  }

  async createFrontendExpenses(frontendUserId: string, actorUserIdOrPayloads: string | FrontendExpensePayload[], maybePayloads?: FrontendExpensePayload[]) {
    const actorUserId = typeof actorUserIdOrPayloads === 'string' ? actorUserIdOrPayloads : frontendUserId
    const payloads = typeof actorUserIdOrPayloads === 'string' ? maybePayloads! : actorUserIdOrPayloads
    if (!Array.isArray(payloads) || !payloads.length) throw new BadRequestException('请至少填写一条支出账单')
    payloads.forEach((payload) => this.assertValidExpensePayload(payload))
    const rows = []
    for (const payload of payloads) {
      rows.push(await this.createFrontendExpense(frontendUserId, actorUserId, payload))
    }
    return rows
  }

  async listFrontendExpenseMonths(frontendUserId: string) {
    const rows = await this.prisma.financeEntry.findMany({
      where: { frontendUserId },
      select: { paymentDate: true },
      orderBy: { paymentDate: 'desc' }
    })
    return Array.from(new Set(rows.map((row) => row.paymentDate.slice(0, 7))))
  }

  async getFrontendIncomeReport(frontendUserId: string, month = currentMonthInBeijing()) {
    const startDate = `${month}-01`
    const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD')
    const sheets = await this.loadSheets([frontendUserId], startDate, endDate)
    const prepaidRecharges = await this.prisma.prepaidRechargeRecord.findMany({
      where: { frontendUserId, rechargeDate: { gte: startDate, lte: endDate } }
    })
    return this.buildIncomeReport(month, sheets, prepaidRecharges)
  }

  async getFrontendUnsettledSamples(frontendUserId: string) {
    const sheets = await this.loadSheets([frontendUserId])
    return this.getUnsettledRows(sheets).sort((a, b) => `${b.date}-${b.sequence}`.localeCompare(`${a.date}-${a.sequence}`))
  }

  async markFrontendSamplePaid(frontendUserId: string, blockId: string, actorUserId = frontendUserId) {
    const [saved] = await this.markFrontendSamplesPaid(frontendUserId, [blockId], actorUserId)
    return saved
  }

  async markFrontendSamplesPaid(frontendUserId: string, rawBlockIds: string[], actorUserId = frontendUserId) {
    const blockIds = Array.from(new Set((Array.isArray(rawBlockIds) ? rawBlockIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)))
    if (!blockIds.length) throw new BadRequestException('请选择需要结款的样品')

    const rows = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "LabSheet"
        WHERE "id" IN (
          SELECT "sheetId" FROM "SampleBlock" WHERE "id" IN (${Prisma.join(blockIds)})
        )
        ORDER BY "id"
        FOR UPDATE
      `)
      const blocks = await transaction.sampleBlock.findMany({
        where: { id: { in: blockIds } },
        include: { sheet: true }
      })
      if (blocks.length !== blockIds.length || blocks.some((block) => block.sheet.frontendUserId !== frontendUserId)) {
        throw new NotFoundException('部分样品不存在或无权操作')
      }

      const blocksById = new Map(blocks.map((block) => [block.id, block]))
      const orderedBlocks = blockIds.map((id) => blocksById.get(id)!)
      if (orderedBlocks.some((block) => ((block.inputs || {}) as Record<string, unknown>).paymentStatus !== '未结款')) {
        throw new BadRequestException('部分样品已不是未结款状态，请刷新后重试')
      }

      const savedBlocks = []
      for (const block of orderedBlocks) {
        const oldInputs = (block.inputs || {}) as Record<string, unknown>
        const inputs = { ...oldInputs, paymentStatus: '已结款' }
        const parameters = (block.parameterSnapshot || block.sheet.parameters || defaultLabParameters) as typeof defaultLabParameters
        const saved = await transaction.sampleBlock.update({
          where: { id: block.id },
          data: {
            inputs,
            results: calculateResults(inputs, parameters)
          }
        })
        await transaction.cellChangeLog.create({
          data: {
            sheetId: block.sheetId,
            blockId: block.id,
            frontendUserId,
            changedById: actorUserId,
            field: 'paymentStatus',
            oldValue: this.jsonValue(oldInputs.paymentStatus ?? null),
            newValue: '已结款'
          }
        })
        savedBlocks.push(saved)
      }
      return savedBlocks.map((block) => this.blockDto(block))
    })
    for (const row of rows) this.publish(frontendUserId, actorUserId, 'finance-unsettled', row.id, 'update', new Date())
    return rows
  }

  async getFrontendMonthlySettlementReport(frontendUserId: string, month = currentMonthInBeijing()) {
    const sheets = await this.loadSheets([frontendUserId], `${month}-01`, dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD'))
    const dailyRows = this.getMonthlyDailyRows(sheets)
    const savedRows = await this.prisma.monthlySettlementRecord.findMany({ where: { frontendUserId, month } })
    return this.buildMonthlyReport(month, dailyRows, savedRows)
  }

  async updateFrontendMonthlySettlement(frontendUserId: string, actorUserId: string, payload: { month: string; customer: string; settlementStatus: string; paidAmount?: number | null; remark?: string; baseUpdatedAt?: string }) {
    if (!payload.month || !payload.customer) throw new BadRequestException('月份和客户不能为空')
    const status = this.monthlyStatusFromChinese(payload.settlementStatus)
    const remark = status === MonthlySettlementStatus.PAID ? paidMonthlySettlementRemark : payload.remark || null
    const key = { month: payload.month, frontendUserId, customer: payload.customer }
    const current = await this.prisma.monthlySettlementRecord.findUnique({
      where: { month_frontendUserId_customer: key }
    })
    const data = {
      status,
      paidAmount: status === MonthlySettlementStatus.PARTIAL ? toMoney(payload.paidAmount) : status === MonthlySettlementStatus.PAID ? toMoney(payload.paidAmount) : null,
      remark
    }
    let row
    if (current) {
      const baseUpdatedAt = requiredBaseUpdatedAt(payload.baseUpdatedAt)
      const result = await this.prisma.monthlySettlementRecord.updateMany({
        where: { id: current.id, frontendUserId, updatedAt: baseUpdatedAt }, data
      })
      row = await this.prisma.monthlySettlementRecord.findUnique({ where: { id: current.id } })
      if (!result.count) staleWrite(row ? this.monthlyRecordDto(row, payload.customer, payload.month) : null)
      if (!row) throw new NotFoundException('月结款记录不存在')
    } else {
      row = await this.prisma.monthlySettlementRecord.create({
        data: {
        month: payload.month,
        frontendUserId,
        customer: payload.customer,
          ...data
        }
      })
    }
    this.publish(frontendUserId, actorUserId, 'finance-monthly', row.id, current ? 'update' : 'create', row.updatedAt)
    return this.monthlyRecordDto(row, payload.customer, payload.month)
  }

  async getFrontendPrepaidRecharges(frontendUserId: string) {
    const rows = await this.prisma.prepaidRechargeRecord.findMany({
      where: { frontendUserId },
      orderBy: [{ rechargeDate: 'desc' }, { createdAt: 'desc' }]
    })
    const pendingMap = await this.pendingDeletionRequestMap(frontendUserId, FinanceDeletionRequestType.PREPAID_RECHARGE, rows.map((row) => row.id))
    return rows.map((row) => this.prepaidRechargeDto(row, pendingMap.get(row.id)))
  }

  async createFrontendPrepaidRecharge(frontendUserId: string, actorUserIdOrPayload: string | { rechargeDate?: string; customer?: string; amount?: number; usableTimes?: number; remark?: string }, maybePayload?: { rechargeDate?: string; customer?: string; amount?: number; usableTimes?: number; remark?: string }) {
    const actorUserId = typeof actorUserIdOrPayload === 'string' ? actorUserIdOrPayload : frontendUserId
    const payload = typeof actorUserIdOrPayload === 'string' ? maybePayload! : actorUserIdOrPayload
    const rechargeDate = String(payload.rechargeDate || '').trim()
    const customer = String(payload.customer || '').trim()
    const amount = Number(payload.amount)
    const usableTimes = Math.trunc(Number(payload.usableTimes))
    if (!rechargeDate || !customer) throw new BadRequestException('充值日期和客户名称不能为空')
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('预存金额必须大于 0')
    if (!Number.isFinite(usableTimes) || usableTimes <= 0) throw new BadRequestException('可使用次数必须大于 0')
    const row = await this.prisma.prepaidRechargeRecord.create({
      data: {
        frontendUserId,
        rechargeDate,
        customer,
        amount: toMoney(amount),
        usableTimes,
        remark: payload.remark || null
      }
    })
    this.publish(frontendUserId, actorUserId, 'finance-prepaid', row.id, 'create', row.createdAt)
    return this.prepaidRechargeDto(row)
  }

  async createFrontendDeletionRequest(frontendUserId: string, actorUserIdOrPayload: string | FinanceDeletionSourcePayload, maybePayload?: FinanceDeletionSourcePayload) {
    const actorUserId = typeof actorUserIdOrPayload === 'string' ? actorUserIdOrPayload : frontendUserId
    const payload = typeof actorUserIdOrPayload === 'string' ? maybePayload! : actorUserIdOrPayload
    const sourceType = this.parseDeletionSourceType(payload.sourceType)
    const sourceId = String(payload.sourceId || '').trim()
    const reason = String(payload.reason || '').trim()
    if (!sourceId) throw new BadRequestException('删除记录不能为空')
    if (!reason) throw new BadRequestException('请填写删除理由')
    const existing = await this.prisma.financeDeletionRequest.findFirst({
      where: { frontendUserId, sourceType, sourceId, status: FinanceDeletionRequestStatus.PENDING }
    })
    if (existing) throw new BadRequestException('这条记录已有待审核删除申请')
    const sourceSnapshot = await this.loadDeletionSourceSnapshot(frontendUserId, sourceType, sourceId)
    const request = await this.prisma.financeDeletionRequest.create({
      data: {
        frontendUserId,
        sourceType,
        sourceId,
        reason,
        sourceSnapshot
      }
    })
    this.publish(frontendUserId, actorUserId, 'finance-expenses', request.id, 'create', request.createdAt)
    return this.deletionRequestDto(request)
  }

  async getFrontendPrepaidReport(frontendUserId: string) {
    const sheets = await this.loadSheets([frontendUserId])
    const dailyRows = this.getPrepaidDailyRows(sheets)
    const recharges = await this.prisma.prepaidRechargeRecord.findMany({ where: { frontendUserId }, orderBy: [{ rechargeDate: 'desc' }, { createdAt: 'desc' }] })
    const customerRemarks = await this.prisma.prepaidCustomerRemark.findMany({ where: { frontendUserId } })
    const usageRemarks = await this.prisma.prepaidUsageRemark.findMany({ where: { frontendUserId } })
    return this.buildPrepaidReport(recharges, dailyRows, customerRemarks, usageRemarks)
  }

  async updateFrontendPrepaidCustomerRemark(frontendUserId: string, actorUserId: string, payload: { customer?: string; remark?: string; baseUpdatedAt?: string }) {
    const customer = String(payload.customer || '').trim()
    if (!customer) throw new BadRequestException('客户名称不能为空')
    const key = { frontendUserId, customer }
    const current = await this.prisma.prepaidCustomerRemark.findUnique({ where: { frontendUserId_customer: key } })
    let row
    if (current) {
      const baseUpdatedAt = requiredBaseUpdatedAt(payload.baseUpdatedAt)
      const result = await this.prisma.prepaidCustomerRemark.updateMany({
        where: { id: current.id, frontendUserId, updatedAt: baseUpdatedAt }, data: { remark: payload.remark || null }
      })
      row = await this.prisma.prepaidCustomerRemark.findUnique({ where: { id: current.id } })
      if (!result.count) staleWrite(row ? { customer: row.customer, remark: row.remark || '', updatedAt: row.updatedAt.toISOString() } : null)
      if (!row) throw new NotFoundException('预存款客户备注不存在')
    } else {
      row = await this.prisma.prepaidCustomerRemark.create({ data: { frontendUserId, customer, remark: payload.remark || null } })
    }
    this.publish(frontendUserId, actorUserId, 'finance-prepaid', row.id, current ? 'update' : 'create', row.updatedAt)
    return { customer: row.customer, remark: row.remark || '', updatedAt: row.updatedAt.toISOString() }
  }

  async updateFrontendPrepaidUsageRemark(frontendUserId: string, actorUserId: string, payload: { id?: string; remark?: string; baseUpdatedAt?: string }) {
    const { usageDate, customer } = this.parsePrepaidUsageId(payload.id)
    const key = { frontendUserId, usageDate, customer }
    const current = await this.prisma.prepaidUsageRemark.findUnique({ where: { frontendUserId_usageDate_customer: key } })
    let row
    if (current) {
      const baseUpdatedAt = requiredBaseUpdatedAt(payload.baseUpdatedAt)
      const result = await this.prisma.prepaidUsageRemark.updateMany({
        where: { id: current.id, frontendUserId, updatedAt: baseUpdatedAt }, data: { remark: payload.remark || null }
      })
      row = await this.prisma.prepaidUsageRemark.findUnique({ where: { id: current.id } })
      if (!result.count) staleWrite(row ? { id: `${row.usageDate}__${row.customer}`, remark: row.remark || '', updatedAt: row.updatedAt.toISOString() } : null)
      if (!row) throw new NotFoundException('预存款每日备注不存在')
    } else {
      row = await this.prisma.prepaidUsageRemark.create({ data: { frontendUserId, usageDate, customer, remark: payload.remark || null } })
    }
    this.publish(frontendUserId, actorUserId, 'finance-prepaid', row.id, current ? 'update' : 'create', row.updatedAt)
    return { id: `${row.usageDate}__${row.customer}`, remark: row.remark || '', updatedAt: row.updatedAt.toISOString() }
  }

  async getAdminIncomeReport(admin: CurrentUser, query: { frontendUserIds?: string | string[]; startDate?: string; endDate?: string; month?: string }) {
    const range = this.resolveRange(query)
    const frontendUserIds = await this.adminAccess.getAllowedFrontendUserIds(admin, this.adminAccess.parseFrontendUserIds(query.frontendUserIds))
    const sheets = await this.loadSheets(frontendUserIds, range.startDate, range.endDate)
    const prepaidRecharges = await this.prisma.prepaidRechargeRecord.findMany({
      where: { frontendUserId: { in: frontendUserIds }, rechargeDate: { gte: range.startDate, lte: range.endDate } }
    })
    return {
      ...this.buildIncomeReport(query.month || range.startDate.slice(0, 7), sheets, prepaidRecharges),
      range,
      totals: {
        today: this.sumIncomeByRange(sheets, todayInBeijing(), todayInBeijing(), prepaidRecharges),
        week: this.sumIncomeByRange(sheets, dayjs().startOf('week').format('YYYY-MM-DD'), todayInBeijing(), prepaidRecharges),
        month: this.sumIncomeByRange(sheets, dayjs().startOf('month').format('YYYY-MM-DD'), todayInBeijing(), prepaidRecharges)
      }
    }
  }

  async getAdminExpenseReport(admin: CurrentUser, query: { frontendUserIds?: string | string[]; startDate?: string; endDate?: string; month?: string }) {
    const range = this.resolveRange(query)
    const frontendUserIds = await this.adminAccess.getAllowedFrontendUserIds(admin, this.adminAccess.parseFrontendUserIds(query.frontendUserIds))
    const rows = await this.prisma.financeEntry.findMany({
      where: { frontendUserId: { in: frontendUserIds }, paymentDate: { gte: range.startDate, lte: range.endDate } },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      include: { frontendUser: { select: { username: true, account: true, displayRemark: true } } }
    })
    return {
      range,
      totals: {
        today: this.sumExpensesByRange(rows, todayInBeijing(), todayInBeijing()),
        week: this.sumExpensesByRange(rows, dayjs().startOf('week').format('YYYY-MM-DD'), todayInBeijing()),
        month: this.sumExpensesByRange(rows, dayjs().startOf('month').format('YYYY-MM-DD'), todayInBeijing())
      },
      rows: rows.map((row) => ({
        id: row.id,
        paymentDate: row.paymentDate,
        registeredAt: row.registeredAt,
        frontendUserId: row.frontendUserId,
        name: this.displayName(row.frontendUser),
        item: row.item,
        amount: toMoney(row.amount),
        paymentMethod: row.paymentMethod,
        screenshotUrl: this.formatScreenshotText(row.screenshotUrl),
        screenshotUrls: this.parseScreenshotUrls(row.screenshotUrl),
        remark: row.remark || '无信息'
      }))
    }
  }

  async getAdminUnsettled(admin: CurrentUser, query: { frontendUserIds?: string | string[]; startDate?: string; endDate?: string; month?: string }) {
    const range = this.resolveRange(query)
    const frontendUserIds = await this.adminAccess.getAllowedFrontendUserIds(admin, this.adminAccess.parseFrontendUserIds(query.frontendUserIds))
    const sheets = await this.loadSheets(frontendUserIds, range.startDate, range.endDate)
    return this.getUnsettledRows(sheets)
  }

  async remindUnsettled(admin: CurrentUser, blockId: string) {
    const block = await this.prisma.sampleBlock.findUnique({ where: { id: blockId }, include: { sheet: { include: { frontendUser: true } } } })
    if (!block) throw new NotFoundException('未找到样品')
    await this.adminAccess.getAllowedFrontendUserIds(admin, [block.sheet.frontendUserId])
    const inputs = block.inputs as Record<string, unknown>
    const amount = this.getSampleAmount(inputs)
    return this.reminders.createPaymentReminder({
      frontendUserId: block.sheet.frontendUserId,
      createdById: admin.id,
      type: ReminderType.UNSETTLED_PAYMENT,
      title: '未结款催收提醒',
      content: `${block.sheet.date} 的样品 ${this.getSampleNumber(inputs)} 仍有未结款 ¥${amount.toFixed(2)}，请尽快跟进催款业务。`,
      sourceType: 'sample_block',
      sourceId: block.id
    })
  }

  async getAdminMonthlyDaily(admin: CurrentUser, query: { frontendUserIds?: string | string[]; startDate?: string; endDate?: string; month?: string }) {
    const range = this.resolveRange(query)
    const frontendUserIds = await this.adminAccess.getAllowedFrontendUserIds(admin, this.adminAccess.parseFrontendUserIds(query.frontendUserIds))
    const sheets = await this.loadSheets(frontendUserIds, range.startDate, range.endDate)
    return this.getMonthlyDailyRows(sheets)
  }

  async getAdminMonthlyBills(admin: CurrentUser, query: { frontendUserIds?: string | string[]; month?: string }) {
    const month = query.month || currentMonthInBeijing()
    const frontendUserIds = await this.adminAccess.getAllowedFrontendUserIds(admin, this.adminAccess.parseFrontendUserIds(query.frontendUserIds))
    const sheets = await this.loadSheets(frontendUserIds, `${month}-01`, dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD'))
    const dailyRows = this.getMonthlyDailyRows(sheets)
    const savedRows = await this.prisma.monthlySettlementRecord.findMany({ where: { frontendUserId: { in: frontendUserIds }, month } })
    return this.buildMonthlyReport(month, dailyRows, savedRows)
  }

  async remindMonthlyBill(admin: CurrentUser, recordId: string) {
    const record = await this.prisma.monthlySettlementRecord.findUnique({ where: { id: recordId } })
    if (!record) throw new NotFoundException('未找到月结账单')
    await this.adminAccess.getAllowedFrontendUserIds(admin, [record.frontendUserId])
    return this.reminders.createPaymentReminder({
      frontendUserId: record.frontendUserId,
      createdById: admin.id,
      type: ReminderType.MONTHLY_PAYMENT,
      title: '月结款催收提醒',
      content: `${record.month} ${record.customer} 月结款请尽快跟进催款业务。`,
      sourceType: 'monthly_settlement_record',
      sourceId: record.id
    })
  }

  async getAdminMonthlyCustomers(admin: CurrentUser, query: { frontendUserIds?: string | string[]; startDate?: string; endDate?: string; month?: string }) {
    const range = this.resolveRange(query)
    const frontendUserIds = await this.adminAccess.getAllowedFrontendUserIds(admin, this.adminAccess.parseFrontendUserIds(query.frontendUserIds))
    const rows = this.getMonthlyDailyRows(await this.loadSheets(frontendUserIds, range.startDate, range.endDate))
    const remarks = await this.prisma.monthlyCustomerRemark.findMany({ where: { frontendUserId: { in: frontendUserIds } } })
    const remarkMap = new Map(remarks.map((row) => [`${row.frontendUserId}__${row.customer}`, row.remark || '']))
    const map = new Map<string, { frontendUserId: string; name: string; customer: string; firstDate: string; lastDate: string; amount: number; sampleCount: number; remark: string }>()
    rows.forEach((row) => {
      const key = `${row.frontendUserId}__${row.customer}`
      const current = map.get(key) || {
        frontendUserId: row.frontendUserId,
        name: row.name,
        customer: row.customer,
        firstDate: row.date,
        lastDate: row.date,
        amount: 0,
        sampleCount: 0,
        remark: remarkMap.get(key) || ''
      }
      current.firstDate = row.date < current.firstDate ? row.date : current.firstDate
      current.lastDate = row.date > current.lastDate ? row.date : current.lastDate
      current.amount = toMoney(current.amount + row.amount)
      current.sampleCount += row.sampleCount
      map.set(key, current)
    })
    return Array.from(map.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate))
  }

  async updateAdminMonthlyCustomerRemark(admin: CurrentUser, payload: { frontendUserId?: string; customer?: string; remark?: string }) {
    const frontendUserId = String(payload.frontendUserId || '')
    const customer = String(payload.customer || '').trim()
    if (!frontendUserId || !customer) throw new BadRequestException('前端账号和客户不能为空')
    await this.adminAccess.getAllowedFrontendUserIds(admin, [frontendUserId])
    return this.prisma.monthlyCustomerRemark.upsert({
      where: { frontendUserId_customer: { frontendUserId, customer } },
      update: { remark: payload.remark || null },
      create: { frontendUserId, customer, remark: payload.remark || null }
    })
  }

  async getAdminPrepaidRecharges(admin: CurrentUser, query: { frontendUserIds?: string | string[]; startDate?: string; endDate?: string; month?: string }) {
    const range = this.resolveRange(query)
    const frontendUserIds = await this.adminAccess.getAllowedFrontendUserIds(admin, this.adminAccess.parseFrontendUserIds(query.frontendUserIds))
    const rows = await this.prisma.prepaidRechargeRecord.findMany({
      where: { frontendUserId: { in: frontendUserIds }, rechargeDate: { gte: range.startDate, lte: range.endDate } },
      orderBy: [{ rechargeDate: 'desc' }, { createdAt: 'desc' }],
      include: { frontendUser: { select: { username: true, account: true, displayRemark: true } } }
    })
    return rows.map((row) => ({
      ...this.prepaidRechargeDto(row),
      frontendUserId: row.frontendUserId,
      name: this.displayName(row.frontendUser)
    }))
  }

  async getAdminPrepaidReport(admin: CurrentUser, query: { frontendUserIds?: string | string[]; startDate?: string; endDate?: string; month?: string }) {
    const range = this.resolveRange(query)
    const frontendUserIds = await this.adminAccess.getAllowedFrontendUserIds(admin, this.adminAccess.parseFrontendUserIds(query.frontendUserIds))
    const allSheets = await this.loadSheets(frontendUserIds)
    const allDailyRows = this.getPrepaidDailyRows(allSheets)
    const recharges = await this.prisma.prepaidRechargeRecord.findMany({
      where: { frontendUserId: { in: frontendUserIds } },
      include: { frontendUser: { select: { username: true, account: true, displayRemark: true } } }
    })
    const customerRemarks = await this.prisma.prepaidCustomerRemark.findMany({ where: { frontendUserId: { in: frontendUserIds } } })
    const usageRemarks = await this.prisma.prepaidUsageRemark.findMany({ where: { frontendUserId: { in: frontendUserIds } } })
    const report = this.buildPrepaidReport(
      recharges.map((row) => ({ ...row, name: this.displayName(row.frontendUser) })),
      allDailyRows,
      customerRemarks,
      usageRemarks
    )
    return {
      range,
      customerRows: report.customerRows,
      dailyRows: report.dailyRows.filter((row) => row.date >= range.startDate && row.date <= range.endDate)
    }
  }

  async getAdminDeletionRequests(admin: CurrentUser, query: { frontendUserIds?: string | string[]; status?: string }) {
    const frontendUserIds = await this.adminAccess.getAllowedFrontendUserIds(admin, this.adminAccess.parseFrontendUserIds(query.frontendUserIds))
    const status = this.parseDeletionStatus(query.status)
    if (!frontendUserIds.length) return []
    const rows = await this.prisma.financeDeletionRequest.findMany({
      where: {
        frontendUserId: { in: frontendUserIds },
        ...(status ? { status } : {})
      },
      orderBy: { createdAt: 'desc' },
      include: {
        frontendUser: { select: { username: true, account: true, displayRemark: true } },
        reviewedBy: { select: { username: true, account: true } }
      }
    })
    return rows.map((row) => this.deletionRequestDto(row))
  }

  async approveDeletionRequest(admin: CurrentUser, id: string) {
    const row = await this.loadAdminDeletionRequest(admin, id)
    if (row.status !== FinanceDeletionRequestStatus.PENDING) throw new BadRequestException('删除申请已处理')
    const approved = await this.prisma.$transaction(async (tx) => {
      if (row.sourceType === FinanceDeletionRequestType.EXPENSE) {
        const result = await tx.financeEntry.deleteMany({ where: { id: row.sourceId, frontendUserId: row.frontendUserId } })
        if (!result.count) throw new NotFoundException('原支出记录不存在或已删除')
      } else {
        const result = await tx.prepaidRechargeRecord.deleteMany({ where: { id: row.sourceId, frontendUserId: row.frontendUserId } })
        if (!result.count) throw new NotFoundException('原预存款记录不存在或已删除')
      }
      return tx.financeDeletionRequest.update({
        where: { id: row.id },
        data: {
          status: FinanceDeletionRequestStatus.APPROVED,
          reviewedById: admin.id,
          reviewedAt: new Date(),
          reviewRemark: null
        },
        include: {
          frontendUser: { select: { username: true, account: true, displayRemark: true } },
          reviewedBy: { select: { username: true, account: true } }
        }
      })
    })
    await this.reminders.createPaymentReminder({
      frontendUserId: row.frontendUserId,
      createdById: admin.id,
      type: ReminderType.FINANCE_DELETE_APPROVED,
      title: '删除申请已同意',
      content: `${this.deletionSourceLabel(row.sourceType)}「${this.deletionSnapshotSummary(row)}」删除申请已同意，原记录已删除。`,
      sourceType: 'finance_deletion_request',
      sourceId: row.id
    })
    return this.deletionRequestDto(approved)
  }

  async rejectDeletionRequest(admin: CurrentUser, id: string, payload: { reviewRemark?: string }) {
    const row = await this.loadAdminDeletionRequest(admin, id)
    if (row.status !== FinanceDeletionRequestStatus.PENDING) throw new BadRequestException('删除申请已处理')
    const reviewRemark = String(payload.reviewRemark || '').trim()
    const rejected = await this.prisma.financeDeletionRequest.update({
      where: { id: row.id },
      data: {
        status: FinanceDeletionRequestStatus.REJECTED,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        reviewRemark: reviewRemark || null
      },
      include: {
        frontendUser: { select: { username: true, account: true, displayRemark: true } },
        reviewedBy: { select: { username: true, account: true } }
      }
    })
    await this.reminders.createPaymentReminder({
      frontendUserId: row.frontendUserId,
      createdById: admin.id,
      type: ReminderType.FINANCE_DELETE_REJECTED,
      title: '删除申请已拒绝',
      content: `${this.deletionSourceLabel(row.sourceType)}「${this.deletionSnapshotSummary(row)}」删除申请已拒绝。原因：${reviewRemark || '管理员未填写原因'}。`,
      sourceType: 'finance_deletion_request',
      sourceId: row.id
    })
    return this.deletionRequestDto(rejected)
  }

  private loadSheets(frontendUserIds: string[], startDate?: string, endDate?: string) {
    return this.prisma.labSheet.findMany({
      where: {
        frontendUserId: { in: frontendUserIds },
        ...(startDate && endDate ? { date: { gte: startDate, lte: endDate } } : {})
      },
      orderBy: { date: 'desc' },
      include: {
        frontendUser: { select: { id: true, username: true, account: true, displayRemark: true } },
        sampleBlocks: { orderBy: { index: 'asc' } }
      }
    })
  }

  private buildIncomeReport(
    month: string,
    sheets: Awaited<ReturnType<FinanceService['loadSheets']>>,
    prepaidRecharges: Array<{ rechargeDate: string; amount: unknown; usableTimes: number }> = []
  ) {
    const rowMap = new Map<string, ReturnType<FinanceService['emptyIncomeRow']>>()
    sheets.forEach((sheet) => {
      const row = rowMap.get(sheet.date) || this.emptyIncomeRow(sheet.date)
      sheet.sampleBlocks.forEach((block) => {
        const inputs = block.inputs as Record<string, unknown>
        const amount = this.getSampleAmount(inputs)
        if (!Number.isFinite(amount) || inputs.paymentStatus === '预存款') return
        const status = this.getIncomeStatus(inputs)
        row.sampleCount += 1
        row.totalAmount = toMoney(row.totalAmount + amount)
        const summary = row.statusSummaries.find((item) => item.status === status)
        if (summary) {
          summary.count += 1
          summary.amount = toMoney(summary.amount + amount)
        }
      })
      rowMap.set(sheet.date, row)
    })
    prepaidRecharges.forEach((recharge) => {
      const row = rowMap.get(recharge.rechargeDate) || this.emptyIncomeRow(recharge.rechargeDate)
      const summary = row.statusSummaries.find((item) => item.status === '预存款')
      const amount = toMoney(recharge.amount)
      if (summary) {
        summary.count += recharge.usableTimes
        summary.amount = toMoney(summary.amount + amount)
      }
      row.sampleCount += recharge.usableTimes
      row.totalAmount = toMoney(row.totalAmount + amount)
      rowMap.set(recharge.rechargeDate, row)
    })
    const rows = Array.from(rowMap.values()).sort((a, b) => b.date.localeCompare(a.date))
    return {
      month,
      totalSamples: rows.reduce((sum, row) => sum + row.sampleCount, 0),
      totalAmount: toMoney(rows.reduce((sum, row) => sum + row.totalAmount, 0)),
      statusSummaries: incomeStatuses.map((status) => ({
        status,
        count: rows.reduce((sum, row) => sum + (row.statusSummaries.find((item) => item.status === status)?.count || 0), 0),
        amount: toMoney(rows.reduce((sum, row) => sum + (row.statusSummaries.find((item) => item.status === status)?.amount || 0), 0))
      })),
      rows
    }
  }

  private emptyIncomeRow(date: string) {
    return {
      date,
      sampleCount: 0,
      totalAmount: 0,
      statusSummaries: incomeStatuses.map((status) => ({ status, count: 0, amount: 0 }))
    }
  }

  private getUnsettledRows(sheets: Awaited<ReturnType<FinanceService['loadSheets']>>) {
    return sheets.flatMap((sheet) =>
      sheet.sampleBlocks
        .filter((block) => {
          const inputs = block.inputs as Record<string, unknown>
          return Number.isFinite(this.getSampleAmount(inputs)) && inputs.paymentStatus === '未结款'
        })
        .map((block) => {
          const inputs = block.inputs as Record<string, unknown>
          return {
            date: sheet.date,
            sheetId: sheet.id,
            blockId: block.id,
            frontendUserId: sheet.frontendUserId,
            name: this.displayName(sheet.frontendUser),
            sequence: String(inputs.sequence || block.index).padStart(3, '0'),
            sampleNumber: this.getSampleNumber(inputs),
            customer: this.getCustomerName(inputs),
            amount: this.getSampleAmount(inputs)
          }
        })
    )
  }

  private getMonthlyDailyRows(sheets: Awaited<ReturnType<FinanceService['loadSheets']>>) {
    const map = new Map<
      string,
      { id: string; date: string; frontendUserId: string; name: string; customer: string; customerDisplay: string; sampleCount: number; amount: number; elementCounts: MonthlyElementCount[] }
    >()
    sheets.forEach((sheet) => {
      sheet.sampleBlocks.forEach((block) => {
        const inputs = block.inputs as Record<string, unknown>
        const amount = this.getSampleAmount(inputs)
        if (!Number.isFinite(amount) || inputs.paymentStatus !== '月结款') return
        const customer = this.getCustomerName(inputs)
        const customerDisplay = this.getCustomerDisplayName(inputs)
        const key = `${sheet.date}__${sheet.frontendUserId}__${customer}`
        const current =
          map.get(key) ||
          {
            id: key,
            date: sheet.date,
            frontendUserId: sheet.frontendUserId,
            name: this.displayName(sheet.frontendUser),
            customer,
            customerDisplay,
            sampleCount: 0,
            amount: 0,
            elementCounts: []
          }
        if (!current.customerDisplay || current.customerDisplay === current.customer) current.customerDisplay = customerDisplay
        current.sampleCount += 1
        current.amount = toMoney(current.amount + amount)
        current.elementCounts = this.mergeMonthlyElementCounts(current.elementCounts, this.getMonthlyElementCounts(inputs))
        map.set(key, current)
      })
    })
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date) || a.customer.localeCompare(b.customer, 'zh-Hans-CN'))
  }

  private getPrepaidDailyRows(sheets: Awaited<ReturnType<FinanceService['loadSheets']>>) {
    const map = new Map<string, { id: string; date: string; frontendUserId: string; name: string; customer: string; sampleCount: number; remark: string }>()
    sheets.forEach((sheet) => {
      sheet.sampleBlocks.forEach((block) => {
        const inputs = block.inputs as Record<string, unknown>
        const amount = this.getSampleAmount(inputs)
        if (!Number.isFinite(amount) || inputs.paymentStatus !== '预存款') return
        const customer = this.getCustomerName(inputs)
        const key = `${sheet.date}__${sheet.frontendUserId}__${customer}`
        const current =
          map.get(key) ||
          {
            id: `${sheet.date}__${customer}`,
            date: sheet.date,
            frontendUserId: sheet.frontendUserId,
            name: this.displayName(sheet.frontendUser),
            customer,
            sampleCount: 0,
            remark: ''
          }
        current.sampleCount += this.getPrepaidDeductionTimes(inputs)
        map.set(key, current)
      })
    })
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date) || a.customer.localeCompare(b.customer, 'zh-Hans-CN'))
  }

  private buildMonthlyReport(month: string, dailyRows: ReturnType<FinanceService['getMonthlyDailyRows']>, savedRows: Awaited<ReturnType<PrismaService['monthlySettlementRecord']['findMany']>>) {
    const savedMap = new Map(savedRows.map((row) => [`${row.frontendUserId}__${row.customer}`, row]))
    const summaryMap = new Map<string, { id: string; month: string; frontendUserId: string; name: string; customer: string; customerDisplay: string; sampleCount: number; amount: number }>()
    dailyRows.forEach((row) => {
      const key = `${row.frontendUserId}__${row.customer}`
      const current =
        summaryMap.get(key) ||
        {
          id: `${month}__${row.frontendUserId}__${row.customer}`,
          month,
          frontendUserId: row.frontendUserId,
          name: row.name,
          customer: row.customer,
          customerDisplay: row.customerDisplay || row.customer,
          sampleCount: 0,
          amount: 0
        }
      current.sampleCount += row.sampleCount
      current.amount = toMoney(current.amount + row.amount)
      if (!current.customerDisplay || current.customerDisplay === current.customer) current.customerDisplay = row.customerDisplay || row.customer
      summaryMap.set(key, current)
    })
    const summaryRows = Array.from(summaryMap.values()).map((row) => {
      const saved = savedMap.get(`${row.frontendUserId}__${row.customer}`)
      const status = saved?.status || MonthlySettlementStatus.UNPAID
      const paidAmount = status === MonthlySettlementStatus.PAID ? row.amount : status === MonthlySettlementStatus.PARTIAL ? toMoney(saved?.paidAmount || 0) : null
      return {
        ...row,
        recordId: saved?.id || '',
        updatedAt: saved?.updatedAt?.toISOString() || '',
        settlementStatus: this.monthlyStatusToChinese(status),
        paidAmount,
        remark:
          status === MonthlySettlementStatus.PAID
            ? paidMonthlySettlementRemark
            : saved?.remark || (status === MonthlySettlementStatus.PARTIAL ? `未结款差额 ¥${toMoney(row.amount - (paidAmount || 0)).toFixed(2)}` : '')
      }
    })
    return {
      month,
      totalSamples: dailyRows.reduce((sum, row) => sum + row.sampleCount, 0),
      totalAmount: toMoney(dailyRows.reduce((sum, row) => sum + row.amount, 0)),
      dailyRows,
      summaryRows: summaryRows.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN') || a.customer.localeCompare(b.customer, 'zh-Hans-CN'))
    }
  }

  private getMonthlyElementCounts(inputs: Record<string, unknown>): MonthlyElementCount[] {
    const selectedKeys = new Set(this.parseMonthlyElementKeys(typeof inputs.elementNote === 'string' ? inputs.elementNote : ''))
    if (selectedKeys.has('aluminum') && selectedKeys.has('silicon') && selectedKeys.has('aluminumSiliconRatio')) {
      selectedKeys.delete('aluminum')
      selectedKeys.delete('silicon')
    }
    return monthlyElementDefinitions
      .filter((definition) => selectedKeys.has(definition.key))
      .map((definition) => ({ key: definition.key, label: definition.label, count: 1 }))
  }

  private parseMonthlyElementKeys(value: string) {
    const text = value.trim()
    if (!text) return []
    const tokens = text
      .split(/[、,，\s/]+/)
      .map((token) => token.trim())
      .filter(Boolean)
    return monthlyElementDefinitions
      .filter((definition) => monthlyElementAliases[definition.key].some((alias) => this.isMonthlyElementAliasMatched(text, tokens, alias)))
      .map((definition) => definition.key)
  }

  private isMonthlyElementAliasMatched(text: string, tokens: string[], alias: string) {
    const hasAsciiSymbol = /^[A-Za-z]+$/.test(alias)
    if (alias.length <= 2 && hasAsciiSymbol) {
      return tokens.includes(alias)
    }
    return text.includes(alias) || tokens.includes(alias)
  }

  private mergeMonthlyElementCounts(current: MonthlyElementCount[], next: MonthlyElementCount[]) {
    const map = new Map(current.map((item) => [item.key, { ...item }]))
    next.forEach((item) => {
      const target = map.get(item.key)
      if (target) target.count += item.count
      else map.set(item.key, { ...item })
    })
    return monthlyElementDefinitions.map((definition) => map.get(definition.key)).filter(Boolean) as MonthlyElementCount[]
  }

  private expenseDto(
    row: { id: string; paymentDate: string; item: string; amount: unknown; paymentMethod: PaymentMethod; screenshotUrl: string | null; remark: string | null },
    deletionRequest?: { id: string; status: FinanceDeletionRequestStatus } | null
  ) {
    const screenshotUrls = this.parseScreenshotUrls(row.screenshotUrl)
    return {
      id: row.id,
      paymentDate: row.paymentDate,
      item: row.item,
      amount: toMoney(row.amount),
      paymentMethod: row.paymentMethod,
      screenshotUrl: screenshotUrls[0] || '',
      screenshotUrls,
      remark: row.remark || '',
      deleteRequestId: deletionRequest?.id || '',
      deleteRequestStatus: deletionRequest?.status || ''
    }
  }

  private normalizeScreenshotUrls(urls?: string[], fallbackUrl?: string) {
    const rows = Array.isArray(urls) ? urls : []
    const values = [...rows, fallbackUrl || ''].map((url) => String(url || '').trim()).filter(Boolean)
    return Array.from(new Set(values))
  }

  private assertValidExpensePayload(payload: FrontendExpensePayload) {
    if (!payload.paymentDate || !payload.item || !payload.paymentMethod) throw new BadRequestException('支付日期、开支项目和支付方式不能为空')
    if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) throw new BadRequestException('开支金额必须大于 0')
  }

  private serializeScreenshotUrls(urls: string[]) {
    if (!urls.length) return null
    if (urls.length === 1) return urls[0]
    return JSON.stringify(urls)
  }

  private parseScreenshotUrls(value: string | null) {
    if (!value) return []
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) return parsed.map((url) => String(url || '').trim()).filter(Boolean)
    } catch {
      // Older rows store a single image URL directly in screenshotUrl.
    }
    return [value]
  }

  private formatScreenshotText(value: string | null) {
    const urls = this.parseScreenshotUrls(value)
    return urls.length ? urls.join('，') : '无信息'
  }

  private prepaidRechargeDto(
    row: { id: string; rechargeDate: string; customer: string; amount: unknown; usableTimes: number; remark: string | null; createdAt: Date },
    deletionRequest?: { id: string; status: FinanceDeletionRequestStatus } | null
  ) {
    return {
      id: row.id,
      rechargeDate: row.rechargeDate,
      customer: row.customer,
      amount: toMoney(row.amount),
      usableTimes: row.usableTimes,
      remark: row.remark || '',
      createdAt: row.createdAt.toISOString(),
      deleteRequestId: deletionRequest?.id || '',
      deleteRequestStatus: deletionRequest?.status || ''
    }
  }

  private async pendingDeletionRequestMap(frontendUserId: string, sourceType: FinanceDeletionRequestType, sourceIds: string[]) {
    if (!sourceIds.length) return new Map<string, { id: string; status: FinanceDeletionRequestStatus }>()
    const rows = await this.prisma.financeDeletionRequest.findMany({
      where: {
        frontendUserId,
        sourceType,
        sourceId: { in: sourceIds },
        status: FinanceDeletionRequestStatus.PENDING
      },
      select: { id: true, sourceId: true, status: true }
    })
    return new Map(rows.map((row) => [row.sourceId, { id: row.id, status: row.status }]))
  }

  private parseDeletionSourceType(value?: string) {
    if (value === 'expense' || value === FinanceDeletionRequestType.EXPENSE) return FinanceDeletionRequestType.EXPENSE
    if (value === 'prepaidRecharge' || value === FinanceDeletionRequestType.PREPAID_RECHARGE) return FinanceDeletionRequestType.PREPAID_RECHARGE
    throw new BadRequestException('删除记录类型无效')
  }

  private parseDeletionStatus(value?: string) {
    if (!value) return null
    if (value === FinanceDeletionRequestStatus.PENDING || value === FinanceDeletionRequestStatus.APPROVED || value === FinanceDeletionRequestStatus.REJECTED) return value
    return null
  }

  private async loadDeletionSourceSnapshot(frontendUserId: string, sourceType: FinanceDeletionRequestType, sourceId: string) {
    if (sourceType === FinanceDeletionRequestType.EXPENSE) {
      const row = await this.prisma.financeEntry.findUnique({ where: { id: sourceId } })
      if (!row || row.frontendUserId !== frontendUserId) throw new NotFoundException('未找到支出记录')
      return {
        paymentDate: row.paymentDate,
        item: row.item,
        amount: toMoney(row.amount),
        paymentMethod: row.paymentMethod,
        screenshotUrls: this.parseScreenshotUrls(row.screenshotUrl),
        remark: row.remark || ''
      }
    }
    const row = await this.prisma.prepaidRechargeRecord.findUnique({ where: { id: sourceId } })
    if (!row || row.frontendUserId !== frontendUserId) throw new NotFoundException('未找到预存款记录')
    return {
      rechargeDate: row.rechargeDate,
      customer: row.customer,
      amount: toMoney(row.amount),
      usableTimes: row.usableTimes,
      remark: row.remark || ''
    }
  }

  private async loadAdminDeletionRequest(admin: CurrentUser, id: string) {
    const row = await this.prisma.financeDeletionRequest.findUnique({
      where: { id },
      include: {
        frontendUser: { select: { username: true, account: true, displayRemark: true } },
        reviewedBy: { select: { username: true, account: true } }
      }
    })
    if (!row) throw new NotFoundException('未找到删除申请')
    await this.adminAccess.getAllowedFrontendUserIds(admin, [row.frontendUserId])
    return row
  }

  private deletionRequestDto(row: {
    id: string
    frontendUserId: string
    sourceType: FinanceDeletionRequestType
    sourceId: string
    reason: string
    sourceSnapshot: unknown
    status: FinanceDeletionRequestStatus
    reviewRemark: string | null
    reviewedAt: Date | null
    createdAt: Date
    updatedAt: Date
    frontendUser?: { username: string; account: string; displayRemark?: string | null } | null
    reviewedBy?: { username: string; account: string } | null
  }) {
    return {
      id: row.id,
      frontendUserId: row.frontendUserId,
      name: row.frontendUser ? this.displayName(row.frontendUser) : '',
      sourceType: row.sourceType,
      sourceLabel: this.deletionSourceLabel(row.sourceType),
      sourceId: row.sourceId,
      sourceSnapshot: row.sourceSnapshot,
      sourceSummary: this.deletionSnapshotSummary(row),
      reason: row.reason,
      status: row.status,
      statusLabel: this.deletionStatusLabel(row.status),
      reviewRemark: row.reviewRemark || '',
      reviewedBy: row.reviewedBy ? row.reviewedBy.username || row.reviewedBy.account : '',
      reviewedAt: row.reviewedAt?.toISOString() || '',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }
  }

  private deletionSourceLabel(type: FinanceDeletionRequestType) {
    return type === FinanceDeletionRequestType.EXPENSE ? '支出账单' : '预存款添加记录'
  }

  private deletionStatusLabel(status: FinanceDeletionRequestStatus) {
    if (status === FinanceDeletionRequestStatus.APPROVED) return '已同意'
    if (status === FinanceDeletionRequestStatus.REJECTED) return '已拒绝'
    return '待审核'
  }

  private deletionSnapshotSummary(row: { sourceType: FinanceDeletionRequestType; sourceSnapshot: unknown }) {
    const snapshot = this.snapshotObject(row.sourceSnapshot)
    if (row.sourceType === FinanceDeletionRequestType.EXPENSE) {
      return `${String(snapshot.paymentDate || '无日期')} ${String(snapshot.item || '无项目')} ¥${toMoney(snapshot.amount).toFixed(2)}`
    }
    return `${String(snapshot.rechargeDate || '无日期')} ${String(snapshot.customer || '无客户')} ¥${toMoney(snapshot.amount).toFixed(2)} ${Number(snapshot.usableTimes || 0)}次`
  }

  private snapshotObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
  }

  private buildPrepaidReport(
    recharges: Array<{ frontendUserId?: string; name?: string; customer: string; amount: unknown; usableTimes: number; remark: string | null }>,
    dailyRows: ReturnType<FinanceService['getPrepaidDailyRows']>,
    customerRemarks: Array<{ frontendUserId?: string; customer: string; remark: string | null; updatedAt: Date }>,
    usageRemarks: Array<{ frontendUserId?: string; usageDate: string; customer: string; remark: string | null; updatedAt: Date }>
  ) {
    const customerRemarkMap = new Map(customerRemarks.map((row) => [this.prepaidCustomerKey(row.frontendUserId, row.customer), {
      remark: row.remark || '', updatedAt: row.updatedAt.toISOString()
    }]))
    const usageRemarkMap = new Map(usageRemarks.map((row) => [this.prepaidUsageKey(row.frontendUserId, row.usageDate, row.customer), {
      remark: row.remark || '', updatedAt: row.updatedAt.toISOString()
    }]))
    const map = new Map<string, { id: string; frontendUserId: string; name: string; customer: string; totalAmount: number; totalUsableTimes: number; usedTimes: number; availableTimes: number; remark: string; remarkUpdatedAt: string }>()
    recharges.forEach((row) => {
      const key = this.prepaidCustomerKey(row.frontendUserId, row.customer)
      const current =
        map.get(key) ||
        {
          id: key || row.customer,
          frontendUserId: row.frontendUserId || '',
          name: row.name || '',
          customer: row.customer,
          totalAmount: 0,
          totalUsableTimes: 0,
          usedTimes: 0,
          availableTimes: 0,
          remark: '',
          remarkUpdatedAt: ''
        }
      current.totalAmount = toMoney(current.totalAmount + toMoney(row.amount))
      current.totalUsableTimes += row.usableTimes
      if (!current.remark && row.remark) current.remark = row.remark
      map.set(key, current)
    })
    dailyRows.forEach((row) => {
      const key = this.prepaidCustomerKey(row.frontendUserId, row.customer)
      const current =
        map.get(key) ||
        {
          id: key || row.customer,
          frontendUserId: row.frontendUserId || '',
          name: row.name || '',
          customer: row.customer,
          totalAmount: 0,
          totalUsableTimes: 0,
          usedTimes: 0,
          availableTimes: 0,
          remark: '',
          remarkUpdatedAt: ''
        }
      current.usedTimes += row.sampleCount
      map.set(key, current)
    })
    const customerRows = Array.from(map.values())
      .map((row) => {
        const savedRemark = customerRemarkMap.get(this.prepaidCustomerKey(row.frontendUserId, row.customer))
        return {
          ...row,
          availableTimes: Math.max(0, row.totalUsableTimes - row.usedTimes),
          remark: savedRemark?.remark ?? row.remark,
          remarkUpdatedAt: savedRemark?.updatedAt || ''
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN') || a.customer.localeCompare(b.customer, 'zh-Hans-CN'))
    return {
      customerRows,
      dailyRows: dailyRows.map((row) => {
        const savedRemark = usageRemarkMap.get(this.prepaidUsageKey(row.frontendUserId, row.date, row.customer))
        return { ...row, remark: savedRemark?.remark || '', remarkUpdatedAt: savedRemark?.updatedAt || '' }
      })
    }
  }

  private displayName(user: { account: string; username: string; displayRemark?: string | null }) {
    return user.displayRemark?.trim() || user.username || user.account
  }

  private blockDto(block: { id: string; index: number; readonly: boolean; inputs: unknown; results: unknown; parameterSnapshot: unknown }) {
    return {
      id: block.id,
      index: block.index,
      readonly: block.readonly,
      inputs: block.inputs,
      results: block.results,
      parameterSnapshot: block.parameterSnapshot
    }
  }

  private monthlyRecordDto(row: { id: string; month: string; customer: string; status: MonthlySettlementStatus; paidAmount: unknown; remark: string | null; updatedAt: Date }, customer: string, month: string) {
    return {
      id: `${month}__${customer}`,
      recordId: row.id,
      month: row.month,
      customer: row.customer,
      settlementStatus: this.monthlyStatusToChinese(row.status),
      paidAmount: row.paidAmount === null ? null : toMoney(row.paidAmount),
      remark: row.status === MonthlySettlementStatus.PAID ? paidMonthlySettlementRemark : row.remark || '',
      updatedAt: row.updatedAt.toISOString()
    }
  }

  private publish(dataOwnerId: string, changedById: string, module: string, entityId: string, operation: 'create' | 'update' | 'delete', updatedAt: Date) {
    this.realtime?.publish({ dataOwnerId, module, entityId, operation, changedById, updatedAt: updatedAt.toISOString() })
  }

  private resolveRange(query: { startDate?: string; endDate?: string; month?: string }) {
    if (query.month) {
      return {
        startDate: `${query.month}-01`,
        endDate: dayjs(`${query.month}-01`).endOf('month').format('YYYY-MM-DD')
      }
    }
    const today = todayInBeijing()
    return { startDate: query.startDate || today, endDate: query.endDate || query.startDate || today }
  }

  private sumIncomeByRange(
    sheets: Awaited<ReturnType<FinanceService['loadSheets']>>,
    startDate: string,
    endDate: string,
    prepaidRecharges: Array<{ rechargeDate: string; amount: unknown; usableTimes: number }> = []
  ) {
    const allowedDates = new Set(datesBetween(startDate, endDate))
    let sampleCount = 0
    let amount = 0
    sheets.forEach((sheet) => {
      if (!allowedDates.has(sheet.date)) return
      sheet.sampleBlocks.forEach((block) => {
        const inputs = block.inputs as Record<string, unknown>
        if (inputs.paymentStatus === '预存款') return
        const value = this.getSampleAmount(inputs)
        if (!Number.isFinite(value)) return
        sampleCount += 1
        amount += value
      })
    })
    prepaidRecharges.forEach((row) => {
      if (!allowedDates.has(row.rechargeDate)) return
      sampleCount += row.usableTimes
      amount += toMoney(row.amount)
    })
    return { sampleCount, amount: toMoney(amount) }
  }

  private sumExpensesByRange(rows: Array<{ paymentDate: string; amount: unknown }>, startDate: string, endDate: string) {
    const filtered = rows.filter((row) => row.paymentDate >= startDate && row.paymentDate <= endDate)
    return { count: filtered.length, amount: toMoney(filtered.reduce((sum, row) => sum + toMoney(row.amount), 0)) }
  }

  private getSampleAmount(inputs: Record<string, unknown>) {
    return typeof inputs.price === 'number' && Number.isFinite(inputs.price) ? toMoney(inputs.price) : Number.NaN
  }

  private getPrepaidDeductionTimes(inputs: Record<string, unknown>) {
    const amount = this.getSampleAmount(inputs)
    return Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0
  }

  private getIncomeStatus(inputs: Record<string, unknown>): IncomeStatus {
    return incomeStatuses.includes(inputs.paymentStatus as IncomeStatus) ? (inputs.paymentStatus as IncomeStatus) : '未选择'
  }

  private getSampleNumber(inputs: Record<string, unknown>) {
    return typeof inputs.sampleNumber === 'string' && inputs.sampleNumber.trim() ? inputs.sampleNumber.trim() : '无信息'
  }

  private getCustomerName(inputs: Record<string, unknown>) {
    if (typeof inputs.customerText === 'string' && inputs.customerText.trim()) return inputs.customerText.trim()
    if (Array.isArray(inputs.customers)) {
      const names = inputs.customers
        .map((item) => (item && typeof item === 'object' && 'name' in item ? String((item as { name?: unknown }).name || '') : ''))
        .filter(Boolean)
      if (names.length) return names.join('、')
    }
    return '无信息'
  }

  private getCustomerDisplayName(inputs: Record<string, unknown>) {
    if (Array.isArray(inputs.customers)) {
      const names = inputs.customers.map((item) => this.formatCustomerDisplay(item)).filter(Boolean)
      if (names.length) return names.join('、')
    }
    return this.getCustomerName(inputs)
  }

  private formatCustomerDisplay(value: unknown) {
    if (!value || typeof value !== 'object') return ''
    const customer = value as { name?: unknown; phone?: unknown; wechat?: unknown; wechatNickname?: unknown; note?: unknown }
    return [customer.name, customer.phone, customer.wechat, customer.wechatNickname, customer.note]
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .join(' ')
  }

  private monthlyStatusFromChinese(value: string) {
    if (value === '已结款') return MonthlySettlementStatus.PAID
    if (value === '部分结款') return MonthlySettlementStatus.PARTIAL
    return MonthlySettlementStatus.UNPAID
  }

  private monthlyStatusToChinese(value: MonthlySettlementStatus) {
    if (value === MonthlySettlementStatus.PAID) return '已结款'
    if (value === MonthlySettlementStatus.PARTIAL) return '部分结款'
    return '未结款'
  }

  private parsePrepaidUsageId(id?: string) {
    const raw = String(id || '')
    const separatorIndex = raw.indexOf('__')
    const usageDate = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : ''
    const customer = separatorIndex >= 0 ? raw.slice(separatorIndex + 2).trim() : ''
    if (!usageDate || !customer) throw new BadRequestException('预存款每日明细标识无效')
    return { usageDate, customer }
  }

  private prepaidCustomerKey(frontendUserId: string | undefined, customer: string) {
    return frontendUserId ? `${frontendUserId}__${customer}` : customer
  }

  private prepaidUsageKey(frontendUserId: string | undefined, usageDate: string, customer: string) {
    return frontendUserId ? `${frontendUserId}__${usageDate}__${customer}` : `${usageDate}__${customer}`
  }

  private jsonValue(value: unknown) {
    return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
  }
}
