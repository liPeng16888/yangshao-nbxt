<template>
  <el-dialog
    :model-value="dialogVisible"
    :title="accessTitle"
    width="440px"
    append-to-body
    class="access-guard-dialog"
    @update:model-value="handleVisibleChange"
    @closed="resetForm"
  >
    <div class="access-guard-dialog__message">{{ accessMessage }}</div>

    <el-form v-if="mode === 'password'" label-position="top" @submit.prevent>
      <el-form-item label="访问密码">
        <el-input v-model="password" type="password" show-password autofocus @keyup.enter="submitPassword" />
      </el-form-item>
      <el-button link type="primary" class="access-guard-dialog__link" @click="mode = 'recovery'">忘记密码</el-button>
    </el-form>

    <el-form v-else label-position="top" @submit.prevent>
      <el-alert
        :title="settings.recoveryPrompt ? `提示词：${settings.recoveryPrompt}` : '当前还没有设置找回提示词'"
        type="info"
        show-icon
        :closable="false"
        class="access-guard-dialog__alert"
      />
      <el-form-item label="找回答案">
        <el-input v-model="recoveryForm.recoveryAnswer" />
      </el-form-item>
      <el-form-item label="新访问密码">
        <el-input v-model="recoveryForm.newPassword" type="password" show-password placeholder="至少 4 位" />
      </el-form-item>
      <el-form-item label="确认新访问密码">
        <el-input v-model="recoveryForm.confirmPassword" type="password" show-password @keyup.enter="submitRecoveryReset" />
      </el-form-item>
      <el-button link type="primary" class="access-guard-dialog__link" @click="mode = 'password'">返回输入密码</el-button>
    </el-form>

    <template #footer>
      <el-button @click="cancelAccess">取消</el-button>
      <el-button v-if="mode === 'password'" type="primary" :loading="loading" @click="submitPassword">确认进入</el-button>
      <el-button v-else type="primary" :loading="loading" @click="submitRecoveryReset">重置并进入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { useAccessGuardStore } from '@/stores/accessGuard'

const accessGuard = useAccessGuardStore()
const { dialogVisible, accessTitle, accessMessage, settings } = storeToRefs(accessGuard)
const mode = ref<'password' | 'recovery'>('password')
const loading = ref(false)
const password = ref('')
const recoveryForm = reactive({
  recoveryAnswer: '',
  newPassword: '',
  confirmPassword: ''
})

function handleVisibleChange(visible: boolean) {
  if (!visible) accessGuard.cancelAccess()
}

function cancelAccess() {
  accessGuard.cancelAccess()
}

function resetForm() {
  mode.value = 'password'
  password.value = ''
  recoveryForm.recoveryAnswer = ''
  recoveryForm.newPassword = ''
  recoveryForm.confirmPassword = ''
  loading.value = false
}

async function submitPassword() {
  loading.value = true
  try {
    const result = await accessGuard.verifyPassword(password.value)
    if (result.ok) {
      ElMessage.success(result.message)
    } else {
      ElMessage.warning(result.message)
    }
  } finally {
    loading.value = false
  }
}

async function submitRecoveryReset() {
  loading.value = true
  try {
    const result = await accessGuard.resetPasswordWithRecovery(recoveryForm)
    if (result.ok) {
      ElMessage.success(result.message)
    } else {
      ElMessage.warning(result.message)
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.access-guard-dialog__message {
  margin-bottom: 14px;
  color: #475569;
  line-height: 1.6;
}

.access-guard-dialog__link {
  padding-left: 0;
}

.access-guard-dialog__alert {
  margin-bottom: 14px;
}
</style>
