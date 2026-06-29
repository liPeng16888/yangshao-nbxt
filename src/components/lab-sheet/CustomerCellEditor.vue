<template>
  <div class="customer-editor">
    <el-select
      v-model="selectedNames"
      multiple
      filterable
      remote
      allow-create
      default-first-option
      :disabled="disabled"
      :loading="searching"
      :placeholder="placeholder || '输入或搜索客户'"
      :remote-method="querySearch"
      size="small"
      @blur="handleCommit"
      @keyup.enter="handleCommit"
    >
      <el-option
        v-for="customer in customerOptions"
        :key="customer.id"
        :label="customer.name"
        :value="customer.name"
      >
        <div class="customer-suggestion">
          <strong>{{ customer.name }}</strong>
          <span>{{ customer.phone || customer.wechat || '无联系方式' }}</span>
        </div>
      </el-option>
    </el-select>

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
import { computed, reactive, ref, watch } from 'vue'
import { CopyDocument, Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { checkBlacklist } from '@/api/blacklist'
import { createCustomer, searchCustomers } from '@/api/customer'
import type { BlacklistRecord } from '@/types/blacklist'
import type { Customer } from '@/types/customer'
import type { LabSampleInput } from '@/types/labSheet'

const props = defineProps<{
  modelValue?: string
  selectedCustomers?: Customer[]
  disabled?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  update: [patch: Partial<LabSampleInput>]
  blacklistHit: [records: BlacklistRecord[]]
}>()

const selectedNames = ref<string[]>(splitCustomerText(props.modelValue))
const customerOptions = ref<Customer[]>(props.selectedCustomers || [])
const searching = ref(false)
const showCreate = ref(false)
const creating = ref(false)
const createForm = reactive({
  name: '',
  phone: '',
  wechat: '',
  wechatNickname: ''
})

let syncingFromProps = false

watch(
  () => props.modelValue,
  (value) => {
    const nextNames = splitCustomerText(value)
    if (nextNames.join('|') === selectedNames.value.join('|')) return
    syncingFromProps = true
    selectedNames.value = nextNames
    syncingFromProps = false
  }
)

watch(
  () => props.selectedCustomers,
  (customers) => {
    mergeCustomerOptions(customers || [])
  },
  { immediate: true }
)

watch(selectedNames, () => {
  if (syncingFromProps) return
  emitSelectedCustomers()
})

const selectedExistingCustomers = computed(() => selectedNames.value.map(findCustomerByName).filter(Boolean) as Customer[])
const canSaveCustomer = computed(() =>
  Boolean(createForm.name.trim() || createForm.phone.trim() || createForm.wechat.trim() || createForm.wechatNickname.trim())
)

const copyText = computed(() => {
  if (!selectedNames.value.length) return ''
  const lines = selectedNames.value.map((name) => {
    const customer = findCustomerByName(name)
    if (!customer) return name
    return [
      customer.name,
      customer.phone ? `电话：${customer.phone}` : '',
      customer.wechat ? `微信号：${customer.wechat}` : '',
      customer.wechatNickname ? `微信昵称：${customer.wechatNickname}` : ''
    ]
      .filter(Boolean)
      .join('，')
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

function emitSelectedCustomers() {
  const customers = selectedExistingCustomers.value
  emit('update', {
    customerId: customers[0]?.id,
    customerIds: customers.map((customer) => customer.id),
    customers,
    customerText: selectedNames.value.join('、')
  })
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
  await checkBlacklistAfterCommit(copyText.value || selectedNames.value.join(' '))
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
    selectedNames.value = Array.from(new Set([...selectedNames.value, customer.name]))
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  align-items: start;
  gap: 4px;
  width: 100%;
  min-width: 0;
}

.customer-actions {
  display: grid;
  gap: 4px;

  :deep(.el-button) {
    width: 30px;
    margin-left: 0;
    padding: 0;
  }
}

.customer-suggestion {
  display: flex;
  justify-content: space-between;
  gap: 12px;

  span {
    color: #64748b;
    font-size: 12px;
  }
}

:deep(.el-select) {
  width: 100%;
}

:deep(.el-select__wrapper) {
  align-items: flex-start;
  min-height: 46px;
  padding: 4px 6px;
  box-shadow: none;
}

:deep(.el-select__selection) {
  align-items: flex-start;
  flex-wrap: wrap;
  row-gap: 4px;
  min-width: 0;
}

:deep(.el-select__selected-item) {
  max-width: 100%;
}

:deep(.el-select__selected-item .el-tag) {
  align-items: center;
  height: auto;
  min-height: 22px;
  max-width: 100%;
  color: #1f2937;
  font-size: 15px;
  white-space: normal;
}

:deep(.el-select__tags-text) {
  overflow: visible;
  white-space: normal;
  text-overflow: clip;
  line-height: 16px;
}

:deep(.el-select__input-wrapper) {
  flex: 1 0 72px;
  min-width: 72px;
}

:deep(.el-select__placeholder),
:deep(.el-select__input::placeholder) {
  color: rgba(31, 41, 55, 0.42);
  font-size: 15px;
  -webkit-text-fill-color: rgba(31, 41, 55, 0.42);
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
