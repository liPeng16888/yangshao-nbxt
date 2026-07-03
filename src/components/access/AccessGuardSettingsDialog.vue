<template>
  <el-dialog v-model="settingsVisible" title="访问密码设置" width="520px" append-to-body @open="syncForm">
    <el-form label-position="top" class="access-settings-form">
      <el-alert
        title="财务、报表、黑名单和历史日期查看共用这套访问密码。关闭访问密码时需要输入当前访问密码。"
        type="info"
        show-icon
        :closable="false"
      />
      <el-form-item label="启用访问密码">
        <el-switch :model-value="form.enabled" active-text="启用" inactive-text="关闭" @change="handleEnabledChange" />
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

  <el-dialog v-model="disableConfirmVisible" title="关闭访问密码确认" width="380px" append-to-body @closed="resetDisableConfirm">
    <div class="disable-confirm-text">请输入当前访问密码，验证通过后才能关闭访问密码。</div>
    <el-input v-model="disablePassword" type="password" show-password autofocus placeholder="请输入当前访问密码" @keyup.enter="confirmDisableAccessPassword" />
    <template #footer>
      <el-button @click="disableConfirmVisible = false">取消</el-button>
      <el-button type="primary" :loading="disableConfirming" @click="confirmDisableAccessPassword">确认关闭</el-button>
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
const disableConfirmVisible = ref(false)
const disableConfirming = ref(false)
const disablePassword = ref('')
const form = reactive({
  enabled: false,
  ttlMinutes: 5,
  password: '',
  confirmPassword: '',
  disablePassword: '',
  recoveryPrompt: '',
  recoveryAnswer: ''
})

function syncForm() {
  form.enabled = settings.value.enabled
  form.ttlMinutes = settings.value.ttlMinutes
  form.password = ''
  form.confirmPassword = ''
  form.disablePassword = ''
  form.recoveryPrompt = settings.value.recoveryPrompt
  form.recoveryAnswer = ''
}

function handleEnabledChange(value: string | number | boolean) {
  const nextEnabled = Boolean(value)
  if (nextEnabled) {
    form.enabled = true
    form.disablePassword = ''
    return
  }
  if (settings.value.enabled && settings.value.password) {
    disablePassword.value = ''
    disableConfirmVisible.value = true
    return
  }
  form.enabled = false
}

async function confirmDisableAccessPassword() {
  const password = disablePassword.value.trim()
  if (!password) {
    ElMessage.warning('请输入访问密码')
    return
  }
  disableConfirming.value = true
  try {
    if (password !== settings.value.password) {
      ElMessage.warning('访问密码不正确，无法关闭')
      return
    }
    form.enabled = false
    form.disablePassword = password
    disableConfirmVisible.value = false
    ElMessage.success('已通过关闭验证')
  } finally {
    disableConfirming.value = false
  }
}

function resetDisableConfirm() {
  disablePassword.value = ''
  disableConfirming.value = false
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
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存访问密码设置失败')
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

.disable-confirm-text {
  margin-bottom: 12px;
  color: #475569;
  line-height: 1.6;
}
</style>
