import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('sample retest persistence contract', () => {
  const schema = readFileSync('server/prisma/schema.prisma', 'utf8')
  const migration = readFileSync(
    'server/prisma/migrations/20260820000000_add_sample_retests/migration.sql',
    'utf8'
  )

  it('uses a non-reusable parent sequence counter and independent retest records', () => {
    expect(schema).toContain('nextRetestSequence Int            @default(1)')
    expect(schema).toContain('model SampleRetest {')
    expect(schema).toContain('@@unique([sampleBlockId, sequence])')
    expect(schema).toContain('everFilled        Boolean            @default(false)')
    expect(schema).toContain('model SampleRetestWriteRequest {')
    expect(migration).toContain('ADD COLUMN "nextRetestSequence" INTEGER NOT NULL DEFAULT 1')
  })
})
