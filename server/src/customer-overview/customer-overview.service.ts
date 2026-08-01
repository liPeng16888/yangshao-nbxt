import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { hasLabDetectionInput } from '../common/lab'
import { toMoney } from '../common/money'

type CustomerSnapshot = {
  id?: string
  name?: string
  phone?: string | null
  wechat?: string | null
  wechatNickname?: string | null
  note?: string | null
}

export interface CustomerOverviewRow {
  frontendUserId: string
  frontendUserName: string
  customerKey: string
  customer: string
  customerDisplay: string
  sampleCount: number
  totalAmount: number
  firstDetectionDate: string
  lastDetectionDate: string
}

@Injectable()
export class CustomerOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getRows(frontendUserIds: string[]): Promise<CustomerOverviewRow[]> {
    const allowedIds = this.uniqueStrings(frontendUserIds)
    if (!allowedIds.length) return []

    const sheets = await this.prisma.labSheet.findMany({
      where: { frontendUserId: { in: allowedIds } },
      include: {
        frontendUser: { select: { account: true, username: true, displayRemark: true } },
        sampleBlocks: { orderBy: { index: 'asc' } }
      },
      orderBy: { date: 'asc' }
    })
    const referencedCustomerIds = this.collectCustomerIds(sheets)
    const currentCustomers = referencedCustomerIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: referencedCustomerIds }, frontendUserId: { in: allowedIds } },
          select: { id: true, frontendUserId: true, name: true, phone: true, wechat: true, wechatNickname: true }
        })
      : []
    const currentCustomerMap = new Map(
      currentCustomers.map((customer) => [`${customer.frontendUserId}__${customer.id}`, customer])
    )
    const rowMap = new Map<string, CustomerOverviewRow>()

    for (const sheet of sheets) {
      for (const block of sheet.sampleBlocks) {
        const inputs = (block.inputs || {}) as Record<string, unknown>
        if (!hasLabDetectionInput(inputs)) continue

        const snapshots = this.customerSnapshots(inputs)
        const customerIds = this.customerIds(inputs, snapshots)
        const resolvedCustomers = this.resolveCustomers(sheet.frontendUserId, customerIds, snapshots, currentCustomerMap)
        const customer = this.customerName(inputs, resolvedCustomers)
        if (!customer) continue

        const customerKey = customerIds.length
          ? `ids:${[...customerIds].sort().join('|')}`
          : `text:${customer}`
        const mapKey = `${sheet.frontendUserId}__${customerKey}`
        const customerDisplay = resolvedCustomers.length
          ? resolvedCustomers.map((item) => this.formatCustomer(item)).filter(Boolean).join('、')
          : customer
        const amount = this.sampleAmount(inputs.price)
        const current = rowMap.get(mapKey)

        if (!current) {
          rowMap.set(mapKey, {
            frontendUserId: sheet.frontendUserId,
            frontendUserName: sheet.frontendUser.displayRemark?.trim() || sheet.frontendUser.username || sheet.frontendUser.account,
            customerKey,
            customer,
            customerDisplay: customerDisplay || customer,
            sampleCount: 1,
            totalAmount: amount,
            firstDetectionDate: sheet.date,
            lastDetectionDate: sheet.date
          })
          continue
        }

        current.sampleCount += 1
        current.totalAmount = toMoney(current.totalAmount + amount)
        if (sheet.date < current.firstDetectionDate) current.firstDetectionDate = sheet.date
        if (sheet.date > current.lastDetectionDate) current.lastDetectionDate = sheet.date
        if (customerDisplay.length > current.customerDisplay.length) current.customerDisplay = customerDisplay
      }
    }

    return Array.from(rowMap.values()).sort((left, right) =>
      right.lastDetectionDate.localeCompare(left.lastDetectionDate) ||
      left.frontendUserName.localeCompare(right.frontendUserName, 'zh-CN') ||
      left.customerDisplay.localeCompare(right.customerDisplay, 'zh-CN')
    )
  }

  private collectCustomerIds(sheets: Array<{ sampleBlocks: Array<{ inputs: unknown }> }>) {
    return this.uniqueStrings(
      sheets.flatMap((sheet) =>
        sheet.sampleBlocks.flatMap((block) => {
          const inputs = (block.inputs || {}) as Record<string, unknown>
          return this.customerIds(inputs, this.customerSnapshots(inputs))
        })
      )
    )
  }

  private customerSnapshots(inputs: Record<string, unknown>): CustomerSnapshot[] {
    return Array.isArray(inputs.customers)
      ? inputs.customers.filter((item): item is CustomerSnapshot => Boolean(item) && typeof item === 'object')
      : []
  }

  private customerIds(inputs: Record<string, unknown>, snapshots: CustomerSnapshot[]) {
    return this.uniqueStrings([
      ...(Array.isArray(inputs.customerIds) ? inputs.customerIds : []),
      inputs.customerId,
      ...snapshots.map((customer) => customer.id)
    ])
  }

  private resolveCustomers(
    frontendUserId: string,
    customerIds: string[],
    snapshots: CustomerSnapshot[],
    currentCustomerMap: Map<string, CustomerSnapshot>
  ) {
    const snapshotById = new Map(snapshots.filter((item) => item.id).map((item) => [item.id as string, item]))
    const selected = customerIds
      .map((id) => {
        const current = currentCustomerMap.get(`${frontendUserId}__${id}`)
        const snapshot = snapshotById.get(id)
        return current ? { ...snapshot, ...current } : snapshot
      })
      .filter((item): item is CustomerSnapshot => Boolean(item))
    const selectedIds = new Set(selected.map((item) => item.id).filter(Boolean))
    return [...selected, ...snapshots.filter((item) => !item.id || !selectedIds.has(item.id))]
  }

  private customerName(inputs: Record<string, unknown>, customers: CustomerSnapshot[]) {
    const storedText = typeof inputs.customerText === 'string' ? inputs.customerText.trim() : ''
    return storedText || customers.map((customer) => customer.name?.trim()).filter(Boolean).join('、')
  }

  private formatCustomer(customer: CustomerSnapshot) {
    return [customer.name, customer.phone, customer.wechat, customer.wechatNickname, customer.note]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ')
  }

  private sampleAmount(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? toMoney(value) : 0
  }

  private uniqueStrings(values: unknown[]) {
    return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim())))
  }
}
