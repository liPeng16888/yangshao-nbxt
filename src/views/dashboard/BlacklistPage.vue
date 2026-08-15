<template>
  <div class="page-stack blacklist-page">
    <section v-if="isMobileLayout" class="panel mobile-blacklist-page">
      <div class="panel__header"><div><h2>黑名单</h2><p class="muted">查询、新增和补充黑名单客户信息。</p></div></div>
      <div v-if="loadError" class="mobile-blacklist-page__error" data-testid="mobile-blacklist-load-error" role="alert">
        <span>{{ loadError }}</span>
        <button data-testid="mobile-blacklist-retry" class="mobile-touch-target" type="button" :disabled="blacklistStore.loading" @click="loadRecords()">重试</button>
      </div>
      <MobileBlacklistList
        :records="blacklistStore.records" :keyword="blacklistStore.keyword" :loading="blacklistStore.loading"
        :highlight-id="highlightId" :current-username="authStore.user?.username || ''"
        :deleting-id="blacklistStore.deletingId" :updating-id="blacklistStore.updatingId"
        @search="loadRecords" @supplement="openSupplement" @delete="handleDelete"
      />
      <MobileBlacklistForm :save="handleCreate" />
    </section>

    <template v-else>
      <BlacklistTable
        :records="blacklistStore.records" :keyword="blacklistStore.keyword" :loading="blacklistStore.loading"
        :highlight-id="highlightId" :current-username="authStore.user?.username || ''"
        :deleting-id="blacklistStore.deletingId" :updating-id="blacklistStore.updatingId"
        @search="loadRecords" @supplement="openSupplement" @delete="handleDelete"
      />
      <BlacklistUploadForm @submit="handleCreate" />
    </template>

    <MobileFullscreenDialog
      v-if="isMobileLayout" v-model="supplementVisible" title="补充黑名单客户信息"
      :saving="supplementSaving" fullscreen @confirm="submitSupplement"
    >
      <div class="mobile-blacklist-supplement">
        <label><span>电话号</span><input v-model.trim="supplementForm.phone" data-testid="blacklist-supplement-phone" class="mobile-touch-target" type="tel" autocomplete="tel" /></label>
        <label><span>微信号</span><input v-model.trim="supplementForm.wechat" data-testid="blacklist-supplement-wechat" class="mobile-touch-target" type="text" autocomplete="off" /></label>
        <label><span>微信昵称</span><input v-model.trim="supplementForm.wechatNickname" data-testid="blacklist-supplement-nickname" class="mobile-touch-target" type="text" autocomplete="off" /></label>
        <label><span>金额</span><input v-model.number="supplementForm.amount" data-testid="blacklist-supplement-amount" class="mobile-touch-target" type="number" inputmode="decimal" min="0" step="0.01" /></label>
        <label><span>其他</span><input v-model.trim="supplementForm.other" data-testid="blacklist-supplement-other" class="mobile-touch-target" type="text" autocomplete="off" /></label>
        <label><span>备注</span><textarea v-model.trim="supplementForm.note" data-testid="blacklist-supplement-note" rows="3" /></label>
        <label class="mobile-blacklist-supplement__images">
          <span>图片（最多 2 张）</span>
          <el-upload v-model:file-list="supplementImageFiles" :auto-upload="false" :limit="2" accept="image/*" list-type="picture-card"
            :on-change="handleSupplementImageChange" :on-remove="handleSupplementImageRemove" :on-exceed="handleSupplementExceed">
            <el-icon><Plus /></el-icon>
          </el-upload>
          <small>已选 {{ supplementImageFiles.length }} / 2 张</small>
        </label>
      </div>
    </MobileFullscreenDialog>

    <el-dialog v-else v-model="supplementVisible" title="补充黑名单客户信息" width="760px" append-to-body>
      <el-form label-position="top">
        <div class="blacklist-form-grid">
          <el-form-item label="电话号"><el-input v-model.trim="supplementForm.phone" /></el-form-item>
          <el-form-item label="微信号"><el-input v-model.trim="supplementForm.wechat" /></el-form-item>
          <el-form-item label="微信昵称"><el-input v-model.trim="supplementForm.wechatNickname" /></el-form-item>
          <el-form-item label="金额"><el-input-number v-model="supplementForm.amount" :precision="2" :min="0" controls-position="right" /></el-form-item>
        </div>
        <el-form-item label="图片">
          <el-upload v-model:file-list="supplementImageFiles" :auto-upload="false" :limit="2" accept="image/*" list-type="picture-card"
            :on-change="handleSupplementImageChange" :on-remove="handleSupplementImageRemove" :on-exceed="handleSupplementExceed">
            <el-icon><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        <el-form-item label="其他"><el-input v-model.trim="supplementForm.other" /></el-form-item>
        <el-form-item label="备注"><el-input v-model.trim="supplementForm.note" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="supplementSaving" @click="supplementVisible = false">取消</el-button>
        <el-button type="primary" :loading="supplementSaving" :disabled="supplementSaving" @click="submitSupplement">确认补充</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { UploadFile, UploadFiles, UploadUserFile } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import BlacklistTable from '@/components/blacklist/BlacklistTable.vue'
import BlacklistUploadForm from '@/components/blacklist/BlacklistUploadForm.vue'
import MobileBlacklistForm from '@/components/blacklist/MobileBlacklistForm.vue'
import MobileBlacklistList from '@/components/blacklist/MobileBlacklistList.vue'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useAuthStore } from '@/stores/auth'
import { useBlacklistStore } from '@/stores/blacklist'
import type { BlacklistPayload, BlacklistRecord } from '@/types/blacklist'
import { validateBlacklistPayload } from '@/utils/validators'

const route = useRoute()
const authStore = useAuthStore()
const blacklistStore = useBlacklistStore()
const { isMobileLayout } = useMobileLayout()
const highlightId = computed(() => (typeof route.query.hit === 'string' ? route.query.hit : ''))
const loadError = ref('')
const supplementVisible = ref(false)
const supplementRecord = ref<BlacklistRecord | null>(null)
const supplementImageFiles = ref<UploadUserFile[]>([])
const supplementSaving = ref(false)
const supplementOwnedUrls = new Set<string>()
const deletingRecords = new Set<string>()
let pageLoadVersion = 0
let disposed = false
const supplementForm = reactive<BlacklistPayload>({ phone: '', wechat: '', wechatNickname: '', amount: null, images: [], other: '', note: '' })

onMounted(() => { void loadRecords() })
onBeforeUnmount(() => {
  disposed = true
  pageLoadVersion += 1
  blacklistStore.cancelPendingLoads()
  releaseSupplementUrls()
  deletingRecords.clear()
})

watch(() => route.query.hit, () => { void loadRecords() })
watch(isMobileLayout, () => { if (supplementVisible.value) supplementVisible.value = false })
watch(supplementVisible, (visible) => { if (!visible) resetSupplementForm() })

async function loadRecords(keyword = blacklistStore.keyword) {
  const currentLoad = ++pageLoadVersion
  loadError.value = ''
  try {
    await blacklistStore.loadRecords(keyword)
  } catch {
    if (!disposed && currentLoad === pageLoadVersion) loadError.value = '黑名单加载失败，请检查网络后重试。'
  }
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
  supplementRecord.value = row
  Object.assign(supplementForm, {
    phone: row.phone || '', wechat: row.wechat || '', wechatNickname: row.wechatNickname || '', amount: row.amount ?? null,
    images: [...(row.images || [])], other: row.other || '', note: row.note || ''
  })
  supplementImageFiles.value = (row.images || []).map((url, index) => ({ name: `黑名单图片${index + 1}`, url }))
  supplementVisible.value = true
}

function resetSupplementForm() {
  releaseSupplementUrls()
  supplementRecord.value = null
  supplementImageFiles.value = []
  Object.assign(supplementForm, { phone: '', wechat: '', wechatNickname: '', amount: null, images: [], other: '', note: '' })
}

function releaseSupplementUrls() {
  for (const url of supplementOwnedUrls) URL.revokeObjectURL(url)
  supplementOwnedUrls.clear()
}

function syncSupplementImages(files: UploadFiles) {
  const next: UploadUserFile[] = []
  for (const item of files) {
    if (next.length >= 2) break
    if (item.raw && (!item.raw.type || !item.raw.type.startsWith('image/'))) {
      ElMessage.error('只能选择图片文件')
      continue
    }
    let url = item.url || ''
    if (!url && item.raw) {
      try {
        url = URL.createObjectURL(item.raw)
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
      URL.revokeObjectURL(url)
      supplementOwnedUrls.delete(url)
    }
  }
  supplementImageFiles.value = next
  supplementForm.images = next.map((item) => item.url || '').filter(Boolean)
}

function handleSupplementImageChange(_file: UploadFile, files: UploadFiles) { syncSupplementImages(files) }
function handleSupplementImageRemove(_file: UploadFile, files: UploadFiles) { syncSupplementImages(files) }
function handleSupplementExceed() { ElMessage.error('图片最多上传 2 张') }

async function submitSupplement() {
  if (supplementSaving.value || !supplementRecord.value) return
  const rawAmount = supplementForm.amount as unknown
  const payload: BlacklistPayload = {
    ...supplementForm,
    amount: rawAmount === '' ? null : supplementForm.amount,
    images: [...supplementForm.images]
  }
  const errors = validateBlacklistPayload(payload)
  if (errors.length) { ElMessage.error(errors[0]); return }
  const recordId = supplementRecord.value.id
  supplementSaving.value = true
  try {
    await ElMessageBox.confirm('确认保存补充的黑名单客户信息？', '确认补充信息', {
      confirmButtonText: '确认保存', cancelButtonText: '取消', type: 'warning'
    })
    await blacklistStore.updateRecord(recordId, payload)
    if (disposed) return
    ElMessage.success('黑名单信息已补充')
    supplementVisible.value = false
  } catch {
    // Cancellation and request errors intentionally retain every field and image.
  } finally {
    if (!disposed) supplementSaving.value = false
  }
}
</script>

<style scoped lang="scss">
.mobile-blacklist-page { display: grid; min-width: 0; gap: 16px; }
.mobile-blacklist-page__error { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; color: #b42318; background: #fef3f2; border: 1px solid #fecdca; border-radius: 10px; }
.mobile-blacklist-page__error button { min-height: 44px; padding: 8px 12px; color: #b42318; background: #fff; border: 1px solid currentcolor; border-radius: 8px; }
.blacklist-form-grid { display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 12px; }
.mobile-blacklist-supplement { display: grid; gap: 12px; }
.mobile-blacklist-supplement > label { display: grid; min-width: 0; gap: 6px; color: #475569; }
.mobile-blacklist-supplement input, .mobile-blacklist-supplement textarea { box-sizing: border-box; width: 100%; min-width: 0; min-height: 44px; padding: 9px 11px; color: #0f172a; background: #fff; border: 1px solid #aebdcd; border-radius: 8px; }
.mobile-blacklist-supplement textarea { min-height: 88px; resize: vertical; }
@media (max-width: 900px) { .blacklist-form-grid { grid-template-columns: 1fr; } }
</style>
