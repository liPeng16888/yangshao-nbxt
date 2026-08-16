# Data Calculation Mobile Toolbar Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tall sticky mobile data-calculation toolbar with a default-collapsed 44px summary that expands to the existing controls on demand.

**Architecture:** Keep all state and handlers in `LabDataPage.vue`. Add one page-local expansion flag and render a mobile-only summary above the existing toolbar content; the desktop branch always renders the full existing controls. Reuse every existing date, save-recovery, completion, bulk-fill, SMS, and report handler.

**Tech Stack:** Vue 3 Composition API, TypeScript, Element Plus, Vitest, Vue Test Utils, Vite/PWA.

## Global Constraints

- Change only the customer frontend data-calculation page and its owning test.
- Desktop toolbar behavior and layout must remain complete and non-collapsible.
- Do not change Stores, APIs, database schemas, PWA caching, or business handlers.
- Mobile toolbar starts collapsed for every new page instance and does not persist the expansion state.
- Entering mobile selection mode or switching layouts collapses the toolbar.
- Every mobile toggle/action target remains at least 44px and exposes `aria-expanded` plus an explicit accessible label.

## File Structure

- Modify `src/views/dashboard/LabDataPage.vue`: page-local expansion state, summary rendering, mutual mobile/desktop toolbar content, selection/layout reset watchers, and scoped responsive styles.
- Modify `src/views/dashboard/LabDataPage.test.ts`: behavior tests for initial collapse, expansion/collapse, selection-mode reset, error summary, and unchanged desktop controls.

---

### Task 1: Collapsible mobile data-calculation toolbar

**Files:**
- Modify: `src/views/dashboard/LabDataPage.vue:7-42,204-270,664-790`
- Test: `src/views/dashboard/LabDataPage.test.ts:429-560,733-760`

**Interfaces:**
- Consumes: existing `isMobileLayout: Readonly<Ref<boolean>>`, `selectionMode: ComputedRef<boolean>`, `selectedDate`, `isPageReadonly`, `autoSaveText`, and all existing toolbar handlers.
- Produces: page-local `mobileToolbarExpanded: Ref<boolean>`, `mobileToolbarEditStatus: ComputedRef<string>`, `.mobile-toolbar-summary`, `.toolbar-content`, and unchanged existing button events.

- [ ] **Step 1: Write failing mobile toolbar behavior tests**

Add tests to `LabDataPage.test.ts` using the real page component and existing Element Plus stubs:

```ts
it('starts the mobile toolbar as a compact summary and expands and collapses the existing controls', async () => {
  mocks.mobileLayout.isMobileLayout.value = true
  const wrapper = mountPage()
  await settleMountedPage()

  const summary = wrapper.get('.mobile-toolbar-summary')
  expect(summary.attributes('aria-expanded')).toBe('false')
  expect(summary.text()).toContain('2026-06-24')
  expect(summary.text()).toContain('当前表可编辑')
  expect(summary.text()).toContain('自动保存开启')
  expect(wrapper.find('.toolbar-content').exists()).toBe(false)
  expect(wrapper.findAll('button').some((button) => button.text() === '生成化验报告')).toBe(false)

  await summary.trigger('click')
  await nextTick()
  expect(wrapper.get('.mobile-toolbar-summary').attributes('aria-expanded')).toBe('true')
  expect(wrapper.get('.toolbar-content').text()).toContain('生成化验报告')
  expect(wrapper.get('.toolbar-content').text()).toContain('生成化验短信')

  await wrapper.get('.mobile-toolbar-summary').trigger('click')
  await nextTick()
  expect(wrapper.find('.toolbar-content').exists()).toBe(false)
})
```

```ts
it('automatically collapses the expanded mobile toolbar when selection mode starts', async () => {
  mocks.mobileLayout.isMobileLayout.value = true
  const wrapper = mountPage()
  await settleMountedPage()

  await wrapper.get('.mobile-toolbar-summary').trigger('click')
  await findButtonByText(wrapper, '批量填写样品').trigger('click')
  await nextTick()

  expect(wrapper.get('.mobile-toolbar-summary').attributes('aria-expanded')).toBe('false')
  expect(wrapper.find('.toolbar-content').exists()).toBe(false)
  expect(wrapper.get('.mobile-selection-bar').text()).toContain('已选 0 个样品')
})
```

```ts
it('keeps save failures visible in the collapsed mobile summary and recovery available after expanding', async () => {
  mocks.mobileLayout.isMobileLayout.value = true
  mocks.labStore.autoSaveStatus = 'error'
  const wrapper = mountPage()
  await settleMountedPage()

  expect(wrapper.get('.mobile-toolbar-summary').text()).toContain('自动保存失败，请手动保存')
  await wrapper.get('.mobile-toolbar-summary').trigger('click')
  await findButtonByText(wrapper, '重试保存').trigger('click')
  await Promise.resolve()
  expect(mocks.labStore.retryFailedSaves).toHaveBeenCalledTimes(1)
})
```

Extend the existing desktop/mobile mutual-layout test:

```ts
expect(desktop.find('.mobile-toolbar-summary').exists()).toBe(false)
expect(desktop.get('.toolbar-content').text()).toContain('生成化验报告')
expect(mobile.get('.mobile-toolbar-summary').attributes('aria-expanded')).toBe('false')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/views/dashboard/LabDataPage.test.ts
```

Expected: the new assertions fail because `.mobile-toolbar-summary` and `.toolbar-content` do not exist and the current mobile controls render immediately.

- [ ] **Step 3: Implement the minimum page-local state and mutually exclusive template**

Add state and summary text in `LabDataPage.vue`:

```ts
const mobileToolbarExpanded = ref(false)

const mobileToolbarEditStatus = computed(() => {
  if (switchingBusinessDay.value) return '正在切换业务日'
  if (labStore.sheet?.readonly) return '历史副表只读'
  return '当前表可编辑'
})

watch(isMobileLayout, () => {
  mobileToolbarExpanded.value = false
})

watch(selectionMode, (selecting) => {
  if (isMobileLayout.value && selecting) mobileToolbarExpanded.value = false
})
```

Wrap the current `.toolbar-left` and `.toolbar-right` in `.toolbar-content`, render it when `!isMobileLayout || mobileToolbarExpanded`, and add this summary before it:

```vue
<button
  v-if="isMobileLayout"
  class="mobile-toolbar-summary"
  type="button"
  :aria-expanded="mobileToolbarExpanded"
  :aria-label="mobileToolbarExpanded ? '收起数据计算操作' : '展开数据计算操作'"
  @click="mobileToolbarExpanded = !mobileToolbarExpanded"
>
  <span class="mobile-toolbar-summary__date">{{ selectedDate }}</span>
  <span class="mobile-toolbar-summary__edit">{{ mobileToolbarEditStatus }}</span>
  <span v-if="!isPageReadonly" class="mobile-toolbar-summary__save" :class="`is-${labStore.autoSaveStatus}`">
    {{ autoSaveText }}
  </span>
  <span class="mobile-toolbar-summary__toggle">{{ mobileToolbarExpanded ? '收起' : '展开' }}</span>
</button>
<div v-if="!isMobileLayout || mobileToolbarExpanded" class="toolbar-content">
  <div class="toolbar-left">
    <el-date-picker v-model="selectedDate" type="date" value-format="YYYY-MM-DD" @change="handleDateChange" />
    <el-tag v-if="switchingBusinessDay" type="info" effect="plain">正在切换业务日</el-tag>
    <el-tag v-else-if="labStore.sheet?.readonly" type="warning" effect="plain">历史副表只读</el-tag>
    <el-tag v-else type="success" effect="plain">当前表可编辑</el-tag>
    <el-tag v-if="!isPageReadonly" :type="autoSaveTagType" effect="plain">{{ autoSaveText }}</el-tag>
    <el-button
      v-if="!isPageReadonly && (labStore.autoSaveStatus === 'error' || labStore.autoSaveStatus === 'conflict')"
      size="small"
      :type="labStore.autoSaveStatus === 'conflict' ? 'danger' : 'primary'"
      :loading="labStore.saving || labStore.autoSaving"
      @click="handleSaveRecovery"
    >
      {{ labStore.autoSaveStatus === 'conflict' ? '确认保存本机内容' : '重试保存' }}
    </el-button>
  </div>
  <div v-if="!isMobileLayout || !selectionMode" class="toolbar-right">
    <el-button :icon="CircleCheck" :loading="labStore.saving" :disabled="isPageReadonly" @click="openSampleCompletionDialog">
      标记样品完成
    </el-button>
    <el-button v-if="!canViewCompletedSensitiveData" @click="requestCompletedSampleDataAccess">查看加密数据</el-button>
    <el-button :icon="EditPen" :loading="labStore.saving" :disabled="isPageReadonly" @click="handleBulkFillSamples">
      {{ bulkFillButtonText }}
    </el-button>
    <el-button :icon="ChatLineSquare" :loading="labStore.saving" @click="handleGenerateSms">
      {{ smsButtonText }}
    </el-button>
    <el-button :icon="DocumentChecked" :loading="labStore.saving" @click="handleGenerateReport">
      {{ reportButtonText }}
    </el-button>
    <el-button v-if="selectionMode" @click="cancelReportSelection">取消选择</el-button>
  </div>
</div>
```

Add scoped styles so desktop `.toolbar-content` uses `display: contents`, while mobile expanded content is a compact grid. Make `.mobile-toolbar-summary` a borderless four-column grid with `min-height: 44px`, overflow-safe text, and a 44px toggle area. Change the mobile action grid from three columns to two and keep existing buttons at 44px. At `max-width: 374px`, let status text truncate rather than increasing toolbar height.

- [ ] **Step 4: Run focused tests and type checking to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run src/views/dashboard/LabDataPage.test.ts
./node_modules/.bin/vue-tsc --noEmit
git diff --check
```

Expected: all `LabDataPage` tests pass, type checking exits 0, and the diff check is clean.

- [ ] **Step 5: Verify the approved mobile and desktop layouts in the browser**

Use the local `/data` page and inspect these exact viewports:

- 375×812, 393×852, 430×932: initial toolbar is one compact row; expanding shows two-column controls; collapsing returns to one row.
- 844×390 coarse-pointer landscape: summary and expanded controls stay within the viewport without horizontal overflow.
- 1440×900 desktop: no summary/toggle is rendered and the existing full toolbar remains visible.
- In 393×852, start “批量填写样品” and confirm the toolbar auto-collapses while the bottom selection bar remains visible.

- [ ] **Step 6: Run complete regression and production build**

Run:

```bash
./node_modules/.bin/vitest run --reporter=json --outputFile=/private/tmp/mobile-lab-toolbar-vitest.json
jq '{numTotalTestSuites,numPassedTestSuites,numFailedTestSuites,numTotalTests,numPassedTests,numFailedTests,success}' /private/tmp/mobile-lab-toolbar-vitest.json
./node_modules/.bin/vue-tsc --noEmit
./node_modules/.bin/vite build
git diff --check
```

Expected: zero failed suites/tests, type checking and PWA production build exit 0, and no whitespace errors.

- [ ] **Step 7: Commit the tested implementation**

```bash
git add src/views/dashboard/LabDataPage.vue src/views/dashboard/LabDataPage.test.ts
git commit -m "feat: collapse mobile lab toolbar"
```

The commit must not include backend, admin, Store, API, database, generated `dist`, or deployment changes.
