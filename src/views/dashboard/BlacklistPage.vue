<template>
  <div class="page-stack blacklist-page">
    <KeepAlive>
      <MobileBlacklistSection
        v-if="isMobileLayout"
        :records="blacklistStore.records" :keyword="blacklistStore.keyword" :loading="blacklistStore.loading"
        :highlight-id="highlightId" :load-error="loadError" :deleting-id="blacklistStore.deletingId"
        :updating-id="blacklistStore.updatingId" :save="handleCreate"
        @retry="retryLoadRecords" @search="loadRecords" @supplement="openSupplement" @delete="handleDelete"
      />
    </KeepAlive>

    <template v-if="!isMobileLayout">
      <BlacklistTable
        :records="blacklistStore.records" :keyword="blacklistStore.keyword" :loading="blacklistStore.loading"
        :highlight-id="highlightId"
        :deleting-id="blacklistStore.deletingId" :updating-id="blacklistStore.updatingId"
        @search="loadRecords" @supplement="openSupplement" @delete="handleDelete"
      />
      <BlacklistUploadForm :save="handleCreate" />
    </template>

    <MobileFullscreenDialog
      v-if="isMobileLayout" v-model="supplementVisible" title="补充黑名单客户信息"
      :saving="supplementSaving" fullscreen @confirm="submitSupplement"
    >
      <div class="mobile-blacklist-supplement">
        <label><span>电话号</span><input v-model.trim="supplementForm.phone" :disabled="supplementSaving" data-testid="blacklist-supplement-phone" class="mobile-touch-target" type="tel" autocomplete="tel" /></label>
        <label><span>微信号</span><input v-model.trim="supplementForm.wechat" :disabled="supplementSaving" data-testid="blacklist-supplement-wechat" class="mobile-touch-target" type="text" autocomplete="off" /></label>
        <label><span>微信昵称</span><input v-model.trim="supplementForm.wechatNickname" :disabled="supplementSaving" data-testid="blacklist-supplement-nickname" class="mobile-touch-target" type="text" autocomplete="off" /></label>
        <label><span>金额</span><input v-model.number="supplementForm.amount" :disabled="supplementSaving" data-testid="blacklist-supplement-amount" class="mobile-touch-target" type="number" inputmode="decimal" min="0" step="0.01" /></label>
        <label><span>其他</span><input v-model.trim="supplementForm.other" :disabled="supplementSaving" data-testid="blacklist-supplement-other" class="mobile-touch-target" type="text" autocomplete="off" /></label>
        <label><span>备注</span><textarea v-model.trim="supplementForm.note" :disabled="supplementSaving" data-testid="blacklist-supplement-note" rows="3" /></label>
        <label class="mobile-blacklist-supplement__images">
          <span>图片（最多 2 张）</span>
          <el-upload ref="mobileSupplementUploadRef" v-model:file-list="supplementImageFiles" :auto-upload="false" :disabled="supplementSaving" :limit="2" accept="image/png,image/jpeg,image/webp,image/gif" list-type="picture-card"
            :on-change="handleSupplementImageChange" :on-remove="handleSupplementImageRemove" :on-exceed="handleSupplementExceed">
            <el-icon aria-hidden="true"><Plus /></el-icon>
            <span class="blacklist-upload-trigger-label">选择黑名单补充图片</span>
          </el-upload>
          <small>已选 {{ supplementImageFiles.length }} / 2 张</small>
        </label>
      </div>
    </MobileFullscreenDialog>

    <el-dialog v-else v-model="supplementVisible" title="补充黑名单客户信息" width="760px" append-to-body>
      <el-form label-position="top">
        <div class="blacklist-form-grid">
          <el-form-item label="电话号"><el-input v-model.trim="supplementForm.phone" :disabled="supplementSaving" /></el-form-item>
          <el-form-item label="微信号"><el-input v-model.trim="supplementForm.wechat" :disabled="supplementSaving" /></el-form-item>
          <el-form-item label="微信昵称"><el-input v-model.trim="supplementForm.wechatNickname" :disabled="supplementSaving" /></el-form-item>
          <el-form-item label="金额"><el-input-number v-model="supplementForm.amount" :disabled="supplementSaving" :precision="2" :min="0" controls-position="right" /></el-form-item>
        </div>
        <el-form-item label="图片">
          <el-upload ref="desktopSupplementUploadRef" v-model:file-list="supplementImageFiles" :auto-upload="false" :disabled="supplementSaving" :limit="2" accept="image/png,image/jpeg,image/webp,image/gif" list-type="picture-card"
            :on-change="handleSupplementImageChange" :on-remove="handleSupplementImageRemove" :on-exceed="handleSupplementExceed">
            <el-icon aria-hidden="true"><Plus /></el-icon>
            <span class="blacklist-upload-trigger-label">选择黑名单补充图片</span>
          </el-upload>
        </el-form-item>
        <el-form-item label="其他"><el-input v-model.trim="supplementForm.other" :disabled="supplementSaving" /></el-form-item>
        <el-form-item label="备注"><el-input v-model.trim="supplementForm.note" :disabled="supplementSaving" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="supplementSaving" @click="supplementVisible = false">取消</el-button>
        <el-button type="primary" :loading="supplementSaving" :disabled="supplementSaving" @click="submitSupplement">确认补充</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { UploadFile, UploadFiles, UploadInstance, UploadUserFile } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { uploadImages } from '@/api/upload'
import BlacklistTable from '@/components/blacklist/BlacklistTable.vue'
import BlacklistUploadForm from '@/components/blacklist/BlacklistUploadForm.vue'
import MobileBlacklistSection from '@/components/blacklist/MobileBlacklistSection.vue'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useBlacklistStore } from '@/stores/blacklist'
import { tryUseTenantRealtimeStore } from '@/stores/tenantRealtime'
import type { BlacklistPayload, BlacklistRecord } from '@/types/blacklist'
import {
  createOwnedImagePreview,
  forgetOwnedImagePreview,
  isSafeStoredBlacklistImageUrl,
  registerOwnedImagePreview,
  revokeOwnedImagePreview,
  validateBlacklistImage
} from '@/utils/blacklistImages'
import { validateBlacklistPayload } from '@/utils/validators'

const route = useRoute()
const blacklistStore = useBlacklistStore()
const tenantRealtime = tryUseTenantRealtimeStore()
let unregisterRealtime: (() => void) | undefined
const { isMobileLayout } = useMobileLayout()
const highlightId = computed(() => (typeof route.query.hit === 'string' ? route.query.hit : ''))
const loadError = ref('')
const supplementVisible = ref(false)
const supplementRecord = ref<BlacklistRecord | null>(null)
const supplementImageFiles = ref<UploadUserFile[]>([])
const mobileSupplementUploadRef = ref<UploadInstance>()
const desktopSupplementUploadRef = ref<UploadInstance>()
const supplementSaving = ref(false)
const supplementOwnedUrls = new Set<string>()
let supplementUploadedUrls = new WeakMap<File, string>()
const deletingRecords = new Set<string>()
let pageLoadVersion = 0
let loadController: AbortController | null = null
let failedLoadKeyword = ''
let disposed = false
let retainSupplementAcrossLayout = false
let supplementPreviewLayoutVersion = 0
const supplementForm = reactive<BlacklistPayload>({ phone: '', wechat: '', wechatNickname: '', amount: null, images: [], other: '', note: '' })

onMounted(() => {
  void loadRecords(highlightId.value ? '' : blacklistStore.keyword)
  unregisterRealtime = tenantRealtime?.registerModule('blacklist', {
    isDirty: () => supplementVisible.value,
    refresh: () => loadRecords(highlightId.value ? '' : blacklistStore.keyword)
  })
})
onBeforeUnmount(() => {
  disposed = true
  pageLoadVersion += 1
  supplementPreviewLayoutVersion += 1
  loadController?.abort()
  forgetSupplementUrls()
  deletingRecords.clear()
  unregisterRealtime?.()
})

watch(() => route.query.hit, () => { void loadRecords(highlightId.value ? '' : blacklistStore.keyword) })
watch(isMobileLayout, () => {
  if (!supplementVisible.value) return
  if (supplementSaving.value) retainSupplementAcrossLayout = true
  if (retainSupplementAcrossLayout) { void refreshSupplementPreviewsAfterLayoutChange(); return }
  if (!retainSupplementAcrossLayout) supplementVisible.value = false
})
watch(supplementVisible, (visible) => {
  if (!visible) { retainSupplementAcrossLayout = false; resetSupplementForm() }
})

async function loadRecords(keyword = highlightId.value ? '' : blacklistStore.keyword) {
  const currentLoad = ++pageLoadVersion
  loadController?.abort()
  const controller = new AbortController()
  loadController = controller
  loadError.value = ''
  try {
    await blacklistStore.loadRecords(keyword, { signal: controller.signal })
  } catch {
    if (!disposed && !controller.signal.aborted && currentLoad === pageLoadVersion) {
      failedLoadKeyword = keyword
      loadError.value = '黑名单加载失败，请检查网络后重试。'
    }
  } finally {
    if (loadController === controller) loadController = null
  }
}

function retryLoadRecords() {
  void loadRecords(failedLoadKeyword)
}

async function handleCreate(payload: BlacklistPayload): Promise<void> {
  await blacklistStore.addRecord(payload)
  if (disposed) return
  ElMessage.success('黑名单已保存')
  await loadRecords()
}

async function handleDelete(id: string) {
  if (deletingRecords.has(id)) return
  deletingRecords.add(id)
  try {
    await ElMessageBox.confirm('确认删除这条黑名单记录？删除后不可恢复。', '删除黑名单', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning', confirmButtonClass: 'el-button--danger'
    })
    await blacklistStore.deleteRecord(id)
    if (!disposed) ElMessage.success('黑名单已删除')
  } catch {
    // Cancellation and request errors must leave the exact record untouched.
  } finally {
    deletingRecords.delete(id)
  }
}

function openSupplement(row: BlacklistRecord) {
  if (supplementSaving.value) return
  resetSupplementForm()
  const existingImages = (row.images || []).filter(isSafeStoredBlacklistImageUrl)
  supplementRecord.value = row
  Object.assign(supplementForm, {
    phone: row.phone || '', wechat: row.wechat || '', wechatNickname: row.wechatNickname || '', amount: row.amount ?? null,
    images: existingImages, other: row.other || '', note: row.note || ''
  })
  supplementImageFiles.value = existingImages.map((url, index) => ({ name: `黑名单图片${index + 1}`, url }))
  supplementVisible.value = true
}

function resetSupplementForm() {
  supplementPreviewLayoutVersion += 1
  mobileSupplementUploadRef.value?.clearFiles()
  desktopSupplementUploadRef.value?.clearFiles()
  releaseSupplementUrls()
  supplementRecord.value = null
  supplementImageFiles.value = []
  supplementUploadedUrls = new WeakMap<File, string>()
  Object.assign(supplementForm, { phone: '', wechat: '', wechatNickname: '', amount: null, images: [], other: '', note: '' })
}

function releaseSupplementUrls() {
  for (const url of [...supplementOwnedUrls]) releaseSupplementUrl(url)
}

function forgetSupplementUrls() {
  for (const url of [...supplementOwnedUrls]) forgetSupplementUrl(url)
}

function syncSupplementImages(files: UploadFiles, revokeMissing = true) {
  const next: UploadUserFile[] = []
  for (const item of files) {
    if (next.length >= 2) break
    if (item.raw) {
      const error = validateBlacklistImage(item.raw)
      if (error) {
        registerSupplementElementPreview(item)
        if (item.url) releaseSupplementUrl(item.url)
        ElMessage.error(error)
        continue
      }
    }
    let url = item.url || ''
    registerSupplementElementPreview(item)
    if (!url && item.raw) {
      try {
        url = createOwnedImagePreview(item.raw)
        supplementOwnedUrls.add(url)
      } catch {
        ElMessage.error('图片预览失败，请重新选择')
        continue
      }
    }
    if (url) next.push({ ...item, url })
  }
  const activeUrls = new Set(next.map((item) => item.url).filter((url): url is string => Boolean(url)))
  for (const url of [...supplementOwnedUrls]) {
    if (!activeUrls.has(url)) {
      if (revokeMissing) releaseSupplementUrl(url)
      else forgetSupplementUrl(url)
    }
  }
  supplementImageFiles.value = next
  supplementForm.images = next.map((item) => item.url || '').filter(Boolean)
}

function handleSupplementImageChange(_file: UploadFile, files: UploadFiles) { syncSupplementImages(files) }
function handleSupplementImageRemove(_file: UploadFile, files: UploadFiles) { syncSupplementImages(files, false) }
function handleSupplementExceed() { ElMessage.error('图片最多上传 2 张') }

function registerSupplementElementPreview(item: UploadUserFile) {
  if (!item.raw || !item.url?.startsWith('blob:')) return
  registerOwnedImagePreview(item.url)
  supplementOwnedUrls.add(item.url)
}

function releaseSupplementUrl(url: string) {
  revokeOwnedImagePreview(url)
  supplementOwnedUrls.delete(url)
}

function forgetSupplementUrl(url: string) {
  forgetOwnedImagePreview(url)
  supplementOwnedUrls.delete(url)
}

async function refreshSupplementPreviewsAfterLayoutChange() {
  const currentLayout = ++supplementPreviewLayoutVersion
  for (const item of supplementImageFiles.value) {
    if (!item.raw || !item.url?.startsWith('blob:')) continue
    const previousUrl = item.url
    item.url = ''
    releaseSupplementUrl(previousUrl)
  }
  supplementImageFiles.value = supplementImageFiles.value.map((item) => ({ ...item }))
  supplementForm.images = supplementImageFiles.value.map((item) => item.url || '').filter(Boolean)
  await nextTick()
  if (disposed || !supplementVisible.value || currentLayout !== supplementPreviewLayoutVersion) return
  supplementImageFiles.value = supplementImageFiles.value.map((item) => {
    if (!item.raw || item.url) return item
    try {
      const url = createOwnedImagePreview(item.raw)
      supplementOwnedUrls.add(url)
      return { ...item, url }
    } catch {
      ElMessage.error('图片预览失败，请重新选择')
      return item
    }
  })
  supplementForm.images = supplementImageFiles.value.map((item) => item.url || '').filter(Boolean)
}

async function persistSupplementFiles(files: File[]) {
  const missing = files.filter((file) => !supplementUploadedUrls.has(file))
  if (missing.length) {
    const urls = await uploadImages(missing)
    missing.forEach((file, index) => supplementUploadedUrls.set(file, urls[index]))
  }
  return files.map((file) => supplementUploadedUrls.get(file)).filter((url): url is string => Boolean(url))
}

function supplementDraftSignature() {
  return JSON.stringify({
    ...supplementForm,
    images: supplementImageFiles.value.map((item) => item.raw
      ? ['local', item.name, item.raw.type, item.raw.size, item.raw.lastModified]
      : ['remote', item.url])
  })
}

async function submitSupplement() {
  if (supplementSaving.value || !supplementRecord.value) return
  const rawAmount = supplementForm.amount as unknown
  const existingImageUrls = supplementImageFiles.value
    .filter((item) => !item.raw && item.url)
    .map((item) => item.url as string)
  const localImageFiles = supplementImageFiles.value.flatMap((item) => item.raw ? [item.raw] : [])
  const payload: BlacklistPayload = {
    ...supplementForm,
    amount: rawAmount === '' ? null : supplementForm.amount,
    images: [...supplementForm.images]
  }
  const errors = validateBlacklistPayload(payload)
  if (errors.length) { ElMessage.error(errors[0]); return }
  const recordId = supplementRecord.value.id
  const submittedDraft = supplementDraftSignature()
  supplementSaving.value = true
  try {
    await ElMessageBox.confirm('确认保存补充的黑名单客户信息？', '确认补充信息', {
      confirmButtonText: '确认保存', cancelButtonText: '取消', type: 'warning'
    })
    const uploadedUrls = await persistSupplementFiles(localImageFiles)
    await blacklistStore.updateRecord(recordId, {
      ...payload,
      images: [...existingImageUrls, ...uploadedUrls],
      baseUpdatedAt: supplementRecord.value.updatedAt || ''
    })
    if (disposed) return
    ElMessage.success('黑名单信息已补充')
    if (supplementDraftSignature() === submittedDraft) supplementVisible.value = false
  } catch {
    // Cancellation and request errors intentionally retain every field and image.
  } finally {
    if (!disposed) supplementSaving.value = false
  }
}
</script>

<style scoped lang="scss">
.mobile-blacklist-page { display: grid; min-width: 0; gap: 16px; }
.mobile-blacklist-page__error { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; color: var(--ui-danger); background: var(--ui-danger-soft); border: 1px solid var(--ui-danger-line); border-radius: 10px; }
.mobile-blacklist-page__error button { min-height: 44px; padding: 8px 12px; color: var(--ui-danger); background: #fff; border: 1px solid currentcolor; border-radius: 8px; }
.blacklist-form-grid { display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 12px; }
.mobile-blacklist-supplement { display: grid; gap: 12px; }
.mobile-blacklist-supplement > label { display: grid; min-width: 0; gap: 6px; color: var(--ui-text-secondary); }
.mobile-blacklist-supplement input, .mobile-blacklist-supplement textarea { box-sizing: border-box; width: 100%; min-width: 0; min-height: 44px; padding: 9px 11px; color: var(--ui-text); background: #fff; border: 1px solid var(--ui-line); border-radius: 8px; }
.mobile-blacklist-supplement textarea { min-height: 88px; resize: vertical; }
.blacklist-upload-trigger-label { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 900px) { .blacklist-form-grid { grid-template-columns: 1fr; } }
</style>
