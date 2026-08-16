<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue'
import type { UploadFile, UploadFiles, UploadUserFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { FinancePayload } from '@/types/finance'
import { todayInBeijing } from '@/utils/date'
import { buildPayloads, createRow, validateRows } from './useFinanceEntryDraft'
import type { ExpenseDraftRow } from './useFinanceEntryDraft'

const props = defineProps<{
  save: (payloads: FinancePayload[]) => Promise<void>
}>()

const paymentDate = ref(todayInBeijing())
const appendCount = ref(1)
const rows = reactive<ExpenseDraftRow[]>([createRow()])
const submitting = ref(false)
const ownedPreviewUrls = new Set<string>()
let uploadedUrlsByFile = new WeakMap<File, string>()
let disposed = false

onBeforeUnmount(() => {
  disposed = true
  releaseAllOwnedPreviews()
})

function appendRows() {
  const count = Math.min(30, Math.max(1, Math.trunc(Number(appendCount.value)) || 1))
  for (let index = 0; index < count; index += 1) rows.push(createRow())
}

function removeRow(index: number) {
  if (rows.length <= 1) return
  releaseRowPreviews(rows[index])
  rows.splice(index, 1)
}

function handleScreenshotChange(row: ExpenseDraftRow, _file: UploadFile, files: UploadFiles) {
  syncRowFiles(row, files)
}

function handleScreenshotRemove(row: ExpenseDraftRow, _file: UploadFile, files: UploadFiles) {
  syncRowFiles(row, files)
}

function syncRowFiles(row: ExpenseDraftRow, files: UploadFiles) {
  const next: UploadUserFile[] = []
  for (const item of files.slice(0, 10)) {
    let url = item.url || ''
    if (!url && item.raw && typeof URL.createObjectURL === 'function') {
      try {
        url = URL.createObjectURL(item.raw)
        ownedPreviewUrls.add(url)
      } catch {
        ElMessage.error('图片预览失败，请重新选择')
      }
    }
    next.push(url ? { ...item, url } : { ...item })
  }
  const activeUrls = new Set(next.map((item) => item.url).filter((url): url is string => Boolean(url)))
  for (const item of row.files) {
    if (item.url && ownedPreviewUrls.has(item.url) && !activeUrls.has(item.url)) releaseOwnedPreview(item.url)
  }
  row.files.splice(0, row.files.length, ...next)
}

function handleScreenshotExceed() {
  ElMessage.error('每条开支最多上传 10 张图片')
}

function releaseOwnedPreview(url: string) {
  if (!ownedPreviewUrls.delete(url)) return
  URL.revokeObjectURL(url)
}

function releaseRowPreviews(row: ExpenseDraftRow) {
  row.files.forEach((item) => {
    if (item.url) releaseOwnedPreview(item.url)
  })
}

function releaseAllOwnedPreviews() {
  for (const url of [...ownedPreviewUrls]) releaseOwnedPreview(url)
}

function snapshotDraft() {
  return {
    paymentDate: paymentDate.value,
    rows: rows.map((row) => ({ ...row, files: [...row.files] }))
  }
}

function draftMatches(snapshot: ReturnType<typeof snapshotDraft>) {
  if (paymentDate.value !== snapshot.paymentDate || rows.length !== snapshot.rows.length) return false
  return rows.every((row, index) => {
    const saved = snapshot.rows[index]
    return row.id === saved.id
      && row.item === saved.item
      && Number(row.amount) === Number(saved.amount)
      && row.paymentMethod === saved.paymentMethod
      && row.remark === saved.remark
      && row.files.length === saved.files.length
      && row.files.every((file, fileIndex) => file.raw === saved.files[fileIndex].raw && file.url === saved.files[fileIndex].url)
  })
}

function resetForm() {
  releaseAllOwnedPreviews()
  paymentDate.value = todayInBeijing()
  rows.splice(0, rows.length, createRow())
  appendCount.value = 1
  uploadedUrlsByFile = new WeakMap<File, string>()
}

async function submit() {
  if (submitting.value) return
  const error = validateRows(paymentDate.value, rows)
  if (error) {
    ElMessage.error(error)
    return
  }
  submitting.value = true
  const snapshot = snapshotDraft()
  try {
    const payloads = await buildPayloads(snapshot.paymentDate, snapshot.rows, uploadedUrlsByFile)
    if (disposed) return
    await props.save(payloads)
    if (!disposed && draftMatches(snapshot)) resetForm()
  } catch {
    // The request layer owns error presentation. Keeping the draft is intentional.
  } finally {
    if (!disposed) submitting.value = false
  }
}
</script>

<template>
  <section class="panel mobile-finance-entry-form" data-testid="mobile-finance-entry-form">
    <header class="mobile-finance-entry-form__header">
      <div>
        <h2>新增支出账单</h2>
        <p class="muted">每条开支可上传 10 张支付截图。</p>
      </div>
      <label class="mobile-finance-entry-form__date">
        <span>支付日期</span>
        <input v-model="paymentDate" data-testid="mobile-finance-date" class="mobile-touch-target" type="date" />
      </label>
    </header>

    <div class="mobile-finance-entry-form__append">
      <label>
        <span>增加条数</span>
        <input v-model.number="appendCount" data-testid="mobile-finance-add-count" class="mobile-touch-target" type="number" min="1" max="30" step="1" inputmode="numeric" />
      </label>
      <button data-testid="mobile-finance-add-rows" class="mobile-touch-target" type="button" @click="appendRows">增加开支</button>
    </div>

    <div class="mobile-finance-entry-form__cards">
      <article v-for="(row, index) in rows" :key="row.id" class="mobile-expense-draft-card" data-testid="mobile-expense-draft-card">
        <header>
          <strong>开支 {{ index + 1 }}</strong>
          <button data-testid="mobile-expense-remove" class="mobile-expense-draft-card__remove mobile-touch-target" type="button" :disabled="rows.length <= 1" @click="removeRow(index)">删除</button>
        </header>
        <label>
          <span>开支项目 *</span>
          <input v-model.trim="row.item" data-testid="mobile-expense-item" class="mobile-touch-target" type="text" autocomplete="off" placeholder="请输入开支项目" />
        </label>
        <label>
          <span>开支金额 *</span>
          <input v-model.number="row.amount" data-testid="mobile-expense-amount" class="mobile-touch-target" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" />
        </label>
        <label>
          <span>支付方式 *</span>
          <select v-model="row.paymentMethod" data-testid="mobile-expense-payment-method" class="mobile-touch-target">
            <option value="">请选择</option>
            <option value="cash">现金支付</option>
            <option value="online">线上支付</option>
          </select>
        </label>
        <label class="mobile-expense-draft-card__screenshots">
          <span>支付截图（最多 10 张）</span>
          <el-upload
            v-model:file-list="row.files"
            :auto-upload="false"
            :limit="10"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            list-type="picture-card"
            :on-change="(file: UploadFile, files: UploadFiles) => handleScreenshotChange(row, file, files)"
            :on-remove="(file: UploadFile, files: UploadFiles) => handleScreenshotRemove(row, file, files)"
            :on-exceed="handleScreenshotExceed"
          >
            <el-icon aria-hidden="true"><Plus /></el-icon>
            <span class="mobile-finance-upload-label">选择支付截图</span>
          </el-upload>
          <small data-testid="mobile-expense-image-count">已选 {{ row.files.length }} / 10 张</small>
        </label>
        <label>
          <span>备注</span>
          <textarea v-model.trim="row.remark" data-testid="mobile-expense-remark" rows="3" placeholder="选填" />
        </label>
      </article>
    </div>

    <button data-testid="mobile-finance-save" class="mobile-finance-entry-form__save mobile-touch-target" style="min-height: 44px" type="button" :disabled="submitting" @click="submit">
      {{ submitting ? '提交中…' : '提交支出' }}
    </button>
  </section>
</template>

<style scoped lang="scss">
.mobile-finance-entry-form,
.mobile-finance-entry-form__cards,
.mobile-expense-draft-card {
  display: grid;
  min-width: 0;
  gap: 14px;
}

.mobile-finance-entry-form {
  box-sizing: border-box;
  padding: 14px 14px max(18px, env(safe-area-inset-bottom));
}

.mobile-finance-entry-form__header,
.mobile-finance-entry-form__append,
.mobile-expense-draft-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mobile-finance-entry-form h2,
.mobile-finance-entry-form p {
  margin: 0;
}

.mobile-finance-entry-form p {
  margin-top: 4px;
}

.mobile-finance-entry-form label,
.mobile-finance-entry-form__append label {
  display: grid;
  min-width: 0;
  gap: 6px;
  color: #475569;
}

.mobile-finance-entry-form__date {
  flex: 0 0 154px;
}

.mobile-finance-entry-form__append label {
  grid-template-columns: auto 84px;
  align-items: center;
}

.mobile-finance-entry-form input,
.mobile-finance-entry-form select,
.mobile-finance-entry-form textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 9px 11px;
  color: #0f172a;
  background: #fff;
  border: 1px solid #aebdcd;
  border-radius: 8px;
}

.mobile-finance-entry-form textarea {
  min-height: 88px;
  resize: vertical;
}

.mobile-finance-entry-form__append button,
.mobile-expense-draft-card__remove {
  padding: 8px 14px;
  color: #2563eb;
  background: #fff;
  border: 1px solid #93b4dd;
  border-radius: 8px;
}

.mobile-expense-draft-card {
  padding: 14px;
  background: #fff;
  border: 1px solid #d8e1eb;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgb(15 23 42 / 5%);
}

.mobile-expense-draft-card__remove {
  color: #b42318;
  border-color: #e8aaa5;
}

.mobile-expense-draft-card__remove:disabled {
  color: #94a3b8;
  border-color: #d8e1eb;
}

.mobile-expense-draft-card__screenshots small {
  color: #64748b;
}

.mobile-expense-draft-card__screenshots :deep(.el-upload--picture-card),
.mobile-expense-draft-card__screenshots :deep(.el-upload-list__item) {
  width: 72px;
  height: 72px;
}

.mobile-finance-upload-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.mobile-finance-entry-form__save {
  width: 100%;
  min-height: 44px;
  color: #fff;
  font-weight: 700;
  background: #2563eb;
  border: 0;
  border-radius: 8px;
}

.mobile-finance-entry-form__save:disabled {
  opacity: 0.65;
}

@media (max-width: 480px) {
  .mobile-finance-entry-form__header {
    align-items: stretch;
    flex-direction: column;
  }

  .mobile-finance-entry-form__date {
    flex-basis: auto;
  }
}
</style>
