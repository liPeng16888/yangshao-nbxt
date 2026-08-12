import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const runbook = readFileSync(
  resolve(__dirname, '../../docs/deployment/shared-prepaid-cutover.md'),
  'utf8'
)

describe('shared prepaid cutover runbook contract', () => {
  it('keeps only Phase-A-invariant tables in the exact baseline count query', () => {
    const baselineStart = runbook.indexOf('The baseline-count query')
    const baselineEnd = runbook.indexOf('Save that SQL once', baselineStart)
    const baseline = runbook.slice(baselineStart, baselineEnd)

    expect(baseline).not.toContain("('FrontendSubAccountPermission'")
    expect(baseline).not.toContain("('LabSampleSaveRequest'")
    expect(baseline).toContain("('User'")
    expect(baseline).toContain("('FinanceDeletionRequestOrdinary'")
  })

  it('requires exact restored and production permission mappings after Phase A', () => {
    expect(runbook).toContain("'FINANCE_PREPAID_ADD'")
    expect(runbook).toContain("'FINANCE_PREPAID_CUSTOMERS'")
    expect(runbook).toContain("'PREPAID_RECHARGE'")
    expect(runbook).toContain("'PREPAID_CUSTOMERS'")
    expect(runbook).toContain("'PREPAID_CONSUMPTIONS'")
    expect(runbook).toContain("'PREPAID_SETTLEMENTS'")
    expect(runbook).toContain('yangshao-permission-expected.sql')
    expect(runbook).toContain('yangshao-permission-actual.sql')
    expect(runbook).toContain('yangshao-permission-issues.sql')
    expect(runbook).toContain('diff -u "$PERMISSIONS_EXPECTED" "$PERMISSIONS_RESTORE_PHASE_A"')
    expect(runbook).toContain('diff -u "$PERMISSIONS_EXPECTED" "$PERMISSIONS_SOURCE_PHASE_A"')
    expect(runbook).toContain('diff -u "$PERMISSIONS_SOURCE_PHASE_A" "$PERMISSIONS_AFTER"')
  })

  it('keeps permission snapshots separate from invariant Step 8 and rollback baselines', () => {
    const stepEight = runbook.slice(runbook.indexOf('### 8.'), runbook.indexOf('### 9.'))
    const rollback = runbook.slice(runbook.indexOf('## Rollback'), runbook.indexOf('## Local browser preparation'))

    expect(stepEight).toContain('BASELINE_COUNTS_BEFORE')
    expect(stepEight).toContain('PERMISSIONS_SOURCE_PHASE_A')
    expect(stepEight).not.toContain('FrontendSubAccountPermission')
    expect(rollback).toContain('BASELINE_COUNTS_BEFORE')
    expect(rollback).not.toContain('FrontendSubAccountPermission')
  })
})
