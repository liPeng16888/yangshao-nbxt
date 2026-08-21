# Mobile Report Filter Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vertically and horizontally center every mobile report-filter segmented-button label while preserving the existing 44px touch targets and desktop report behavior.

**Architecture:** Keep the change inside `MobileReportFilter.vue`. Exercise the real Element Plus radio-button markup in the owning component test, then add only the missing flex alignment properties to the existing scoped deep rule.

**Tech Stack:** Vue 3, TypeScript, Element Plus, SCSS, Vue Test Utils, Vitest, Vite/PWA.

## Global Constraints

- Change only the customer frontend mobile report filter and its owning test.
- Keep all report filter props, staged state, emitted events, Store/API behavior, desktop report UI, and server code unchanged.
- Apply the alignment to both statistics-dimension and time-range segmented buttons.
- Preserve `min-height: 44px`, two-column layout, narrow-screen wrapping, and no horizontal overflow.

---

### Task 1: Center mobile report segmented-button labels

**Files:**
- Modify: `src/components/report/MobileReportFilter.vue:201-207`
- Test: `src/views/dashboard/ReportPage.mobile.test.ts:218-245`

**Interfaces:**
- Consumes: Element Plus `.el-radio-button__inner` markup inside `.mobile-report-filter__fields`.
- Produces: the same filter UI and events, with each radio-button inner rendered as an `inline-flex` 44px touch target centered on both axes.

- [ ] **Step 1: Write the failing real-markup alignment test**

Import the real Element Plus radio components:

```ts
import { ElRadioButton, ElRadioGroup } from 'element-plus'
```

Add this test under `describe('MobileReportFilter')`, mounting the real radio controls while retaining the existing harmless drawer/date stubs:

```ts
it('centers every statistics and time-range label inside its 44px touch target', () => {
  const wrapper = mount(MobileReportFilter, {
    props: {
      mode: 'daily',
      date: '2026-08-16',
      startDate: '2026-08-01',
      endDate: '2026-08-16'
    },
    global: {
      components: { ElRadioButton, ElRadioGroup },
      stubs: {
        ...globalStubs,
        ElRadioButton: false,
        ElRadioGroup: false
      }
    }
  })

  const labels = wrapper.findAll('.el-radio-button__inner')
  expect(labels).toHaveLength(6)
  for (const label of labels) {
    const style = getComputedStyle(label.element)
    expect(style.display).toBe('inline-flex')
    expect(style.alignItems).toBe('center')
    expect(style.justifyContent).toBe('center')
    expect(Number.parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44)
  }
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/views/dashboard/ReportPage.mobile.test.ts -t "centers every statistics"
```

Expected: FAIL because the existing `.el-radio-button__inner` computes to `display: inline-block` without `align-items` or `justify-content` centering.

- [ ] **Step 3: Implement the minimum scoped style fix**

Update the existing deep rule in `MobileReportFilter.vue`:

```scss
:deep(.el-radio-button__inner) {
  display: inline-flex;
  width: 100%;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  overflow-wrap: anywhere;
  white-space: normal;
}
```

Do not change template structure, props, emits, query behavior, drawer sizing, or desktop components.

- [ ] **Step 4: Verify GREEN and focused regression**

Run:

```bash
./node_modules/.bin/vitest run src/views/dashboard/ReportPage.mobile.test.ts
./node_modules/.bin/vue-tsc --noEmit
git diff --check
```

Expected: all focused report-page tests pass, type checking exits 0, and the diff check is clean.

- [ ] **Step 5: Verify the authenticated mobile page**

At the existing `http://127.0.0.1:57591/reports` mobile viewport, open “报表筛选” and measure all six `.el-radio-button__inner` elements. Confirm each has `display: inline-flex`, `align-items: center`, `justify-content: center`, height at least 44px, its text center lies within 1px of the button center, and the document has no horizontal overflow.

- [ ] **Step 6: Run complete frontend regression and production build**

Run:

```bash
./node_modules/.bin/vitest run --reporter=json --outputFile=/private/tmp/mobile-report-filter-alignment.json
jq '{numTotalTestSuites,numPassedTestSuites,numFailedTestSuites,numTotalTests,numPassedTests,numFailedTests,success}' /private/tmp/mobile-report-filter-alignment.json
./node_modules/.bin/vite build
git diff --check
```

Expected: zero failed suites/tests, the Vite/PWA production build exits 0, and no whitespace errors are reported.

- [ ] **Step 7: Commit the tested fix**

```bash
git add src/components/report/MobileReportFilter.vue src/views/dashboard/ReportPage.mobile.test.ts
git commit -m "fix: center mobile report filter labels"
```

The commit must not include backend, admin, Store, API, generated `dist`, or deployment changes.
