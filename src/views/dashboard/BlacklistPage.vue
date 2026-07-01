<template>
  <div class="page-stack">
    <BlacklistTable
      :records="blacklistStore.records"
      :keyword="blacklistStore.keyword"
      :loading="blacklistStore.loading"
      :highlight-id="highlightId"
      :current-username="authStore.user?.username || ''"
      :deleting-id="blacklistStore.deletingId"
      :updating-id="blacklistStore.updatingId"
      @search="blacklistStore.loadRecords"
      @supplement="openSupplement"
      @delete="handleDelete"
    />
    <BlacklistUploadForm @submit="handleCreate" />

    <el-dialog
      v-model="supplementVisible"
      title="补充黑名单客户信息"
      width="760px"
      append-to-body
      @closed="resetSupplementForm"
    >
      <el-form label-position="top">
        <div class="blacklist-form-grid">
          <el-form-item label="电话号">
            <el-input v-model.trim="supplementForm.phone" />
          </el-form-item>
          <el-form-item label="微信号">
            <el-input v-model.trim="supplementForm.wechat" />
          </el-form-item>
          <el-form-item label="微信昵称">
            <el-input v-model.trim="supplementForm.wechatNickname" />
          </el-form-item>
          <el-form-item label="金额">
            <el-input-number v-model="supplementForm.amount" :precision="2" :min="0" controls-position="right" />
          </el-form-item>
        </div>
        <el-form-item label="图片">
          <el-upload
            v-model:file-list="supplementImageFiles"
            :auto-upload="false"
            :limit="2"
            list-type="picture-card"
            :on-change="handleSupplementImageChange"
            :on-remove="handleSupplementImageRemove"
            :on-exceed="handleSupplementExceed"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        <el-form-item label="其他">
          <el-input v-model.trim="supplementForm.other" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model.trim="supplementForm.note" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="supplementVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="Boolean(supplementRecord && blacklistStore.updatingId === supplementRecord.id)"
          @click="submitSupplement"
        >
          确认补充
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { UploadFile, UploadFiles, UploadUserFile } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import BlacklistTable from '@/components/blacklist/BlacklistTable.vue'
import BlacklistUploadForm from '@/components/blacklist/BlacklistUploadForm.vue'
import { useAuthStore } from '@/stores/auth'
import { useBlacklistStore } from '@/stores/blacklist'
import type { BlacklistPayload, BlacklistRecord } from '@/types/blacklist'
import { validateBlacklistPayload } from '@/utils/validators'

const route = useRoute()
const authStore = useAuthStore()
const blacklistStore = useBlacklistStore()
const highlightId = computed(() => (typeof route.query.hit === 'string' ? route.query.hit : ''))
const supplementVisible = ref(false)
const supplementRecord = ref<BlacklistRecord | null>(null)
const supplementImageFiles = ref<UploadUserFile[]>([])
const supplementForm = reactive<BlacklistPayload>({
  phone: '',
  wechat: '',
  wechatNickname: '',
  amount: null,
  images: [],
  other: '',
  note: ''
})

onMounted(() => {
  blacklistStore.loadRecords()
})

watch(
  () => route.query.hit,
  () => {
    blacklistStore.loadRecords()
  }
)

async function handleCreate(payload: BlacklistPayload) {
  const record = await blacklistStore.addRecord(payload)
  ElMessage.success('黑名单已保存')
  await blacklistStore.loadRecords()
  if (record.id) {
    window.setTimeout(() => {
      document.querySelector('.blacklist-row--highlight')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 120)
  }
}

async function handleDelete(id: string) {
  await ElMessageBox.confirm('确认删除这条黑名单记录？删除后不可恢复。', '删除黑名单', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
    confirmButtonClass: 'el-button--danger'
  })
  await blacklistStore.deleteRecord(id)
  ElMessage.success('黑名单已删除')
}

function openSupplement(row: BlacklistRecord) {
  supplementRecord.value = row
  Object.assign(supplementForm, {
    phone: row.phone || '',
    wechat: row.wechat || '',
    wechatNickname: row.wechatNickname || '',
    amount: row.amount ?? null,
    images: [...(row.images || [])],
    other: row.other || '',
    note: row.note || ''
  })
  supplementImageFiles.value = (row.images || []).map((url, index) => ({
    name: `黑名单图片${index + 1}`,
    url
  }))
  supplementVisible.value = true
}

function resetSupplementForm() {
  supplementRecord.value = null
  supplementImageFiles.value = []
  Object.assign(supplementForm, {
    phone: '',
    wechat: '',
    wechatNickname: '',
    amount: null,
    images: [],
    other: '',
    note: ''
  })
}

function handleSupplementImageChange(_file: UploadFile, files: UploadFiles) {
  supplementForm.images = files.map((item) => (item.raw ? URL.createObjectURL(item.raw) : item.url || '')).filter(Boolean)
}

function handleSupplementImageRemove(_file: UploadFile, files: UploadFiles) {
  supplementForm.images = files.map((item) => item.url || (item.raw ? URL.createObjectURL(item.raw) : '')).filter(Boolean)
}

function handleSupplementExceed() {
  ElMessage.error('图片最多上传 2 张')
}

async function submitSupplement() {
  if (!supplementRecord.value) return
  const errors = validateBlacklistPayload(supplementForm)
  if (errors.length) {
    ElMessage.error(errors[0])
    return
  }
  await ElMessageBox.confirm('确认保存补充的黑名单客户信息？', '确认补充信息', {
    confirmButtonText: '确认保存',
    cancelButtonText: '取消',
    type: 'warning'
  })
  await blacklistStore.updateRecord(supplementRecord.value.id, { ...supplementForm, images: [...supplementForm.images] })
  ElMessage.success('黑名单信息已补充')
  supplementVisible.value = false
}
</script>

<style scoped lang="scss">
.blacklist-form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 12px;
}

@media (max-width: 900px) {
  .blacklist-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
