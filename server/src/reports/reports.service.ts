import { Injectable } from '@nestjs/common'
import dayjs from 'dayjs'
import { PrismaService } from '../prisma/prisma.service'
import { datesBetween, todayInBeijing } from '../common/date'
import { toMoney } from '../common/money'

const incomeStatuses = ['已结款', '未结款', '月结款', '预存款', '未选择'] as const
type IncomeStatus = (typeof incomeStatuses)[number]

const financeCategoryRules = [
  { name: '耗材', color: '#3b82f6', keywords: ['耗材', '试剂', '标签', '纸'] },
  { name: '设备', color: '#14b8a6', keywords: ['设备', '校准', '维修', '仪器'] },
  { name: '人工', color: '#f59e0b', keywords: ['人工', '工资', '劳务'] },
  { name: '其他', color: '#64748b', keywords: [] }
]

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async sampleDetection(frontendUserId: string, query: any) {
    const range = this.resolveRange(query)
    const dates = datesBetween(range.startDate, range.endDate)
    const sheets = await this.prisma.labSheet.findMany({
      where: { frontendUserId, date: { gte: range.startDate, lte: range.endDate } },
      include: { sampleBlocks: true }
    })
    const sheetMap = new Map(sheets.map((sheet) => [sheet.date, sheet]))
    const prepaidRecharges = await this.prisma.sharedPrepaidRecharge.findMany({
      where: {
        ownerFrontendUserId: frontendUserId,
        rechargeDate: { gte: range.startDate, lte: range.endDate },
        reversedAt: null
      }
    })
    const rowMap = new Map<string, ReturnType<ReportsService['emptyIncomeRow']>>()
    dates.forEach((date) => {
      const sheet = sheetMap.get(date)
      const row = this.emptyIncomeRow(date)
      sheet?.sampleBlocks.forEach((block) => {
        const inputs = block.inputs as Record<string, unknown>
        const amount = this.getSampleAmount(inputs)
        if (!Number.isFinite(amount)) return
        const status = this.getIncomeStatus(inputs)
        row.sampleCount += 1
        const summary = row.statusSummaries.find((item) => item.status === status)
        if (summary) summary.count += 1
        if (status !== '预存款') {
          row.totalPrice = toMoney(row.totalPrice + amount)
          if (summary) {
            summary.amount = toMoney(summary.amount + amount)
          }
        }
      })
      rowMap.set(date, row)
    })
    prepaidRecharges.forEach((recharge) => {
      const row = rowMap.get(recharge.rechargeDate) || this.emptyIncomeRow(recharge.rechargeDate)
      const amount = toMoney(recharge.paidAmount)
      const summary = row.statusSummaries.find((item) => item.status === '预存款')
      if (summary) summary.amount = toMoney(summary.amount + amount)
      row.totalPrice = toMoney(row.totalPrice + amount)
      rowMap.set(recharge.rechargeDate, row)
    })
    const rows = Array.from(rowMap.values()).sort((a, b) => a.date.localeCompare(b.date))
    const totalSamples = rows.reduce((sum, row) => sum + row.sampleCount, 0)
    const totalPrice = toMoney(rows.reduce((sum, row) => sum + row.totalPrice, 0))
    return {
      summary: {
        totalSamples,
        totalPrice,
        averageSamples: rows.length ? toMoney(totalSamples / rows.length) : 0,
        averagePrice: rows.length ? toMoney(totalPrice / rows.length) : 0,
        statusSummaries: incomeStatuses.map((status) => ({
          status,
          count: rows.reduce((sum, row) => sum + (row.statusSummaries.find((item) => item.status === status)?.count || 0), 0),
          amount: toMoney(rows.reduce((sum, row) => sum + (row.statusSummaries.find((item) => item.status === status)?.amount || 0), 0))
        }))
      },
      rows
    }
  }

  async finance(frontendUserId: string, query: any) {
    const range = this.resolveRange(query)
    const dates = datesBetween(range.startDate, range.endDate)
    const entries = await this.prisma.financeEntry.findMany({
      where: { frontendUserId, paymentDate: { gte: range.startDate, lte: range.endDate } },
      orderBy: { paymentDate: 'asc' }
    })
    const rows = dates.map((date) => {
      const dayEntries = entries.filter((entry) => entry.paymentDate === date)
      const amount = toMoney(dayEntries.reduce((sum, entry) => sum + toMoney(entry.amount), 0))
      return {
        date,
        amount,
        count: dayEntries.length,
        mainCategory: dayEntries[0] ? this.classifyFinanceItem(dayEntries[0].item).name : '无'
      }
    })
    const categoryMap = new Map<string, { amount: number; count: number; color: string }>()
    for (const entry of entries) {
      const category = this.classifyFinanceItem(entry.item)
      const current = categoryMap.get(category.name) || { amount: 0, count: 0, color: category.color }
      current.amount = toMoney(current.amount + toMoney(entry.amount))
      current.count += 1
      categoryMap.set(category.name, current)
    }
    const categories = Array.from(categoryMap.entries()).map(([category, value]) => ({ category, ...value }))
    const totalAmount = toMoney(rows.reduce((sum, row) => sum + row.amount, 0))
    const totalCount = rows.reduce((sum, row) => sum + row.count, 0)
    const highest = rows.reduce((max, row) => (row.amount > max.amount ? row : max), { date: '无', amount: 0, count: 0, mainCategory: '无' })
    return {
      summary: {
        totalAmount,
        totalCount,
        averageAmount: rows.length ? toMoney(totalAmount / rows.length) : 0,
        highestExpenseDay: highest.date
      },
      rows,
      categories
    }
  }

  categories() {
    return financeCategoryRules
  }

  private resolveRange(query: { mode?: string; date?: string; startDate?: string; endDate?: string }) {
    const base = dayjs(query.date || todayInBeijing())
    if (query.mode === 'weekly') return { startDate: base.startOf('week').format('YYYY-MM-DD'), endDate: base.endOf('week').format('YYYY-MM-DD') }
    if (query.mode === 'monthly') return { startDate: base.startOf('month').format('YYYY-MM-DD'), endDate: base.endOf('month').format('YYYY-MM-DD') }
    if (query.mode === 'custom') return { startDate: query.startDate || todayInBeijing(), endDate: query.endDate || query.startDate || todayInBeijing() }
    return { startDate: base.format('YYYY-MM-DD'), endDate: base.format('YYYY-MM-DD') }
  }

  private emptyIncomeRow(date: string) {
    return {
      date,
      sampleCount: 0,
      totalPrice: 0,
      statusSummaries: incomeStatuses.map((status) => ({ status, count: 0, amount: 0 }))
    }
  }

  private getSampleAmount(inputs: Record<string, unknown>) {
    return typeof inputs.price === 'number' && Number.isFinite(inputs.price) ? toMoney(inputs.price) : Number.NaN
  }

  private getIncomeStatus(inputs: Record<string, unknown>): IncomeStatus {
    return incomeStatuses.includes(inputs.paymentStatus as IncomeStatus) ? (inputs.paymentStatus as IncomeStatus) : '未选择'
  }

  private classifyFinanceItem(item: string) {
    return financeCategoryRules.find((rule) => rule.name !== '其他' && rule.keywords.some((keyword) => item.includes(keyword))) || financeCategoryRules[financeCategoryRules.length - 1]
  }
}
