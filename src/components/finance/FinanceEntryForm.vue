<template>
  <section class="panel finance-form">
    <div class="panel__header">
      <h2>新增支出账单</h2>
    </div>
    <div class="panel__body">
      <el-form label-position="top" @submit.prevent>
        <div class="finance-form__top">
          <el-form-item label="支付日期" required class="finance-form__date">
            <el-date-picker v-model="paymentDate" type="date" value-format="YYYY-MM-DD" />
          </el-form-item>
          <div class="finance-form__append">
            <span>增加</span>
            <el-input-number v-model="appendCount" :min="1" :max="30" :step="1" controls-position="right" />
            <span>个开支项目</span>
            <el-button :icon="Plus" @click="appendRows">增加</el-button>
          </div>
        </div>

        <el-table :data="rows" border size="small" class="expense-entry-table">
          <el-table-column type="index" label="序号" width="58" />
          <el-table-column label="开支项目" min-width="180">
            <template #header>
              <span class="required-label">开支项目</span>
            </template>
            <template #default="{ row }">
              <el-input v-model.trim="row.item" placeholder="开支项目" />
            </template>
          </el-table-column>
          <el-table-column label="开支金额" width="150">
            <template #header>
              <span class="required-label">开支金额</span>
            </template>
            <template #default="{ row }">
              <el-input-number v-model="row.amount" :min="0" :precision="2" controls-position="right" />
            </template>
          </el-table-column>
          <el-table-column label="支付方式" width="170">
            <template #header>
              <span class="required-label">支付方式</span>
            </template>
            <template #default="{ row }">
              <el-radio-group v-model="row.paymentMethod" size="small">
                <el-radio-button label="cash">现金</el-radio-button>
                <el-radio-button label="online">线上</el-radio-button>
              </el-radio-group>
            </template>
          </el-table-column>
          <el-table-column label="支付截图" min-width="210">
            <template #default="{ row }">
              <el-upload
                v-model:file-list="row.files"
                :auto-upload="false"
                :limit="10"
                multiple
                list-type="picture-card"
                class="expense-upload"
                :on-exceed="handleScreenshotExceed"
              >
                <el-icon><Plus /></el-icon>
              </el-upload>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="220">
            <template #default="{ row }">
              <el-input v-model.trim="row.remark" type="textarea" :rows="2" placeholder="备注" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="76" fixed="right">
            <template #default="{ $index }">
              <el-button link type="danger" :disabled="rows.length <= 1" @click="removeRow($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="finance-form__actions">
          <el-button type="primary" :loading="submitting" @click="submit">提交支出</el-button>
        </div>
      </el-form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { UploadUserFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { FinancePayload, PaymentMethod } from '@/types/finance'
import { uploadImages } from '@/api/upload'
import { todayInBeijing } from '@/utils/date'

interface ExpenseDraftRow {
  id: string
  item: string
  amount: number
  paymentMethod: PaymentMethod | ''
  files: UploadUserFile[]
  remark: string
}

const emit = defineEmits<{
  submit: [payloads: FinancePayload[]]
}>()

const submitting = ref(false)
const paymentDate = ref(todayInBeijing())
const appendCount = ref(1)
const rows = reactive<ExpenseDraftRow[]>([createRow()])

function createRow(): ExpenseDraftRow {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    item: '',
    amount: 0,
    paymentMethod: '',
    files: [],
    remark: ''
  }
}

function appendRows() {
  for (let index = 0; index < appendCount.value; index += 1) {
    rows.push(createRow())
  }
}

function removeRow(index: number) {
  if (rows.length <= 1) return
  rows.splice(index, 1)
}

function handleScreenshotExceed() {
  ElMessage.error('每条开支最多上传 10 张图片')
}

async function uploadRowScreenshots(row: ExpenseDraftRow) {
  const localFiles: File[] = []
  row.files.forEach((file) => {
    if (file.raw) localFiles.push(file.raw as File)
  })
  const existingUrls = row.files.map((file) => (!file.raw && file.url ? file.url : '')).filter(Boolean)
  const uploadedUrls = localFiles.length ? await uploadImages(localFiles) : []
  return Array.from(new Set([...existingUrls, ...uploadedUrls]))
}

async function buildPayloads() {
  const payloads: FinancePayload[] = []
  for (const row of rows) {
    const screenshotUrls = await uploadRowScreenshots(row)
    payloads.push({
      paymentDate: paymentDate.value,
      item: row.item,
      amount: Number(row.amount),
      paymentMethod: row.paymentMethod as PaymentMethod,
      screenshotUrl: screenshotUrls[0] || '',
      screenshotUrls,
      remark: row.remark
    })
  }
  return payloads
}

function validateRows() {
  if (!paymentDate.value) return '请选择支付日期'
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1
    if (!row.item.trim()) return `第 ${rowNumber} 行：开支项目必填`
    if (!Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0) return `第 ${rowNumber} 行：开支金额必须大于 0`
    if (!row.paymentMethod) return `第 ${rowNumber} 行：支付方式必填`
  }
  return ''
}

function resetForm() {
  paymentDate.value = todayInBeijing()
  rows.splice(0, rows.length, createRow())
  appendCount.value = 1
}

async function submit() {
  const error = validateRows()
  if (error) {
    ElMessage.error(error)
    return
  }
  submitting.value = true
  try {
    emit('submit', await buildPayloads())
    resetForm()
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.finance-form__top,
.finance-form__append,
.finance-form__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.finance-form__top {
  justify-content: space-between;
  margin-bottom: 12px;
}

.finance-form__date {
  margin-bottom: 0;
}

.finance-form__append {
  margin-left: auto;
  color: #475569;
}

.finance-form__append :deep(.el-input-number) {
  width: 110px;
}

.required-label::before {
  content: '*';
  margin-right: 4px;
  color: #ef4444;
}

.expense-entry-table :deep(.el-input-number) {
  width: 100%;
}

.expense-entry-table :deep(.el-radio-button__inner) {
  padding: 8px 12px;
}

.expense-upload :deep(.el-upload--picture-card),
.expense-upload :deep(.el-upload-list__item) {
  width: 42px;
  height: 42px;
  margin: 0 4px 4px 0;
}

.expense-upload :deep(.el-upload--picture-card .el-icon) {
  font-size: 18px;
}

.finance-form__actions {
  margin-top: 12px;
}

@media (max-width: 900px) {
  .finance-form__top {
    justify-content: flex-start;
  }

  .finance-form__append {
    margin-left: 0;
  }
}
</style>
