<template>
  <el-dialog v-model="settingsVisible" title="访问密码设置" width="520px" append-to-body @open="syncForm">
    <el-form label-position="top" class="access-settings-form">
      <el-alert
        title="财务、报表和历史日期查看共用这套访问密码。关闭后会直接进入。"
        type="info"
        show-icon
        :closable="false"
      />
      <el-form-item label="启用访问密码">
        <el-switch v-model="form.enabled" active-text="启用" inactive-text="关闭" />
      </el-form-item>
      <el-form-item label="免输密码时长">
        <el-input-number v-model="form.ttlMinutes" :min="1" :max="1440" :step="1" :disabled="!form.enabled" />
        <span class="access-settings-form__unit">分钟</span>
      </el-form-item>
      <el-form-item label="访问密码">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          :disabled="!form.enabled"
          :placeholder="settings.password ? '留空则不修改当前访问密码' : '请输入访问密码，至少 4 位'"
        />
      </el-form-item>
      <el-form-item label="确认访问密码">
        <el-input v-model="form.confirmPassword" type="password" show-password :disabled="!form.enabled" />
      </el-form-item>
      <el-form-item label="找回密码提示词">
        <el-input v-model="form.recoveryPrompt" :disabled="!form.enabled" placeholder="例如：常用管理员口令提示" />
      </el-form-item>
      <el-form-item label="找回答案">
        <el-input
          v-model="form.recoveryAnswer"
          :disabled="!form.enabled"
          :placeholder="settings.recoveryAnswer ? '留空则不修改当前找回答案' : '请输入找回答案'"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="settingsVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="saveSettings">保存设置</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { useAccessGuardStore } from '@/stores/accessGuard'

const accessGuard = useAccessGuardStore()
const { settings, settingsVisible } = storeToRefs(accessGuard)
const saving = ref(false)
const form = reactive({
  enabled: false,
  ttlMinutes: 5,
  password: '',
  confirmPassword: '',
  recoveryPrompt: '',
  recoveryAnswer: ''
})

function syncForm() {
  form.enabled = settings.value.enabled
  form.ttlMinutes = settings.value.ttlMinutes
  form.password = ''
  form.confirmPassword = ''
  form.recoveryPrompt = settings.value.recoveryPrompt
  form.recoveryAnswer = ''
}

async function saveSettings() {
  saving.value = true
  try {
    const result = await accessGuard.saveSettings(form)
    if (result.ok) {
      settingsVisible.value = false
      ElMessage.success(result.message)
    } else {
      ElMessage.warning(result.message)
    }
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.access-settings-form {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.access-settings-form__unit {
  margin-left: 10px;
  color: #64748b;
}
</style>
