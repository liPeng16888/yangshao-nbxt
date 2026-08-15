<template>
  <section class="panel">
    <div class="panel__header">
      <h2>新增黑名单</h2>
    </div>
    <div class="panel__body">
      <el-form label-position="top">
        <div class="blacklist-form-grid">
          <el-form-item label="电话号">
            <el-input v-model.trim="form.phone" :disabled="submitting" />
          </el-form-item>
          <el-form-item label="微信号">
            <el-input v-model.trim="form.wechat" :disabled="submitting" />
          </el-form-item>
          <el-form-item label="微信昵称">
            <el-input v-model.trim="form.wechatNickname" :disabled="submitting" />
          </el-form-item>
          <el-form-item label="金额">
            <el-input-number v-model="form.amount" :disabled="submitting" :precision="2" :min="0" controls-position="right" />
          </el-form-item>
        </div>
        <el-form-item label="图片">
          <el-upload
            v-model:file-list="imageFiles"
            :auto-upload="false"
            :disabled="submitting"
            :limit="2"
            accept="image/png,image/jpeg,image/webp,image/gif"
            list-type="picture-card"
            :on-change="handleImageChange"
            :on-remove="handleImageRemove"
            :on-exceed="handleExceed"
          >
            <el-icon aria-hidden="true"><Plus /></el-icon>
            <span class="blacklist-upload-trigger-label">选择黑名单图片</span>
          </el-upload>
        </el-form-item>
        <el-form-item label="其他">
          <el-input v-model.trim="form.other" :disabled="submitting" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model.trim="form.note" :disabled="submitting" type="textarea" :rows="3" />
        </el-form-item>
        <el-button type="danger" :loading="submitting" @click="submit">保存黑名单</el-button>
      </el-form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue'
import type { UploadFile, UploadFiles, UploadUserFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { uploadImages } from '@/api/upload'
import type { BlacklistPayload } from '@/types/blacklist'
import {
  createOwnedImagePreview,
  forgetOwnedImagePreview,
  registerOwnedImagePreview,
  revokeOwnedImagePreview,
  validateBlacklistImage
} from '@/utils/blacklistImages'
import { validateBlacklistPayload } from '@/utils/validators'

const props = defineProps<{
  save: (payload: BlacklistPayload) => Promise<void>
}>()

const submitting = ref(false)
const imageFiles = ref<UploadUserFile[]>([])
const ownedUrls = new Set<string>()
let uploadedUrlsByFile = new WeakMap<File, string>()
const form = reactive<BlacklistPayload>({
  phone: '',
  wechat: '',
  wechatNickname: '',
  amount: null,
  images: [],
  other: '',
  note: ''
})

onBeforeUnmount(forgetUrls)

function syncImages(files: UploadFiles, revokeMissing = true) {
  const next: UploadUserFile[] = []
  for (const item of files) {
    if (next.length >= 2) break
    if (item.raw) {
      const error = validateBlacklistImage(item.raw)
      if (error) {
        registerElementPreview(item)
        if (item.url) releaseUrl(item.url)
        ElMessage.error(error)
        continue
      }
    }
    let url = item.url || ''
    registerElementPreview(item)
    if (!url && item.raw) {
      try {
        url = createOwnedImagePreview(item.raw)
        ownedUrls.add(url)
      } catch {
        ElMessage.error('图片预览失败，请重新选择')
        continue
      }
    }
    if (url) next.push({ ...item, url })
  }
  const active = new Set(next.map((item) => item.url).filter((url): url is string => Boolean(url)))
  for (const url of [...ownedUrls]) {
    if (!active.has(url)) {
      if (revokeMissing) releaseUrl(url)
      else forgetUrl(url)
    }
  }
  imageFiles.value = next
}

function handleImageChange(_file: UploadFile, files: UploadFiles) { syncImages(files) }
function handleImageRemove(_file: UploadFile, files: UploadFiles) { syncImages(files, false) }

function handleExceed() {
  ElMessage.error('图片最多上传 2 张')
}

async function submit() {
  if (submitting.value) return
  const payload = { ...form, images: [] }
  const errors = validateBlacklistPayload(payload)
  if (errors.length) {
    ElMessage.error(errors[0])
    return
  }
  submitting.value = true
  const submittedDraft = draftSignature()
  try {
    const files = imageFiles.value.flatMap((item) => item.raw ? [item.raw] : [])
    const missing = files.filter((file) => !uploadedUrlsByFile.has(file))
    if (missing.length) {
      const urls = await uploadImages(missing)
      missing.forEach((file, index) => uploadedUrlsByFile.set(file, urls[index]))
    }
    const images = files.map((file) => uploadedUrlsByFile.get(file)).filter((url): url is string => Boolean(url))
    await props.save({ ...payload, images })
    if (draftSignature() === submittedDraft) reset()
  } catch {
    // Keep raw files and every draft field available for retry.
  } finally {
    submitting.value = false
  }
}

function draftSignature() {
  return JSON.stringify({ ...form, images: imageFiles.value.map((item) => [item.name, item.url, item.raw?.size, item.raw?.lastModified]) })
}

function releaseUrls() {
  for (const url of [...ownedUrls]) releaseUrl(url)
}

function forgetUrls() {
  for (const url of [...ownedUrls]) forgetUrl(url)
}

function registerElementPreview(item: UploadUserFile) {
  if (!item.raw || !item.url?.startsWith('blob:')) return
  registerOwnedImagePreview(item.url)
  ownedUrls.add(item.url)
}

function releaseUrl(url: string) {
  revokeOwnedImagePreview(url)
  ownedUrls.delete(url)
}

function forgetUrl(url: string) {
  forgetOwnedImagePreview(url)
  ownedUrls.delete(url)
}

function reset() {
  releaseUrls()
  Object.assign(form, { phone: '', wechat: '', wechatNickname: '', amount: null, images: [], other: '', note: '' })
  imageFiles.value = []
  uploadedUrlsByFile = new WeakMap<File, string>()
}
</script>

<style scoped lang="scss">
.blacklist-form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 12px;
}

.blacklist-upload-trigger-label {
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

@media (max-width: 900px) {
  .blacklist-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
