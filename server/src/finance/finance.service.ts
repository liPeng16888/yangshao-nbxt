import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { MonthlySettlementStatus, PaymentMethod, Prisma, ReminderType } from '@prisma/client'
import dayjs from 'dayjs'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from '../auth/current-user'
import { AdminAccessService } from '../admin/admin-access.service'
import { RemindersService } from '../reminders/reminders.service'
import { currentMonthInBeijing, datesBetween, todayInBeijing } from '../common/date'
import { toMoney } from '../common/money'
import { calculateResults, defaultLabParameters } from '../common/lab'

const incomeStatuses = ['已结款', '未结款', '月结款', '未选择'] as const
type IncomeStatus = (typeof incomeStatuses)[number]

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAccess: AdminAccessService,
    private readonly reminders: RemindersService
  ) {}

  listFrontendExpenses(frontendUserId: string, month = currentMonthInBeijing()) {
    return this.prisma.financeEntry
      .findMany({
        where: { frontendUserId, paymentDate: { startsWith: month } },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }]
      })
      .then((rows) => rows.map((row) => this.expenseDto(row)))
  }

  async createFrontendExpense(frontendUserId: string, payload: { paymentDate: string; item: string; amount: number; paymentMethod: PaymentMethod; screenshotUrl?: string; remark?: string }) {
    if (!payload.paymentDate || !payload.item || !payload.paymentMethod) throw new BadRequestException('支付日期、开支项目和支付方式不能为空')
    if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) throw new BadRequestException('开支金额必须大于 0')
    const row = await this.prisma.financeEntry.create({
      data: {
        frontendUserId,
        paymentDate: payload.paymentDate,
        item: payload.item,
        amount: toMoney(payload.amount),
        paymentMethod: payload.paymentMethod,
        screenshotUrl: payload.screenshotUrl || null,
        remark: payload.remark || null
      }
    })
    return this.expenseDto(row)
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
    const sheets = await this.loadSheets([frontendUserId], `${month}-01`, dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD'))
    return this.buildIncomeReport(month, sheets)
  }

  async getFrontendUnsettledSamples(frontendUserId: string) {
    const sheets = await this.loadSheets([frontendUserId])
    return this.getUnsettledRows(sheets).sort((a, b) => `${b.date}-${b.sequence}`.localeCompare(`${a.date}-${a.sequence}`))
  }

  async markFrontendSamplePaid(frontendUserId: string, blockId: string) {
    const block = await this.prisma.sampleBlock.findUnique({ where: { id: blockId }, include: { sheet: true } })
    if (!block || block.sheet.frontendUserId !== frontendUserId) throw new NotFoundException('未找到样品')
    const inputs = { ...((block.inputs || {}) as Record<string, unknown>), paymentStatus: '已结款' }
    const parameters = (block.parameterSnapshot || block.sheet.parameters || defaultLabParameters) as typeof defaultLabParameters
    const saved = await this.prisma.sampleBlock.update({
      where: { id: block.id },
      data: {
        inputs,
        results: calculateResults(inputs, parameters)
      }
    })
    await this.prisma.cellChangeLog.create({
      data: {
        sheetId: block.sheetId,
        blockId: block.id,
        frontendUserId,
        changedById: frontendUserId,
        field: 'paymentStatus',
        oldValue: this.jsonValue((block.inputs as Record<string, unknown>)?.paymentStatus ?? null),
        newValue: '已结款'
      }
    })
    return this.blockDto(saved)
  }

  async getFrontendMonthlySettlementReport(frontendUserId: string, month = currentMonthInBeijing()) {
    const sheets = await this.loadSheets([frontendUserId], `${month}-01`, dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD'))
    const dailyRows = this.getMonthlyDailyRows(sheets)
    const savedRows = await this.prisma.monthlySettlementRecord.findMany({ where: { frontendUserId, month } })
    return this.buildMonthlyReport(month, dailyRows, savedRows)
  }

  async updateFrontendMonthlySettlement(frontendUserId: string, payload: { month: string; customer: string; settlementStatus: string; paidAmount?: number | null; remark?: string }) {
    if (!payload.month || !payload.customer) throw new BadRequestException('月份和客户不能为空')
    const status = this.monthlyStatusFromChinese(payload.settlementStatus)
    const row = await this.prisma.monthlySettlementRecord.upsert({
      where: { month_frontendUserId_customer: { month: payload.month, frontendUserId, customer: payload.customer } },
      create: {
        month: payload.month,
        frontendUserId,
        customer: payload.customer,
        status,
        paidAmount: status === MonthlySettlementStatus.PARTIAL ? toMoney(payload.paidAmount) : status === MonthlySettlementStatus.PAID ? toMoney(payload.paidAmount) : null,
        remark: payload.remark || null
      },
      update: {
        status,
        paidAmount: status === MonthlySettlementStatus.PARTIAL ? toMoney(payload.paidAmount) : status === MonthlySettlementStatus.PAID ? toMoney(payload.paidAmount) : null,
        remark: payload.remark || null
      }
    })
    return this.monthlyRecordDto(row, payload.customer, payload.month)
  }

  async getAdminIncomeReport(admin: CurrentUser, query: { frontendUserIds?: string | string[]; startDate?: string; endDate?: string; month?: string }) {
    const range = this.resolveRange(query)
    const frontendUserIds = await this.adminAccess.getAllowedFrontendUserIds(admin, this.adminAccess.parseFrontendUserIds(query.frontendUserIds))
    const sheets = await this.loadSheets(frontendUserIds, range.startDate, range.endDate)
    return {
      ...this.buildIncomeReport(query.month || range.startDate.slice(0, 7), sheets),
      range,
      totals: {
        today: this.sumIncomeByRange(sheets, todayInBeijing(), todayInBeijing()),
        week: this.sumIncomeByRange(sheets, dayjs().startOf('week').format('YYYY-MM-DD'), todayInBeijing()),
        month: this.sumIncomeByRange(sheets, dayjs().startOf('month').format('YYYY-MM-DD'), todayInBeijing())
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
        screenshotUrl: row.screenshotUrl || '',
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

  private buildIncomeReport(month: string, sheets: Awaited<ReturnType<FinanceService['loadSheets']>>) {
    const rowMap = new Map<string, ReturnType<FinanceService['emptyIncomeRow']>>()
    sheets.forEach((sheet) => {
      const row = rowMap.get(sheet.date) || this.emptyIncomeRow(sheet.date)
      sheet.sampleBlocks.forEach((block) => {
        const inputs = block.inputs as Record<string, unknown>
        const amount = this.getSampleAmount(inputs)
        if (!Number.isFinite(amount)) return
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
    const map = new Map<string, { id: string; date: string; frontendUserId: string; name: string; customer: string; sampleCount: number; amount: number }>()
    sheets.forEach((sheet) => {
      sheet.sampleBlocks.forEach((block) => {
        const inputs = block.inputs as Record<string, unknown>
        const amount = this.getSampleAmount(inputs)
        if (!Number.isFinite(amount) || inputs.paymentStatus !== '月结款') return
        const customer = this.getCustomerName(inputs)
        const key = `${sheet.date}__${sheet.frontendUserId}__${customer}`
        const current =
          map.get(key) ||
          {
            id: key,
            date: sheet.date,
            frontendUserId: sheet.frontendUserId,
            name: this.displayName(sheet.frontendUser),
            customer,
            sampleCount: 0,
            amount: 0
          }
        current.sampleCount += 1
        current.amount = toMoney(current.amount + amount)
        map.set(key, current)
      })
    })
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date) || a.customer.localeCompare(b.customer, 'zh-Hans-CN'))
  }

  private buildMonthlyReport(month: string, dailyRows: ReturnType<FinanceService['getMonthlyDailyRows']>, savedRows: Awaited<ReturnType<PrismaService['monthlySettlementRecord']['findMany']>>) {
    const savedMap = new Map(savedRows.map((row) => [`${row.frontendUserId}__${row.customer}`, row]))
    const summaryMap = new Map<string, { id: string; month: string; frontendUserId: string; name: string; customer: string; sampleCount: number; amount: number }>()
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
          sampleCount: 0,
          amount: 0
        }
      current.sampleCount += row.sampleCount
      current.amount = toMoney(current.amount + row.amount)
      summaryMap.set(key, current)
    })
    const summaryRows = Array.from(summaryMap.values()).map((row) => {
      const saved = savedMap.get(`${row.frontendUserId}__${row.customer}`)
      const status = saved?.status || MonthlySettlementStatus.UNPAID
      const paidAmount = status === MonthlySettlementStatus.PAID ? row.amount : status === MonthlySettlementStatus.PARTIAL ? toMoney(saved?.paidAmount || 0) : null
      return {
        ...row,
        recordId: saved?.id || '',
        settlementStatus: this.monthlyStatusToChinese(status),
        paidAmount,
        remark: saved?.remark || (status === MonthlySettlementStatus.PARTIAL ? `未结款差额 ¥${toMoney(row.amount - (paidAmount || 0)).toFixed(2)}` : '')
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

  private expenseDto(row: { id: string; paymentDate: string; item: string; amount: unknown; paymentMethod: PaymentMethod; screenshotUrl: string | null; remark: string | null }) {
    return {
      id: row.id,
      paymentDate: row.paymentDate,
      item: row.item,
      amount: toMoney(row.amount),
      paymentMethod: row.paymentMethod,
      screenshotUrl: row.screenshotUrl || '',
      remark: row.remark || ''
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

  private monthlyRecordDto(row: { id: string; month: string; customer: string; status: MonthlySettlementStatus; paidAmount: unknown; remark: string | null }, customer: string, month: string) {
    return {
      id: `${month}__${customer}`,
      recordId: row.id,
      month: row.month,
      customer: row.customer,
      settlementStatus: this.monthlyStatusToChinese(row.status),
      paidAmount: row.paidAmount === null ? null : toMoney(row.paidAmount),
      remark: row.remark || ''
    }
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

  private sumIncomeByRange(sheets: Awaited<ReturnType<FinanceService['loadSheets']>>, startDate: string, endDate: string) {
    const allowedDates = new Set(datesBetween(startDate, endDate))
    let sampleCount = 0
    let amount = 0
    sheets.forEach((sheet) => {
      if (!allowedDates.has(sheet.date)) return
      sheet.sampleBlocks.forEach((block) => {
        const value = this.getSampleAmount(block.inputs as Record<string, unknown>)
        if (!Number.isFinite(value)) return
        sampleCount += 1
        amount += value
      })
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

  private jsonValue(value: unknown) {
    return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
  }
}
