<template>
  <section class="mobile-sample-list" aria-label="手机样品录入列表">
    <article
      v-for="block in blocks"
      :key="block.id"
      class="mobile-sample-card"
      :class="{
        'mobile-sample-card--expanded': isBlockExpanded(block.id),
        'mobile-sample-card--highlight': highlightBlockId === block.id,
        'mobile-sample-card--completed': block.inputs.completed
      }"
      :data-block-id="block.id"
    >
      <header class="mobile-sample-card__header">
        <input
          v-if="selectionMode"
          type="checkbox"
          class="mobile-sample-card__checkbox"
          :data-selection-block="block.id"
          :checked="selectedBlockIds?.includes(block.id)"
          :aria-label="`选择样品 ${block.inputs.sequence || block.index}`"
          @click.stop
          @change="emitSelection(block.id, $event)"
        />
        <button
          class="mobile-sample-card__toggle"
          type="button"
          :aria-expanded="isBlockExpanded(block.id)"
          @click="toggleBlock(block.id)"
        >
          <span class="mobile-sample-card__sequence">{{ block.inputs.sequence || String(block.index).padStart(3, '0') }}</span>
          <span class="mobile-sample-card__summary">
            <strong>{{ block.inputs.sampleNumber || '未填写样品名称' }}</strong>
            <small>{{ block.inputs.customerText || '未选择付款客户' }}</small>
            <small class="mobile-sample-card__elements">化验元素：{{ block.inputs.elementNote || '未选择' }}</small>
          </span>
          <span class="mobile-sample-card__badges">
            <i v-if="block.inputs.completed">已完成</i>
            <i v-if="block.inputs.paymentStatus">{{ block.inputs.paymentStatus }}</i>
          </span>
          <span class="mobile-sample-card__chevron" aria-hidden="true">{{ isBlockExpanded(block.id) ? '⌃' : '⌄' }}</span>
        </button>
      </header>

      <div v-if="isBlockExpanded(block.id)" class="mobile-sample-card__body">
        <section
          class="mobile-form-section mobile-form-section--identity mobile-collapsible-section"
          :class="{ 'mobile-collapsible-section--expanded': isGroupExpanded(block.id, 'identity') }"
          data-mobile-group="identity"
        >
          <button
            class="mobile-group-toggle"
            type="button"
            :aria-expanded="isGroupExpanded(block.id, 'identity')"
            @click="toggleGroup(block.id, 'identity')"
          >
            <strong>样品信息</strong>
            <small>{{ isGroupExpanded(block.id, 'identity') ? '收起' : '展开' }}</small>
            <span aria-hidden="true">{{ isGroupExpanded(block.id, 'identity') ? '⌃' : '⌄' }}</span>
          </button>
          <div
            v-if="isGroupExpanded(block.id, 'identity')"
            class="mobile-collapsible-section__content mobile-collapsible-section__content--identity"
          >
            <div class="mobile-identity-tabs" role="tablist" aria-label="样品信息分类">
              <button
                v-for="tab in identityTabs"
                :id="identityTabId(block.id, tab.key)"
                :key="tab.key"
                class="mobile-identity-tab"
                :class="{ 'mobile-identity-tab--active': activeIdentityTab(block.id) === tab.key }"
                type="button"
                role="tab"
                :aria-controls="identityPanelId(block.id, tab.key)"
                :aria-selected="activeIdentityTab(block.id) === tab.key"
                @click="selectIdentityTab(block.id, tab.key)"
              >
                {{ tab.label }}
              </button>
            </div>

            <div
              v-if="activeIdentityTab(block.id) === 'basic'"
              :id="identityPanelId(block.id, 'basic')"
              class="mobile-identity-panel"
              role="tabpanel"
              :aria-labelledby="identityTabId(block.id, 'basic')"
              data-mobile-identity-panel="basic"
            >
              <div class="mobile-field-grid mobile-field-grid--identity">
                <label class="mobile-field">
                  <span>编号</span>
                  <input
                    data-mobile-field="sequence"
                    :value="block.inputs.sequence || ''"
                    :disabled="isDisabled(block)"
                    enterkeyhint="next"
                    @focus="rememberField(block, 'sequence')"
                    @input="updateText(block, 'sequence', $event)"
                    @blur="commitText(block, 'sequence', $event)"
                    @keydown.enter.prevent="focusNextField"
                  />
                </label>
                <label class="mobile-field">
                  <span>样品名称</span>
                  <input
                    data-mobile-field="sampleNumber"
                    :value="block.inputs.sampleNumber || ''"
                    :disabled="isDisabled(block)"
                    enterkeyhint="next"
                    placeholder="输入样品名称"
                    @focus="rememberField(block, 'sampleNumber')"
                    @input="updateText(block, 'sampleNumber', $event)"
                    @blur="commitText(block, 'sampleNumber', $event)"
                    @keydown.enter.prevent="focusNextField"
                  />
                </label>
                <div
                  class="mobile-field mobile-field--wide"
                  :class="{ 'mobile-field--required': isSampleElementNoteRequired(block) }"
                  data-mobile-field="elementNote"
                >
                  <span>化验元素</span>
                  <LabElementSelector
                    :model-value="block.inputs.elementNote"
                    :disabled="isDisabled(block)"
                    @update:model-value="(value) => updateElementNote(block, value)"
                  />
                </div>
                <label class="mobile-field mobile-field--wide">
                  <span>备注</span>
                  <textarea
                    data-mobile-field="note"
                    rows="1"
                    :value="block.inputs.note || ''"
                    :disabled="isDisabled(block)"
                    enterkeyhint="done"
                    placeholder="输入备注"
                    @focus="rememberField(block, 'note')"
                    @input="updateText(block, 'note', $event)"
                    @blur="commitText(block, 'note', $event)"
                  />
                </label>
              </div>
            </div>

            <div
              v-else-if="activeIdentityTab(block.id) === 'customers'"
              :id="identityPanelId(block.id, 'customers')"
              class="mobile-identity-panel"
              role="tabpanel"
              :aria-labelledby="identityTabId(block.id, 'customers')"
              data-mobile-identity-panel="customers"
            >
              <div class="mobile-field-grid mobile-field-grid--customers">
                <div class="mobile-field mobile-field--wide" data-mobile-field="customerText">
                  <span>付款客户</span>
                  <CustomerCellEditor
                    class="mobile-customer-editor"
                    customer-role="payer"
                    :selection-limit="1"
                    :model-value="block.inputs.customerText"
                    :selected-customers="block.inputs.customers"
                    :disabled="isDisabled(block)"
                    placeholder="选择付款客户"
                    @update="(patch) => handleCustomerUpdate(block, patch, 'customerText')"
                    @blacklist-hit="(records) => emit('blacklistHit', records)"
                  />
                </div>
                <div class="mobile-field mobile-field--wide" data-mobile-field="recipientCustomerText">
                  <span>数据接收客户</span>
                  <CustomerCellEditor
                    class="mobile-customer-editor"
                    customer-role="recipient"
                    :selection-limit="0"
                    :model-value="block.inputs.recipientCustomerText"
                    :selected-customers="block.inputs.recipientCustomers"
                    :disabled="isDisabled(block)"
                    placeholder="选择数据接收客户"
                    @update="(patch) => handleCustomerUpdate(block, patch, 'recipientCustomerText')"
                    @blacklist-hit="(records) => emit('blacklistHit', records)"
                  />
                </div>
              </div>
            </div>

            <div
              v-else
              :id="identityPanelId(block.id, 'settlement')"
              class="mobile-identity-panel"
              role="tabpanel"
              :aria-labelledby="identityTabId(block.id, 'settlement')"
              data-mobile-identity-panel="settlement"
            >
              <div class="mobile-field-grid mobile-field-grid--settlement">
                <template v-if="isSensitiveHidden(block)">
                  <div class="mobile-field mobile-field--locked"><span>{{ getSampleAmountLabel(block) }}</span><b>🔒 已隐藏</b></div>
                  <div class="mobile-field mobile-field--locked"><span>结款状态</span><b>🔒 已隐藏</b></div>
                </template>
                <template v-else>
                  <label class="mobile-field" :class="{ 'mobile-field--required': isSampleAmountRequired(block) }">
                    <span>{{ getSampleAmountLabel(block) }}</span>
                    <input
                      data-mobile-field="price"
                      type="text"
                      inputmode="decimal"
                      :value="formatNumberInput(block, 'price', getSampleAmountPrecision(block))"
                      :disabled="isDisabled(block)"
                      enterkeyhint="next"
                      placeholder="请输入金额"
                      @focus="rememberNumberField(block, 'price', $event)"
                      @input="updateNumber(block, 'price', $event)"
                      @blur="commitNumber(block, 'price', $event)"
                      @keydown.enter.prevent="focusNextField"
                    />
                  </label>
                  <label class="mobile-field" :class="{ 'mobile-field--required': isSamplePaymentStatusRequired(block) }">
                    <span>结款状态</span>
                    <select
                      data-mobile-field="paymentStatus"
                      :value="block.inputs.paymentStatus || ''"
                      :disabled="isDisabled(block)"
                      @change="updatePaymentStatus(block, $event)"
                    >
                      <option value="">请选择</option>
                      <option v-for="status in samplePaymentStatusOptions" :key="status" :value="status">{{ status }}</option>
                    </select>
                  </label>
                </template>
              </div>
              <p v-if="!isSensitiveHidden(block)" class="mobile-settlement-helper">金额和结款状态将随当前样品自动保存</p>
            </div>
          </div>
        </section>

        <div v-if="isSensitiveHidden(block)" class="mobile-sensitive-lock">
          <span aria-hidden="true">🔒</span>
          <div>
            <strong>已完成样品数据已加密</strong>
            <small>请使用现有访问密码验证后查看检测数据、金额和结款状态。</small>
          </div>
        </div>

        <template v-else>
          <div v-if="isSampleCalculationBlocked(block)" class="mobile-prerequisite-warning">
            {{ getSampleCalculationBlockMessage(block) }}后录入检测数据
          </div>

          <section
            class="mobile-form-section mobile-collapsible-section mobile-calculation-group"
            :class="{
              'mobile-collapsible-section--expanded': isGroupExpanded(block.id, 'calculation'),
              'mobile-calculation-group--expanded': isGroupExpanded(block.id, 'calculation')
            }"
            data-mobile-group="calculation"
          >
            <button
              class="mobile-group-toggle"
              type="button"
              :aria-expanded="isGroupExpanded(block.id, 'calculation')"
              @click="toggleGroup(block.id, 'calculation')"
            >
              <strong>检测数据</strong>
              <small>{{ isGroupExpanded(block.id, 'calculation') ? '收起' : '展开' }}</small>
              <span aria-hidden="true">{{ isGroupExpanded(block.id, 'calculation') ? '⌃' : '⌄' }}</span>
            </button>
            <div
              v-if="isGroupExpanded(block.id, 'calculation')"
              class="mobile-collapsible-section__content mobile-collapsible-section__content--calculation"
            >
              <div class="mobile-calculation-tabs" role="tablist" aria-label="检测数据分类">
                <button
                  v-for="group in mobileFieldGroups"
                  :id="calculationTabId(block.id, group.key)"
                  :key="group.key"
                  class="mobile-calculation-tab"
                  :class="{ 'mobile-calculation-tab--active': activeCalculationTab(block.id) === group.key }"
                  type="button"
                  role="tab"
                  :aria-controls="calculationPanelId(block.id, group.key)"
                  :aria-selected="activeCalculationTab(block.id) === group.key"
                  @click="selectCalculationTab(block.id, group.key)"
                >
                  {{ group.label }}
                </button>
              </div>

              <template v-for="group in mobileFieldGroups" :key="group.key">
                <div
                  v-if="activeCalculationTab(block.id) === group.key"
                  :id="calculationPanelId(block.id, group.key)"
                  class="mobile-calculation-panel"
                  role="tabpanel"
                  :aria-labelledby="calculationTabId(block.id, group.key)"
                  :data-mobile-calculation-panel="group.key"
                  :data-mobile-group="group.key"
                >
                  <div class="mobile-field-grid">
                    <label v-for="field in group.fields" :key="field.key" class="mobile-field">
                      <span>{{ field.label }}</span>
                      <input
                        :data-mobile-field="field.key"
                        type="text"
                        inputmode="decimal"
                        :value="formatNumberInput(block, field.key)"
                        :disabled="isDisabled(block) || isSampleCalculationBlocked(block)"
                        enterkeyhint="next"
                        @focus="rememberNumberField(block, field.key, $event)"
                        @input="updateNumber(block, field.key, $event)"
                        @blur="commitNumber(block, field.key, $event)"
                        @keydown.enter.prevent="focusNextField"
                      />
                    </label>
                  </div>
                  <div class="mobile-result-grid">
                    <div v-for="result in group.results" :key="result.label" class="mobile-result">
                      <span>{{ result.label }}</span>
                      <strong>{{ formatResult(getResultValue(block, result)) }}</strong>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </section>
        </template>

        <MobileSampleRetests
          :parent="block"
          :readonly="readonly"
          :sensitive-hidden="isSensitiveHidden(block)"
          :highlight-retest-id="retestHighlightForBlock(block.id)"
          :pending-retest-action-ids="pendingRetestActionIds"
          @update="(retestId, patch) => emit('retestUpdate', block.id, retestId, patch)"
          @field-commit="(retestId, field, oldValue, newValue) => emit('retestFieldCommit', block.id, retestId, field, oldValue, newValue)"
          @delete="(retestId) => emit('retestDelete', block.id, retestId)"
          @void="(retestId) => emit('retestVoid', block.id, retestId)"
          @highlight-consumed="handleRetestHighlightConsumed"
        />

        <button class="mobile-save-next" type="button" @click="saveAndOpenNext(block)">
          {{ isDisabled(block) ? '查看下一项' : '保存并录入下一项' }}
        </button>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import CustomerCellEditor from './CustomerCellEditor.vue'
import LabElementSelector from './LabElementSelector.vue'
import MobileSampleRetests from './MobileSampleRetests.vue'
import type { BlacklistRecord } from '@/types/blacklist'
import type {
  LabFormulaResult,
  LabSampleInput,
  SampleBlock,
  SamplePaymentStatus,
  SampleRetestInput,
  SampleRetestInputField
} from '@/types/labSheet'
import { formatFormulaValue, parseNumericInput } from '@/utils/formulaEngine'
import {
  mobileCalculationGroups as mobileFieldGroups,
  type MobileCalculationResultField as MobileResultField,
  type MobileCalculationTabKey as CalculationTabKey
} from '@/utils/mobileLabCalculation'
import {
  getSampleAmountLabel,
  getSampleAmountPrecision,
  getSampleCalculationBlockMessage,
  isCompletedSampleSensitiveHidden,
  isSampleAmountRequired,
  isSampleCalculationBlocked,
  isSampleElementNoteRequired,
  isSamplePaymentStatusRequired,
  samplePaymentStatusOptions
} from '@/utils/labSampleRules'

type IdentityTabKey = 'basic' | 'customers' | 'settlement'

const identityTabs: Array<{ key: IdentityTabKey; label: string }> = [
  { key: 'basic', label: '基础' },
  { key: 'customers', label: '客户' },
  { key: 'settlement', label: '结算' }
]

const props = defineProps<{
  blocks: SampleBlock[]
  readonly?: boolean
  selectionMode?: boolean
  selectedBlockIds?: string[]
  highlightBlockId?: string
  highlightRetestId?: string
  pendingRetestActionIds?: string[]
  canViewCompletedSensitiveData?: boolean
}>()

const emit = defineEmits<{
  update: [blockId: string, patch: Partial<LabSampleInput>]
  fieldCommit: [blockId: string, field: keyof LabSampleInput, oldValue: unknown, newValue: unknown]
  blacklistHit: [records: BlacklistRecord[]]
  selectionChange: [blockId: string, checked: boolean]
  saveNext: [blockId: string]
  retestUpdate: [sampleBlockId: string, retestId: string, patch: Partial<SampleRetestInput>]
  retestFieldCommit: [sampleBlockId: string, retestId: string, field: SampleRetestInputField, oldValue: unknown, newValue: unknown]
  retestDelete: [sampleBlockId: string, retestId: string]
  retestVoid: [sampleBlockId: string, retestId: string]
}>()

const initiallyExpandedBlockId = props.highlightBlockId || findRetestParentId(props.highlightRetestId) || props.blocks[0]?.id || ''
const expandedBlockIds = ref(new Set(initiallyExpandedBlockId ? [initiallyExpandedBlockId] : []))
const expandedGroupKeysByBlock = ref(new Map<string, Set<string>>())
const identityTabByBlock = ref(new Map<string, IdentityTabKey>())
const calculationTabByBlock = ref(new Map<string, CalculationTabKey>())
const focusedFieldValues = new Map<string, unknown>()
const numericInputDrafts = ref(new Map<string, string>())
const effectiveRetestHighlightId = ref('')
let consumedRetestHighlightId = ''

watch(
  () => props.highlightBlockId,
  (blockId) => {
    if (!blockId || !props.blocks.some((block) => block.id === blockId)) return
    expandBlock(blockId)
  }
)

watch(
  [
    () => props.highlightRetestId || '',
    () => props.blocks.flatMap((block) => block.retests.map((retest) => `${block.id}:${retest.id}`)).join('|')
  ],
  ([retestId], [previousRetestId]) => {
    if (retestId !== previousRetestId) {
      consumedRetestHighlightId = ''
      effectiveRetestHighlightId.value = ''
    }
    if (!retestId) {
      effectiveRetestHighlightId.value = ''
      return
    }
    if (consumedRetestHighlightId === retestId) return
    const blockId = findRetestParentId(retestId)
    if (!blockId) {
      effectiveRetestHighlightId.value = ''
      return
    }
    expandBlock(blockId, false)
    effectiveRetestHighlightId.value = retestId
  },
  { immediate: true }
)

watch(
  () => props.blocks.map((block) => block.id),
  (blockIds) => {
    const allowedIds = new Set(blockIds)
    const nextExpandedIds = new Set([...expandedBlockIds.value].filter((blockId) => allowedIds.has(blockId)))
    if (nextExpandedIds.size !== expandedBlockIds.value.size) expandedBlockIds.value = nextExpandedIds
    const nextExpandedGroups = new Map([...expandedGroupKeysByBlock.value].filter(([blockId]) => allowedIds.has(blockId)))
    if (nextExpandedGroups.size !== expandedGroupKeysByBlock.value.size) expandedGroupKeysByBlock.value = nextExpandedGroups
    const nextIdentityTabs = new Map([...identityTabByBlock.value].filter(([blockId]) => allowedIds.has(blockId)))
    if (nextIdentityTabs.size !== identityTabByBlock.value.size) identityTabByBlock.value = nextIdentityTabs
    const nextCalculationTabs = new Map([...calculationTabByBlock.value].filter(([blockId]) => allowedIds.has(blockId)))
    if (nextCalculationTabs.size !== calculationTabByBlock.value.size) calculationTabByBlock.value = nextCalculationTabs
  }
)

function isBlockExpanded(blockId: string) {
  return expandedBlockIds.value.has(blockId)
}

function toggleBlock(blockId: string) {
  const nextExpandedIds = new Set(expandedBlockIds.value)
  if (nextExpandedIds.has(blockId)) {
    nextExpandedIds.delete(blockId)
    expandedBlockIds.value = nextExpandedIds
    return
  }
  resetGroups(blockId)
  nextExpandedIds.add(blockId)
  expandedBlockIds.value = nextExpandedIds
  void scrollToBlock(blockId)
}

function expandBlock(blockId: string, shouldScroll = true) {
  if (!expandedBlockIds.value.has(blockId)) {
    resetGroups(blockId)
    expandedBlockIds.value = new Set([...expandedBlockIds.value, blockId])
  }
  if (shouldScroll) void scrollToBlock(blockId)
}

function findRetestParentId(retestId?: string) {
  if (!retestId) return ''
  return props.blocks.find((block) => block.retests.some((retest) => retest.id === retestId))?.id || ''
}

function retestHighlightForBlock(blockId: string) {
  const retestId = effectiveRetestHighlightId.value
  return findRetestParentId(retestId) === blockId ? retestId : ''
}

function handleRetestHighlightConsumed(retestId: string) {
  if (props.highlightRetestId !== retestId || effectiveRetestHighlightId.value !== retestId) return
  consumedRetestHighlightId = retestId
  effectiveRetestHighlightId.value = ''
}

function isGroupExpanded(blockId: string, groupKey: string) {
  return expandedGroupKeysByBlock.value.get(blockId)?.has(groupKey) ?? false
}

function toggleGroup(blockId: string, groupKey: string) {
  const nextExpandedGroups = new Map(expandedGroupKeysByBlock.value)
  const blockGroupKeys = new Set(nextExpandedGroups.get(blockId) || [])
  if (blockGroupKeys.has(groupKey)) blockGroupKeys.delete(groupKey)
  else blockGroupKeys.add(groupKey)
  if (blockGroupKeys.size) nextExpandedGroups.set(blockId, blockGroupKeys)
  else nextExpandedGroups.delete(blockId)
  expandedGroupKeysByBlock.value = nextExpandedGroups
}

function activeIdentityTab(blockId: string): IdentityTabKey {
  return identityTabByBlock.value.get(blockId) || 'basic'
}

function selectIdentityTab(blockId: string, tab: IdentityTabKey) {
  if (activeIdentityTab(blockId) === tab) return
  const nextIdentityTabs = new Map(identityTabByBlock.value)
  if (tab === 'basic') nextIdentityTabs.delete(blockId)
  else nextIdentityTabs.set(blockId, tab)
  identityTabByBlock.value = nextIdentityTabs
}

function identityTabId(blockId: string, tab: IdentityTabKey) {
  return `mobile-identity-tab-${blockId}-${tab}`
}

function identityPanelId(blockId: string, tab: IdentityTabKey) {
  return `mobile-identity-panel-${blockId}-${tab}`
}

function activeCalculationTab(blockId: string): CalculationTabKey {
  return calculationTabByBlock.value.get(blockId) || 'metal'
}

function selectCalculationTab(blockId: string, tab: CalculationTabKey) {
  if (activeCalculationTab(blockId) === tab) return
  const nextCalculationTabs = new Map(calculationTabByBlock.value)
  if (tab === 'metal') nextCalculationTabs.delete(blockId)
  else nextCalculationTabs.set(blockId, tab)
  calculationTabByBlock.value = nextCalculationTabs
}

function calculationTabId(blockId: string, tab: CalculationTabKey) {
  return `mobile-calculation-tab-${blockId}-${tab}`
}

function calculationPanelId(blockId: string, tab: CalculationTabKey) {
  return `mobile-calculation-panel-${blockId}-${tab}`
}

function resetGroups(blockId: string) {
  if (expandedGroupKeysByBlock.value.has(blockId)) {
    const nextExpandedGroups = new Map(expandedGroupKeysByBlock.value)
    nextExpandedGroups.delete(blockId)
    expandedGroupKeysByBlock.value = nextExpandedGroups
  }
  if (identityTabByBlock.value.has(blockId)) {
    const nextIdentityTabs = new Map(identityTabByBlock.value)
    nextIdentityTabs.delete(blockId)
    identityTabByBlock.value = nextIdentityTabs
  }
  if (calculationTabByBlock.value.has(blockId)) {
    const nextCalculationTabs = new Map(calculationTabByBlock.value)
    nextCalculationTabs.delete(blockId)
    calculationTabByBlock.value = nextCalculationTabs
  }
}

function isDisabled(block: SampleBlock) {
  return Boolean(props.readonly || block.readonly)
}

function isSensitiveHidden(block: SampleBlock) {
  return isCompletedSampleSensitiveHidden(block, Boolean(props.canViewCompletedSensitiveData))
}

function updateNumber(block: SampleBlock, field: keyof LabSampleInput, event: Event) {
  const rawValue = (event.target as HTMLInputElement).value
  numericInputDrafts.value.set(fieldKey(block.id, field), rawValue)
  const value = parseNumericInput(rawValue)
  emit('update', block.id, { [field]: value } as Partial<LabSampleInput>)
}

function updateText(block: SampleBlock, field: keyof LabSampleInput, event: Event) {
  emit('update', block.id, { [field]: (event.target as HTMLInputElement).value } as Partial<LabSampleInput>)
}

function rememberField(block: SampleBlock, field: keyof LabSampleInput) {
  focusedFieldValues.set(fieldKey(block.id, field), block.inputs[field] ?? null)
}

function rememberNumberField(block: SampleBlock, field: keyof LabSampleInput, event: Event) {
  rememberField(block, field)
  numericInputDrafts.value.set(fieldKey(block.id, field), (event.target as HTMLInputElement).value)
}

function commitNumber(block: SampleBlock, field: keyof LabSampleInput, event: Event) {
  const rawValue = (event.target as HTMLInputElement).value
  numericInputDrafts.value.delete(fieldKey(block.id, field))
  commitField(block, field, parseNumericInput(rawValue))
}

function commitText(block: SampleBlock, field: keyof LabSampleInput, event: Event) {
  commitField(block, field, (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}

function commitField(block: SampleBlock, field: keyof LabSampleInput, newValue: unknown) {
  const key = fieldKey(block.id, field)
  const oldValue = focusedFieldValues.has(key) ? focusedFieldValues.get(key) : block.inputs[field] ?? null
  focusedFieldValues.delete(key)
  if (JSON.stringify(oldValue ?? null) !== JSON.stringify(newValue ?? null)) {
    emit('fieldCommit', block.id, field, oldValue ?? null, newValue ?? null)
  }
}

function updatePaymentStatus(block: SampleBlock, event: Event) {
  const value = (event.target as HTMLSelectElement).value as SamplePaymentStatus | ''
  emit('update', block.id, { paymentStatus: value })
  commitField(block, 'paymentStatus', value)
}

function updateElementNote(block: SampleBlock, value: string) {
  emit('update', block.id, { elementNote: value })
  commitField(block, 'elementNote', value)
}

function handleCustomerUpdate(block: SampleBlock, patch: Partial<LabSampleInput>, field: 'customerText' | 'recipientCustomerText') {
  emit('update', block.id, patch)
  if (Object.prototype.hasOwnProperty.call(patch, field)) commitField(block, field, patch[field] ?? null)
}

function emitSelection(blockId: string, event: Event) {
  emit('selectionChange', blockId, (event.target as HTMLInputElement).checked)
}

function saveAndOpenNext(block: SampleBlock) {
  if (!isDisabled(block)) emit('saveNext', block.id)
  const index = props.blocks.findIndex((item) => item.id === block.id)
  const nextBlock = props.blocks[index + 1]
  if (!nextBlock) return
  const nextExpandedIds = new Set(expandedBlockIds.value)
  nextExpandedIds.delete(block.id)
  resetGroups(nextBlock.id)
  nextExpandedIds.add(nextBlock.id)
  expandedBlockIds.value = nextExpandedIds
  void scrollToBlock(nextBlock.id)
}

function focusNextField(event: KeyboardEvent) {
  const current = event.currentTarget as HTMLElement | null
  const card = current?.closest('.mobile-sample-card')
  if (!current || !card) return
  const fields = Array.from(card.querySelectorAll<HTMLElement>('[data-mobile-field]:not([disabled])')).filter((element) => {
    if (element.matches('input, select, textarea, button')) return true
    return Boolean(element.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'))
  })
  const currentContainer = current.closest<HTMLElement>('[data-mobile-field]') || current
  const currentIndex = fields.indexOf(currentContainer)
  const next = fields[currentIndex + 1]
  const focusTarget = next?.matches('input, select, textarea, button')
    ? next
    : next?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')
  current.blur()
  focusTarget?.focus()
}

function getResultValue(block: SampleBlock, result: MobileResultField) {
  return result.source === 'result'
    ? block.results[result.key as keyof LabFormulaResult]
    : block.inputs[result.key as keyof LabSampleInput]
}

function formatInput(value: unknown, precision?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return precision === undefined ? String(value) : value.toFixed(precision)
}

function formatNumberInput(block: SampleBlock, field: keyof LabSampleInput, precision?: number) {
  const draft = numericInputDrafts.value.get(fieldKey(block.id, field))
  return draft === undefined ? formatInput(block.inputs[field], precision) : draft
}

function formatResult(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? formatFormulaValue(value) : '—'
}

function fieldKey(blockId: string, field: keyof LabSampleInput) {
  return `${blockId}__${String(field)}`
}

async function scrollToBlock(blockId: string) {
  await nextTick()
  const element = document.querySelector(`[data-block-id="${blockId}"]`)
  if (element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

</script>

<style scoped lang="scss">
.mobile-sample-list {
  display: grid;
  gap: 10px;
}

.mobile-sample-card {
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #dce5ef;
  border-radius: 13px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
}

.mobile-sample-card--expanded {
  border-color: #aac3dc;
  box-shadow: 0 8px 24px rgba(15, 35, 63, 0.1);
}

.mobile-sample-card--highlight {
  outline: 3px solid rgba(207, 63, 44, 0.18);
}

.mobile-sample-card__header {
  display: flex;
  align-items: stretch;
  min-height: 74px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.mobile-sample-card__checkbox {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  align-self: center;
  margin: 0 0 0 12px;
  accent-color: #b32c20;
}

.mobile-sample-card__toggle {
  display: grid;
  flex: 1;
  grid-template-columns: auto minmax(0, 1fr) auto 20px;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 74px;
  padding: 8px 12px;
  color: #1f2937;
  background: transparent;
  border: 0;
  text-align: left;
}

.mobile-sample-card__sequence {
  display: grid;
  min-width: 42px;
  height: 34px;
  place-items: center;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  background: #193958;
  border-radius: 9px;
}

.mobile-sample-card__summary {
  display: grid;
  gap: 1px;
  min-width: 0;

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 15px;
  }

  small {
    color: #64748b;
    font-size: 12px;
  }
}

.mobile-sample-card__summary .mobile-sample-card__elements {
  color: #3f6f99;
  font-weight: 500;
}

.mobile-sample-card__badges {
  display: grid;
  justify-items: end;
  gap: 3px;

  i {
    padding: 2px 6px;
    color: #47627c;
    background: #edf4fa;
    border-radius: 999px;
    font-size: 10px;
    font-style: normal;
    white-space: nowrap;
  }
}

.mobile-sample-card--completed .mobile-sample-card__sequence {
  background: #47705d;
}

.mobile-sample-card__chevron {
  color: #64748b;
}

.mobile-sample-card__body {
  display: grid;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid #e2e8f0;
}

.mobile-form-section {
  display: grid;
  gap: 8px;
  padding: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 11px;

  h3 {
    margin: 0;
    color: #183657;
    font-size: 15px;
  }
}

.mobile-form-section--identity {
  background: #ffffff;
}

.mobile-collapsible-section {
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.mobile-collapsible-section--expanded {
  background: #f6f9fc;
  border-color: #cbd9e7;
}

.mobile-form-section--identity.mobile-collapsible-section--expanded {
  background: #ffffff;
}

.mobile-group-toggle {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  padding: 8px 10px;
  color: #183657;
  background: transparent;
  border: 0;
  text-align: left;

  strong {
    font-size: 15px;
  }

  small {
    color: #6b7f93;
    font-size: 12px;
  }

  span {
    color: #6b7f93;
    text-align: center;
  }

  &:focus-visible {
    outline: 3px solid rgba(63, 111, 153, 0.2);
    outline-offset: -3px;
  }
}

.mobile-collapsible-section__content {
  display: grid;
  gap: 8px;
  padding: 0 10px 10px;
  border-top: 1px solid #e5ebf1;

  > .mobile-field-grid {
    padding-top: 8px;
  }
}

.mobile-collapsible-section__content--identity {
  gap: 0;
  padding: 0;
}

.mobile-collapsible-section__content--calculation {
  gap: 0;
  padding: 0;
}

.mobile-identity-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 0 10px;
}

.mobile-identity-tab {
  position: relative;
  min-width: 0;
  min-height: 44px;
  padding: 8px 6px;
  color: #334155;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  font-size: 14px;
  font-weight: 600;

  &:focus-visible {
    z-index: 1;
    outline: 3px solid rgba(63, 111, 153, 0.2);
    outline-offset: -3px;
  }
}

.mobile-identity-tab--active {
  color: #2563eb;
  border-bottom-color: #2563eb;
}

.mobile-calculation-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  padding: 0 4px;
}

.mobile-calculation-tab {
  position: relative;
  min-width: 0;
  min-height: 44px;
  padding: 8px 2px;
  overflow: hidden;
  color: #334155;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;

  &:focus-visible {
    z-index: 1;
    outline: 3px solid rgba(63, 111, 153, 0.2);
    outline-offset: -3px;
  }
}

.mobile-calculation-tab--active {
  color: #2563eb;
  border-bottom-color: #2563eb;
}

.mobile-identity-panel {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid #e5ebf1;
}

.mobile-calculation-panel {
  display: grid;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid #e5ebf1;
}

.mobile-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.mobile-field-grid--identity {
  grid-template-columns: minmax(90px, 0.7fr) minmax(0, 1.3fr);
}

.mobile-field-grid--customers {
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.mobile-field-grid--settlement {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mobile-settlement-helper {
  margin: 0;
  color: #8293a6;
  font-size: 11px;
  line-height: 1.4;
}

.mobile-field {
  display: grid;
  align-content: start;
  gap: 3px;
  min-width: 0;

  > span {
    color: #64748b;
    font-size: 12px;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 9px 10px;
    color: #172033;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    font-size: 16px;
    outline: none;

    &:focus {
      border-color: #3f6f99;
      box-shadow: 0 0 0 3px rgba(63, 111, 153, 0.12);
    }

    &:disabled {
      color: #64748b;
      background: #eef2f6;
      opacity: 1;
      -webkit-text-fill-color: #64748b;
    }
  }

  textarea {
    resize: vertical;
  }
}

.mobile-field--wide {
  grid-column: 1 / -1;
}

.mobile-field--required > span::after {
  margin-left: 3px;
  color: #c92d20;
  content: '*';
}

.mobile-field--locked b {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 9px 10px;
  color: #7c2d12;
  background: #fff7ed;
  border: 1px dashed #fdba74;
  border-radius: 9px;
  font-size: 13px;
}

.mobile-result-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.mobile-result {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 8px;
  background: #edf5fb;
  border-radius: 8px;

  span {
    overflow: hidden;
    color: #64748b;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #b1261c;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
}

.mobile-sensitive-lock,
.mobile-prerequisite-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
}

.mobile-sensitive-lock {
  color: #7c2d12;
  background: #fff7ed;
  border: 1px solid #fed7aa;

  div {
    display: grid;
    gap: 3px;
  }

  small {
    line-height: 1.45;
  }
}

.mobile-prerequisite-warning {
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  font-size: 13px;
  line-height: 1.5;
}

.mobile-save-next {
  width: 100%;
  min-height: 48px;
  color: #ffffff;
  background: linear-gradient(135deg, #b93125, #922319);
  border: 0;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
}

:deep(.customer-editor),
:deep(.lab-element-selector) {
  min-height: 44px;
}

:deep(.customer-editor .el-select),
:deep(.lab-element-selector__trigger) {
  min-height: 44px;
}

:deep(.mobile-customer-editor .customer-actions .el-button) {
  width: 44px;
  height: 44px;
  min-height: 44px;
}

:deep(.mobile-customer-editor .customer-empty-label) {
  right: 96px;
}

@media (max-width: 374px) {
  .mobile-result-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 340px) {
  .mobile-field-grid--settlement {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (orientation: landscape) and (max-height: 520px) {
  .mobile-field-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .mobile-field--wide {
    grid-column: span 2;
  }

  .mobile-field-grid--customers {
    grid-template-columns: minmax(0, 1fr);
  }

  .mobile-field-grid--settlement {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
