import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import type { FrontendCalculationDraft, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type {
  CalculationDraftKind,
  CalculationDraftPayloadByKind
} from './calculation-draft.types'
import { normalizeCalculationDraft } from './calculation-draft.validation'

export interface CalculationDraftDto<K extends CalculationDraftKind = CalculationDraftKind> {
  kind: K
  payload: CalculationDraftPayloadByKind[K]
  revision: number
  updatedAt: Date | null
}

type StoredDraft = Pick<
  FrontendCalculationDraft,
  'id' | 'frontendUserId' | 'kind' | 'payload' | 'revision' | 'updatedAt'
>

@Injectable()
export class CalculationDraftService {
  constructor(private readonly prisma: PrismaService) {}

  async get<K extends CalculationDraftKind>(
    frontendUserId: string,
    kind: K
  ): Promise<CalculationDraftDto<K>> {
    const row = await this.loadOwned(frontendUserId, kind)
    return row ? this.toDto(kind, row) : this.defaultDto(kind)
  }

  async save<K extends CalculationDraftKind>(
    frontendUserId: string,
    kind: K,
    baseRevision: number,
    payload: unknown
  ): Promise<CalculationDraftDto<K>> {
    this.assertBaseRevision(baseRevision)
    const normalized = normalizeCalculationDraft(kind, payload)
    const current = await this.loadOwned(frontendUserId, kind)

    if (baseRevision === 0) {
      if (current) throw await this.conflict(frontendUserId, kind)
      try {
        const created = await this.prisma.frontendCalculationDraft.create({
          data: {
            frontendUserId,
            kind,
            payload: normalized as unknown as Prisma.InputJsonValue,
            revision: 1
          }
        })
        return {
          kind,
          payload: normalized,
          revision: created.revision,
          updatedAt: created.updatedAt
        }
      } catch (error) {
        if (this.isUniqueConstraintViolation(error)) {
          throw await this.conflict(frontendUserId, kind)
        }
        throw error
      }
    }

    if (!current) throw await this.conflict(frontendUserId, kind)
    const updated = await this.prisma.frontendCalculationDraft.updateMany({
      where: {
        id: current.id,
        frontendUserId,
        kind,
        revision: baseRevision
      },
      data: {
        payload: normalized as unknown as Prisma.InputJsonValue,
        revision: { increment: 1 }
      }
    })
    if (updated.count !== 1) throw await this.conflict(frontendUserId, kind)

    let saved: StoredDraft | null
    try {
      saved = await this.loadOwned(frontendUserId, kind)
    } catch {
      throw await this.conflict(frontendUserId, kind)
    }
    if (!saved) throw this.conflictWith(this.defaultDto(kind))
    let serverDraft: CalculationDraftDto<K>
    try {
      serverDraft = this.toDto(kind, saved)
    } catch {
      throw await this.conflict(frontendUserId, kind)
    }
    if (serverDraft.revision !== baseRevision + 1) {
      throw this.conflictWith(serverDraft)
    }
    return serverDraft
  }

  private async loadOwned(frontendUserId: string, kind: CalculationDraftKind) {
    const row = await this.prisma.frontendCalculationDraft.findUnique({
      where: { frontendUserId_kind: { frontendUserId, kind } }
    })
    if (!row || row.frontendUserId !== frontendUserId || row.kind !== kind) return null
    return row
  }

  private toDto<K extends CalculationDraftKind>(kind: K, row: StoredDraft): CalculationDraftDto<K> {
    return {
      kind,
      payload: normalizeCalculationDraft(kind, row.payload),
      revision: row.revision,
      updatedAt: row.updatedAt
    }
  }

  private defaultDto<K extends CalculationDraftKind>(kind: K): CalculationDraftDto<K> {
    return {
      kind,
      payload: normalizeCalculationDraft(kind, createDefaultPayload(kind)),
      revision: 0,
      updatedAt: null
    }
  }

  private async conflict<K extends CalculationDraftKind>(frontendUserId: string, kind: K) {
    let serverDraft = this.defaultDto(kind)
    try {
      const row = await this.loadOwned(frontendUserId, kind)
      if (row) serverDraft = this.toDto(kind, row)
    } catch {
      // A conflict response must not expose a failed Prisma reload or malformed stored JSON.
    }
    return this.conflictWith(serverDraft)
  }

  private conflictWith<K extends CalculationDraftKind>(serverDraft: CalculationDraftDto<K>) {
    return new ConflictException({
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft
    })
  }

  private assertBaseRevision(baseRevision: number) {
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) {
      throw new BadRequestException('草稿基础版本无效')
    }
  }

  private isUniqueConstraintViolation(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
  }
}

function createDefaultPayload(kind: CalculationDraftKind) {
  if (kind === 'STANDARD_SAMPLE') {
    return {
      aluminum: {
        highStandard: 69.74,
        highReading: 7.7,
        lowStandard: 52,
        lowReading: 12.2,
        baseValue: 214.38
      },
      silicon: {
        lowStandard: 4.88,
        lowReading: 0.405,
        highStandard: 17.05,
        highReading: 1.31
      },
      iron: {
        lowStandard: 6.09,
        lowReading: 0.147,
        highStandard: 15.31,
        highReading: 0.461
      }
    }
  }

  return {
    parameters: {
      ironBlank: 0.04,
      ironFactor: 29.1,
      siliconBlank: 0.027,
      siliconFactor: 13,
      aluminumFactor1: 0.502,
      aluminumFactor2: 4.98,
      calciumFactor: 1.15,
      magnesiumFactor: 0.556,
      titaniumFactor: 0.57
    },
    standardAddCount: 1,
    calculationAddCount: 1,
    standardRows: Array.from({ length: 3 }, (_, index) => ({
      id: `standard-${index + 1}`,
      code: String(index + 1).padStart(3, '0'),
      autoCode: true,
      aluminum: null,
      silicon: null,
      iron: null,
      calcium: null,
      magnesium: null,
      titanium: null
    })),
    calculationRows: Array.from({ length: 3 }, (_, index) => ({
      id: `calculation-${index + 1}`,
      code: String(index + 1).padStart(3, '0'),
      autoCode: true,
      inputs: {
        ironRaw: null,
        siliconRaw: null,
        aluminumRaw: null,
        calciumRaw: null,
        magnesiumRaw: null,
        titaniumRaw: null
      }
    }))
  }
}
