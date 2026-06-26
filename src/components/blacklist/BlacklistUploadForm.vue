<template>
  <section class="panel">
    <div class="panel__header">
      <h2>新增黑名单</h2>
    </div>
    <div class="panel__body">
      <el-form label-position="top">
        <div class="blacklist-form-grid">
          <el-form-item label="电话号">
            <el-input v-model.trim="form.phone" />
          </el-form-item>
          <el-form-item label="微信号">
            <el-input v-model.trim="form.wechat" />
          </el-form-item>
          <el-form-item label="微信昵称">
            <el-input v-model.trim="form.wechatNickname" />
          </el-form-item>
          <el-form-item label="金额">
            <el-input-number v-model="form.amount" :precision="2" :min="0" controls-position="right" />
          </el-form-item>
        </div>
        <el-form-item label="图片">
          <el-upload
            :auto-upload="false"
            :limit="2"
            list-type="picture-card"
            :on-change="handleImageChange"
            :on-remove="handleImageRemove"
            :on-exceed="handleExceed"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        <el-form-item label="其他">
          <el-input v-model.trim="form.other" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model.trim="form.note" type="textarea" :rows="3" />
        </el-form-item>
        <el-button type="danger" :loading="submitting" @click="submit">保存黑名单</el-button>
      </el-form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { UploadFile, UploadFiles } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { BlacklistPayload } from '@/types/blacklist'
import { validateBlacklistPayload } from '@/utils/validators'

const emit = defineEmits<{
  submit: [payload: BlacklistPayload]
}>()

const submitting = ref(false)
const form = reactive<BlacklistPayload>({
  phone: '',
  wechat: '',
  wechatNickname: '',
  amount: null,
  images: [],
  other: '',
  note: ''
})

function handleImageChange(_file: UploadFile, files: UploadFiles) {
  form.images = files.map((item) => (item.raw ? URL.createObjectURL(item.raw) : item.url || '')).filter(Boolean)
}

function handleImageRemove(_file: UploadFile, files: UploadFiles) {
  form.images = files.map((item) => item.url || (item.raw ? URL.createObjectURL(item.raw) : '')).filter(Boolean)
}

function handleExceed() {
  ElMessage.error('图片最多上传 2 张')
}

async function submit() {
  const errors = validateBlacklistPayload(form)
  if (errors.length) {
    ElMessage.error(errors[0])
    return
  }
  submitting.value = true
  try {
    emit('submit', { ...form, images: [...form.images] })
    Object.assign(form, {
      phone: '',
      wechat: '',
      wechatNickname: '',
      amount: null,
      images: [],
      other: '',
      note: ''
    })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.blacklist-form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 12px;
}

@media (max-width: 900px) {
  .blacklist-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
