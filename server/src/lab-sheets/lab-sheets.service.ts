import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from '../auth/current-user'
import { todayInBeijing } from '../common/date'
import { calculateResults, createEmptyInputs, defaultLabParameters, defaultSampleBlockCount, editableInputFields } from '../common/lab'

@Injectable()
export class LabSheetsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSheetForFrontendUser(frontendUserId: string, date = todayInBeijing()) {
    const sheet = await this.ensureSheet(frontendUserId, date)
    return this.toSheetDto(sheet)
  }

  async updateCurrentParameters(frontendUserId: string, parameters: Record<string, number>) {
    const sheet = await this.ensureSheet(frontendUserId, todayInBeijing())
    const nextParameters = { ...defaultLabParameters, ...parameters, savedAt: new Date().toISOString() }
    await this.prisma.labSheet.update({ where: { id: sheet.id }, data: { parameters: nextParameters as Prisma.InputJsonValue } })
    return nextParameters
  }

  async addSampleBlocks(frontendUserId: string, sheetId: string, count: number) {
    if (!Number.isInteger(count) || count <= 0) throw new ForbiddenException('新增数量必须是正整数')
    const sheet = await this.prisma.labSheet.findUnique({ where: { id: sheetId }, include: { sampleBlocks: true } })
    if (!sheet || sheet.frontendUserId !== frontendUserId) throw new NotFoundException('未找到表格')
    const parameters = sheet.parameters as typeof defaultLabParameters
    const start = sheet.sampleBlocks.length + 1
    await this.prisma.sampleBlock.createMany({
      data: Array.from({ length: count }, (_, idx) => {
        const index = start + idx
        const inputs = createEmptyInputs(index)
        return {
          sheetId: sheet.id,
          index,
          readonly: sheet.readonly,
          inputs: inputs as Prisma.InputJsonValue,
          results: calculateResults(inputs, parameters) as Prisma.InputJsonValue,
          parameterSnapshot: parameters as Prisma.InputJsonValue
        }
      })
    })
    return this.getSheetForFrontendUser(frontendUserId, sheet.date)
  }

  async saveSampleBlock(user: CurrentUser, sheetId: string, blockPayload: Record<string, unknown>) {
    const sheet = await this.prisma.labSheet.findUnique({ where: { id: sheetId } })
    if (!sheet || sheet.frontendUserId !== user.id) throw new NotFoundException('未找到表格')
    if (sheet.readonly) throw new ForbiddenException('历史表格只读')
    const blockId = String(blockPayload.id || '')
    const block = await this.prisma.sampleBlock.findUnique({ where: { id: blockId } })
    if (!block || block.sheetId !== sheet.id) throw new NotFoundException('未找到样品')
    const oldInputs = (block.inputs || {}) as Record<string, unknown>
    const nextInputs = (blockPayload.inputs || {}) as Record<string, unknown>
    const parameters = (blockPayload.parameterSnapshot || sheet.parameters || defaultLabParameters) as typeof defaultLabParameters
    const results = calculateResults(nextInputs, parameters)
    const saved = await this.prisma.sampleBlock.update({
      where: { id: block.id },
      data: {
        readonly: Boolean(blockPayload.readonly),
        inputs: nextInputs as Prisma.InputJsonValue,
        results: results as Prisma.InputJsonValue,
        parameterSnapshot: parameters as Prisma.InputJsonValue
      }
    })
    await this.recordInputChanges(sheet.id, block.id, sheet.frontendUserId, user.id, oldInputs, nextInputs)
    return this.toBlockDto(saved)
  }

  async getHistory(frontendUserId: string) {
    const sheets = await this.prisma.labSheet.findMany({
      where: { frontendUserId },
      orderBy: { date: 'desc' },
      select: { id: true, date: true, readonly: true }
    })
    return sheets
  }

  async ensureSheet(frontendUserId: string, date: string) {
    const existing = await this.prisma.labSheet.findUnique({
      where: { frontendUserId_date: { frontendUserId, date } },
      include: { sampleBlocks: { orderBy: { index: 'asc' } } }
    })
    if (existing) return existing
    const readonly = date !== todayInBeijing()
    return this.prisma.labSheet.create({
      data: {
        frontendUserId,
        date,
        readonly,
        parameters: defaultLabParameters,
        sampleBlocks: {
          create: Array.from({ length: defaultSampleBlockCount }, (_, idx) => {
            const index = idx + 1
            const inputs = createEmptyInputs(index)
            return {
              index,
              readonly,
              inputs,
              results: calculateResults(inputs, defaultLabParameters),
              parameterSnapshot: defaultLabParameters
            }
          })
        }
      },
      include: { sampleBlocks: { orderBy: { index: 'asc' } } }
    })
  }

  private async recordInputChanges(sheetId: string, blockId: string, frontendUserId: string, changedById: string, oldInputs: Record<string, unknown>, nextInputs: Record<string, unknown>) {
    for (const field of editableInputFields) {
      const oldValue = oldInputs[field] ?? null
      const newValue = nextInputs[field] ?? null
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue
      await this.prisma.cellChangeLog.create({
        data: {
          sheetId,
          blockId,
          frontendUserId,
          changedById,
          field,
          oldValue: this.toJsonValue(oldValue),
          newValue: this.toJsonValue(newValue)
        }
      })
      const changeCount = await this.prisma.cellChangeLog.count({ where: { blockId, field } })
      if (changeCount >= 3) {
        const sheet = await this.prisma.labSheet.findUnique({ where: { id: sheetId } })
        await this.prisma.abnormalRecord.upsert({
          where: { blockId_field: { blockId, field } },
          create: {
            sheetId,
            blockId,
            frontendUserId,
            date: sheet?.date || todayInBeijing(),
            field,
            changeCount
          },
          update: { changeCount }
        })
      }
    }
  }

  private toSheetDto(sheet: Awaited<ReturnType<LabSheetsService['ensureSheet']>>) {
    return {
      id: sheet.id,
      date: sheet.date,
      readonly: sheet.readonly,
      parameters: sheet.parameters,
      sampleBlocks: sheet.sampleBlocks.map((block) => this.toBlockDto(block))
    }
  }

  private toBlockDto(block: { id: string; index: number; readonly: boolean; inputs: unknown; results: unknown; parameterSnapshot: unknown }) {
    return {
      id: block.id,
      index: block.index,
      readonly: block.readonly,
      inputs: block.inputs,
      results: block.results,
      parameterSnapshot: block.parameterSnapshot
    }
  }

  private toJsonValue(value: unknown) {
    return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
  }
}
