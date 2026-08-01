<template>
  <div class="customer-editor">
    <el-select
      ref="customerSelectRef"
      :model-value="selectedNames"
      multiple
      filterable
      remote
      allow-create
      default-first-option
      collapse-tags
      collapse-tags-tooltip
      :max-collapse-tags="1"
      :disabled="disabled"
      :loading="searching"
      :placeholder="placeholder || customerRoleLabel"
      popper-class="customer-select-popper"
      :remote-method="querySearch"
      size="small"
      @update:model-value="handleSelectedNamesUpdate"
      @change="handleSelectionChange"
      @focus="isFocused = true"
      @blur="handleBlur"
      @keyup.enter="handleCommit"
    >
      <el-option
        v-for="customer in customerOptions"
        :key="customer.id"
        :label="formatCustomerDisplay(customer)"
        :value="customer.name"
      >
        <div class="customer-suggestion">
          <strong>{{ formatCustomerDisplay(customer) }}</strong>
          <el-tooltip content="删除客户" placement="top">
            <el-button
              class="customer-suggestion__delete"
              :disabled="disabled || deletingCustomerId === customer.id"
              :icon="Delete"
              text
              size="small"
              aria-label="删除客户"
              @click.stop.prevent="deleteSavedCustomer(customer)"
            />
          </el-tooltip>
        </div>
      </el-option>
    </el-select>

    <span v-if="showEmptyLabel" class="customer-empty-label">{{ customerRoleLabel }}</span>

    <div class="customer-actions">
      <el-tooltip content="新增客户" placement="top">
        <el-button :disabled="disabled" size="small" :icon="Plus" aria-label="新增客户" @click="showCreate = true" />
      </el-tooltip>
      <el-tooltip content="复制客户信息" placement="top">
        <el-button :disabled="!copyText" size="small" :icon="CopyDocument" aria-label="复制客户信息" @click="copyCustomerInfo" />
      </el-tooltip>
    </div>

    <el-dialog v-model="showCreate" title="新增客户信息" width="460px" append-to-body class="customer-create-dialog" @closed="resetCreateForm">
      <el-form :model="createForm" label-position="top" class="customer-create-form">
        <el-form-item label="客户名称">
          <el-input v-model.trim="createForm.name" placeholder="请输入客户名称" clearable />
        </el-form-item>
        <el-form-item label="电话号">
          <el-input v-model.trim="createForm.phone" placeholder="请输入电话号" clearable />
        </el-form-item>
        <el-form-item label="微信号">
          <el-input v-model.trim="createForm.wechat" placeholder="请输入微信号" clearable />
        </el-form-item>
        <el-form-item label="微信昵称">
          <el-input v-model.trim="createForm.wechatNickname" placeholder="请输入微信昵称" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="creating" @click="showCreate = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!canSaveCustomer" @click="createNewCustomer">保存客户</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { CopyDocument, Delete, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { checkBlacklist } from '@/api/blacklist'
import { createCustomer, deleteCustomer, searchCustomers } from '@/api/customer'
import type { BlacklistRecord } from '@/types/blacklist'
import type { Customer } from '@/types/customer'
import type { LabSampleInput } from '@/types/labSheet'
import { buildSampleCustomerPatch, type SampleCustomerRole } from '@/utils/sampleCustomers'

const props = withDefaults(defineProps<{
  modelValue?: string
  selectedCustomers?: Customer[]
  disabled?: boolean
  placeholder?: string
  customerRole?: SampleCustomerRole
  selectionLimit?: number
}>(), {
  customerRole: 'payer',
  selectionLimit: 0
})

const emit = defineEmits<{
  update: [patch: Partial<LabSampleInput>]
  blacklistHit: [records: BlacklistRecord[]]
}>()

const selectedNames = ref<string[]>(splitCustomerText(props.modelValue))
const customerOptions = ref<Customer[]>(props.selectedCustomers || [])
const customerSelectRef = ref<{ blur: () => void } | null>(null)
const searching = ref(false)
const isFocused = ref(false)
const showCreate = ref(false)
const creating = ref(false)
const deletingCustomerId = ref('')
const createForm = reactive({
  name: '',
  phone: '',
  wechat: '',
  wechatNickname: ''
})

watch(
  () => props.modelValue,
  (value) => {
    const nextNames = splitCustomerText(value)
    if (nextNames.join('|') === selectedNames.value.join('|')) return
    selectedNames.value = nextNames
  }
)

watch(
  () => props.selectedCustomers,
  (customers) => {
    mergeCustomerOptions(customers || [])
  },
  { immediate: true }
)

const selectedExistingCustomers = computed(() => selectedNames.value.map(findCustomerByName).filter(Boolean) as Customer[])
const customerRoleLabel = computed(() => props.customerRole === 'payer' ? '付款客户' : '数据发送')
const showEmptyLabel = computed(() => !selectedNames.value.length && !isFocused.value)
const canSaveCustomer = computed(() =>
  Boolean(createForm.name.trim() || createForm.phone.trim() || createForm.wechat.trim() || createForm.wechatNickname.trim())
)

const copyText = computed(() => {
  if (!selectedNames.value.length) return ''
  const lines = selectedNames.value.map((name) => {
    const customer = findCustomerByName(name)
    if (!customer) return name
    return formatCustomerDisplay(customer)
  })
  return lines.join('\n')
})

function splitCustomerText(value?: string) {
  return (value || '')
    .split(/[、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function mergeCustomerOptions(customers: Customer[]) {
  const byId = new Map(customerOptions.value.map((customer) => [customer.id, customer]))
  for (const customer of customers) {
    byId.set(customer.id, customer)
  }
  customerOptions.value = Array.from(byId.values())
}

function findCustomerByName(name: string) {
  return customerOptions.value.find((customer) => customer.name === name)
}

function formatCustomerDisplay(customer: Customer) {
  return [
    customer.name,
    customer.phone || '',
    customer.wechat || '',
    customer.wechatNickname || '',
    customer.note || ''
  ]
    .filter(Boolean)
    .join(' ')
}

function emitSelectedCustomers() {
  const customers = selectedExistingCustomers.value
  emit('update', buildSampleCustomerPatch(props.customerRole, selectedNames.value, customers))
}

function handleSelectedNamesUpdate(value: string[]) {
  const names = normalizeSelectedNames(value)
  selectedNames.value = names
  emitSelectedCustomers()
}

function normalizeSelectedNames(value: string[]) {
  const names = Array.from(new Set(value.map((name) => name.trim()).filter(Boolean)))
  if (props.selectionLimit <= 0 || names.length <= props.selectionLimit) return names
  return names.slice(-props.selectionLimit)
}

function handleSelectionChange() {
  if (!selectedNames.value.length) return
  closeCustomerDropdown()
}

function closeCustomerDropdown() {
  void nextTick(() => {
    window.setTimeout(() => {
      customerSelectRef.value?.blur()
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    }, 0)
  })
}

async function deleteSavedCustomer(customer: Customer) {
  if (props.disabled || deletingCustomerId.value) return
  try {
    await ElMessageBox.confirm(`确认删除客户 ${formatCustomerDisplay(customer)} 吗？`, '删除客户', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
      appendTo: document.body
    })
  } catch {
    return
  }
  deletingCustomerId.value = customer.id
  try {
    await deleteCustomer(customer.id)
    customerOptions.value = customerOptions.value.filter((item) => item.id !== customer.id)
    const wasSelected = selectedNames.value.includes(customer.name)
    if (wasSelected) {
      selectedNames.value = selectedNames.value.filter((name) => name !== customer.name)
      emitSelectedCustomers()
    }
    ElMessage.success('客户信息已删除')
  } catch {
    ElMessage.error('客户信息删除失败，请稍后重试')
  } finally {
    deletingCustomerId.value = ''
  }
}

async function querySearch(query: string) {
  searching.value = true
  try {
    const data = await searchCustomers(query)
    mergeCustomerOptions(data)
  } finally {
    searching.value = false
  }
}

async function handleCommit() {
  if (selectedNames.value.length) closeCustomerDropdown()
  await checkBlacklistAfterCommit(copyText.value || selectedNames.value.join(' '))
}

async function handleBlur() {
  isFocused.value = false
  await handleCommit()
}

async function checkBlacklistAfterCommit(keyword: string) {
  if (!keyword.trim()) return
  const result = await checkBlacklist(keyword)
  if (result.hit) emit('blacklistHit', result.records)
}

async function copyCustomerInfo() {
  const text = copyText.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('客户信息已复制')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

async function createNewCustomer() {
  if (creating.value) return
  const trimmedForm = {
    name: createForm.name.trim(),
    phone: createForm.phone.trim(),
    wechat: createForm.wechat.trim(),
    wechatNickname: createForm.wechatNickname.trim()
  }
  const displayName = trimmedForm.name || trimmedForm.phone || trimmedForm.wechat || trimmedForm.wechatNickname
  if (!displayName) {
    ElMessage.warning('请至少填写一项客户信息')
    return
  }
  creating.value = true
  try {
    const customer = await createCustomer({
      name: displayName,
      phone: trimmedForm.phone || undefined,
      wechat: trimmedForm.wechat || undefined,
      wechatNickname: trimmedForm.wechatNickname || undefined
    })
    mergeCustomerOptions([customer])
    selectedNames.value = props.customerRole === 'payer'
      ? [customer.name]
      : Array.from(new Set([...selectedNames.value, customer.name]))
    emitSelectedCustomers()
    ElMessage.success('客户信息已新增')
    showCreate.value = false
  } catch {
    ElMessage.error('客户信息保存失败，请检查后重试')
  } finally {
    creating.value = false
  }
}

function resetCreateForm() {
  if (creating.value) return
  Object.assign(createForm, { name: '', phone: '', wechat: '', wechatNickname: '' })
}
</script>

<style scoped lang="scss">
.customer-editor {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 2px;
  width: 100%;
  min-width: 0;
}

.customer-empty-label {
  position: absolute;
  z-index: 2;
  top: 50%;
  right: 56px;
  left: 7px;
  overflow: hidden;
  color: rgba(31, 41, 55, 0.3);
  font-size: 15px;
  line-height: 1;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
  transform: translateY(-50%);
}

.customer-actions {
  display: flex;
  gap: 2px;

  :deep(.el-button) {
    width: 24px;
    height: 24px;
    min-height: 24px;
    margin-left: 0;
    padding: 0;
  }
}

.customer-suggestion {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px;
  align-items: start;
  gap: 6px;
  padding: 5px 0;
  line-height: 1.35;

  strong {
    color: #10233f;
    font-size: 13px;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  &__delete {
    width: 24px;
    height: 24px;
    min-height: 24px;
    padding: 0;
    color: #94a3b8;

    &:hover {
      color: #dc2626;
      background: #fee2e2;
    }
  }
}

:global(.customer-select-popper .el-select-dropdown__list) {
  padding: 6px;
}

:global(.customer-select-popper .el-select-dropdown__item) {
  display: block;
  height: auto;
  min-height: 34px;
  padding: 5px 10px;
  line-height: 1.35;
  white-space: normal;
}

:global(.customer-select-popper .el-select-dropdown__item.is-hovering),
:global(.customer-select-popper .el-select-dropdown__item:hover) {
  background: #eef5ff;
}

:deep(.el-select) {
  width: 100%;
}

:deep(.el-select__wrapper) {
  align-items: center;
  min-height: 28px;
  max-height: 28px;
  padding: 2px 5px;
  overflow: hidden;
  box-shadow: none;
}

:deep(.el-select__selection) {
  align-items: center;
  flex-wrap: nowrap;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}

:deep(.el-select__selected-item) {
  max-width: 100%;
}

:deep(.el-select__selected-item .el-tag) {
  align-items: center;
  height: 22px;
  min-height: 22px;
  width: auto;
  max-width: 100%;
  color: #1f2937;
  font-size: 15px;
  white-space: nowrap;
}

:deep(.el-select__selected-item .el-tag__content) {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

:deep(.el-select__tags-text) {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 1.2;
  cursor: text;
  user-select: text;
}

:deep(.el-select__input-wrapper) {
  flex: 1 1 36px;
  min-width: 36px;
}

:deep(.el-select__placeholder),
:deep(.el-select__input::placeholder) {
  color: rgba(31, 41, 55, 0.3);
  font-size: 15px;
  -webkit-text-fill-color: rgba(31, 41, 55, 0.3);
}

:deep(.el-select__input) {
  color: #1f2937;
  font-size: 15px;
  -webkit-text-fill-color: #1f2937;
}

:global(.customer-create-dialog .el-form-item) {
  margin-bottom: 18px;
}

:global(.customer-create-dialog .el-form-item__label) {
  margin-bottom: 6px;
  color: #344054;
  font-weight: 600;
  line-height: 1.4;
}

:global(.customer-create-dialog .el-input__wrapper) {
  min-height: 38px;
  padding: 1px 11px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-shadow: none;
}

:global(.customer-create-dialog .el-input__wrapper.is-focus) {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

:global(.customer-create-dialog .el-input__inner) {
  color: #1f2937;
  text-align: left;
  -webkit-text-fill-color: #1f2937;
}

:global(.customer-create-dialog .el-input__inner::placeholder) {
  color: #94a3b8;
  -webkit-text-fill-color: #94a3b8;
}
</style>
