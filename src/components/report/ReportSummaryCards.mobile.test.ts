import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'
import ReportSummaryCards from './ReportSummaryCards.vue'

const componentPath = resolve(process.cwd(), 'src/components/report/ReportSummaryCards.vue')
const source = readFileSync(componentPath, 'utf8')
const style = source.match(/<style scoped lang="scss">([\s\S]*?)<\/style>/)?.[1] || ''
const compiledCss = compileString(style).css

describe('ReportSummaryCards mobile CSS', () => {
  it('keeps the two-column mobile override after desktop responsive rules while desktop has no mobile class', () => {
    const mobile = mount(ReportSummaryCards, { props: { mobile: true, items: [] } })
    const desktop = mount(ReportSummaryCards, { props: { mobile: false, items: [] } })

    expect(mobile.classes()).toContain('summary-cards--mobile')
    expect(desktop.classes()).not.toContain('summary-cards--mobile')
    expect(compiledCss.lastIndexOf('.summary-cards--mobile')).toBeGreaterThan(compiledCss.indexOf('@media (max-width: 900px)'))
    expect(compiledCss.slice(compiledCss.lastIndexOf('.summary-cards--mobile'))).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
  })
})
