<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue'
import type { UploadFile, UploadFiles, UploadUserFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { uploadImages } from '@/api/upload'
import type { BlacklistPayload } from '@/types/blacklist'
import { createOwnedImagePreview, revokeOwnedImagePreview, validateBlacklistImage } from '@/utils/blacklistImages'
import { validateBlacklistPayload } from '@/utils/validators'

const props = defineProps<{
  save: (payload: BlacklistPayload) => Promise<void>
}>()

const form = reactive({
  phone: '',
  wechat: '',
  wechatNickname: '',
  amount: '',
  other: '',
  note: ''
})
const imageFiles = ref<UploadUserFile[]>([])
const ownedImageUrls = new Set<string>()
const submitting = ref(false)
let uploadedUrlsByFile = new WeakMap<File, string>()
let disposed = false

onBeforeUnmount(() => {
  disposed = true
  releaseOwnedUrls()
})

function syncImageFiles(files: UploadFiles) {
  const next: UploadUserFile[] = []
  for (const item of files) {
    if (next.length >= 2) break
    if (item.raw) {
      const error = validateBlacklistImage(item.raw)
      if (error) {
        ElMessage.error(error)
        continue
      }
    }
    let url = item.url || ''
    if (!url && item.raw) {
      try {
        url = createOwnedImagePreview(item.raw)
        ownedImageUrls.add(url)
      } catch {
        ElMessage.error('图片预览失败，请重新选择')
        continue
      }
    }
    if (url) next.push({ ...item, url })
  }
  const activeUrls = new Set(next.map((item) => item.url).filter((url): url is string => Boolean(url)))
  for (const url of [...ownedImageUrls]) {
    if (!activeUrls.has(url)) {
      revokeOwnedImagePreview(url)
      ownedImageUrls.delete(url)
    }
  }
  imageFiles.value = next
}

function handleImageChange(_file: UploadFile, files: UploadFiles) {
  syncImageFiles(files)
}

function handleImageRemove(_file: UploadFile, files: UploadFiles) {
  syncImageFiles(files)
}

function handleExceed() {
  ElMessage.error('图片最多上传 2 张')
}

function releaseOwnedUrls() {
  for (const url of ownedImageUrls) revokeOwnedImagePreview(url)
  ownedImageUrls.clear()
}

function reset() {
  releaseOwnedUrls()
  Object.assign(form, { phone: '', wechat: '', wechatNickname: '', amount: '', other: '', note: '' })
  imageFiles.value = []
  uploadedUrlsByFile = new WeakMap<File, string>()
}

async function persistFiles(files: File[]) {
  const missing = files.filter((file) => !uploadedUrlsByFile.has(file))
  if (missing.length) {
    const urls = await uploadImages(missing)
    missing.forEach((file, index) => uploadedUrlsByFile.set(file, urls[index]))
  }
  return files.map((file) => uploadedUrlsByFile.get(file)).filter((url): url is string => Boolean(url))
}

function draftSignature() {
  return JSON.stringify({ ...form, images: imageFiles.value.map((item) => [item.name, item.url, item.raw?.size, item.raw?.lastModified]) })
}

async function submit() {
  if (submitting.value) return
  const amountText = String(form.amount).trim()
  const payload: BlacklistPayload = {
    phone: form.phone.trim(),
    wechat: form.wechat.trim(),
    wechatNickname: form.wechatNickname.trim(),
    amount: amountText ? Number(amountText) : null,
    images: imageFiles.value.map((item) => item.url || '').filter(Boolean),
    other: form.other.trim(),
    note: form.note.trim()
  }
  const errors = validateBlacklistPayload(payload)
  if (errors.length) {
    ElMessage.error(errors[0])
    return
  }
  submitting.value = true
  const submittedDraft = draftSignature()
  try {
    const localFiles = imageFiles.value.flatMap((item) => item.raw ? [item.raw] : [])
    const uploadedUrls = await persistFiles(localFiles)
    await props.save({ ...payload, images: uploadedUrls })
    if (!disposed && draftSignature() === submittedDraft) reset()
  } catch {
    // The request layer owns error presentation. Keeping the draft is intentional.
  } finally {
    if (!disposed) submitting.value = false
  }
}
</script>

<template>
  <div class="mobile-blacklist-form" data-testid="mobile-blacklist-create">
    <header>
      <h2>新增黑名单</h2>
      <p class="muted">至少填写一项非图片信息。</p>
    </header>
    <div class="mobile-blacklist-form__fields">
      <label><span>电话号</span><input v-model="form.phone" :disabled="submitting" data-testid="blacklist-create-phone" class="mobile-touch-target" type="tel" autocomplete="tel" /></label>
      <label><span>微信号</span><input v-model="form.wechat" :disabled="submitting" data-testid="blacklist-create-wechat" class="mobile-touch-target" type="text" autocomplete="off" /></label>
      <label><span>微信昵称</span><input v-model="form.wechatNickname" :disabled="submitting" data-testid="blacklist-create-nickname" class="mobile-touch-target" type="text" autocomplete="off" /></label>
      <label><span>金额</span><input v-model="form.amount" :disabled="submitting" data-testid="blacklist-create-amount" class="mobile-touch-target" type="number" inputmode="decimal" min="0" step="0.01" /></label>
      <label><span>其他</span><input v-model="form.other" :disabled="submitting" data-testid="blacklist-create-other" class="mobile-touch-target" type="text" autocomplete="off" /></label>
      <label><span>备注</span><textarea v-model="form.note" :disabled="submitting" data-testid="blacklist-create-note" rows="3" /></label>
      <label class="mobile-blacklist-form__images">
        <span>图片（最多 2 张）</span>
        <el-upload
          v-model:file-list="imageFiles"
          data-testid="blacklist-create-images"
          :auto-upload="false"
          :disabled="submitting"
          aria-label="选择黑名单图片"
          :limit="2"
          accept="image/png,image/jpeg,image/webp,image/gif"
          list-type="picture-card"
          :on-change="handleImageChange"
          :on-remove="handleImageRemove"
          :on-exceed="handleExceed"
        ><el-icon><Plus /></el-icon></el-upload>
        <small data-testid="blacklist-create-image-count">已选 {{ imageFiles.length }} / 2 张</small>
      </label>
    </div>
    <button
      class="mobile-blacklist-form__save mobile-touch-target"
      data-testid="blacklist-create-save"
      type="button"
      :disabled="submitting"
      @click="submit"
    >{{ submitting ? '保存中…' : '保存黑名单' }}</button>
  </div>
</template>

<style scoped lang="scss">
.mobile-blacklist-form {
  display: grid;
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid #d8e1eb;

  h2,
  p {
    margin: 0;
  }

  p {
    margin-top: 4px;
  }
}

.mobile-blacklist-form__fields {
  display: grid;
  gap: 12px;
}

.mobile-blacklist-form__fields > label {
  display: grid;
  min-width: 0;
  gap: 6px;
  color: #475569;
}

.mobile-blacklist-form__fields input,
.mobile-blacklist-form__fields textarea {
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

.mobile-blacklist-form__fields textarea {
  min-height: 88px;
  resize: vertical;
}

.mobile-blacklist-form__images small {
  color: #64748b;
}

.mobile-blacklist-form__save {
  width: 100%;
  min-height: 44px;
  color: #fff;
  font-weight: 700;
  background: #b42318;
  border: 0;
  border-radius: 8px;
}

.mobile-blacklist-form__save:disabled {
  opacity: 0.65;
}
</style>
