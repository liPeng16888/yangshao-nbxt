<template>
  <main class="login-page">
    <section class="login-card">
      <div class="login-title">
        <BrandLogo :size="48" />
        <div>
          <h1>仰韶化验室后台</h1>
          <p>后台管理系统</p>
        </div>
      </div>
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item label="账号">
          <el-input v-model.trim="form.account" size="large" autocomplete="username" :disabled="loading" autofocus />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" size="large" autocomplete="current-password" :disabled="loading" show-password @keyup.enter="submit" />
        </el-form-item>
        <div class="remember-login">
          <el-checkbox v-model="rememberCredentials" :disabled="loading" @change="handleRememberChange">记住账号密码</el-checkbox>
          <span>仅在此浏览器保存，请在本人设备上使用</span>
        </div>
        <el-button class="login-submit" type="primary" size="large" :loading="loading" @click="submit">登录</el-button>
        <div v-if="savedCredentials" class="saved-login">
          <div class="saved-login__account">已记住账号：{{ savedCredentials.account }}</div>
          <div class="saved-login__actions">
            <el-button :disabled="loading" @click="quickLogin">快捷登录</el-button>
            <el-button text :disabled="loading" @click="handleForget">清除已记住信息</el-button>
          </div>
        </div>
      </el-form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { adminLogin, useAdminMocks } from '../api'
import { useRememberedLogin } from '../../../shared/useRememberedLogin'
import BrandLogo from '../../../shared/BrandLogo.vue'
import { feishuLoginReturn } from '../../../shared/ai/feishuReturn'

const router = useRouter()
const loading = ref(false)
const {
  form, savedCredentials, rememberCredentials,
  forgetCredentials, saveAfterLogin, prepareQuickLogin
} = useRememberedLogin('admin')

async function submit() {
  if (loading.value) return
  if (!form.account || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    const credentials = { ...form }
    await adminLogin(credentials)
    if (!saveAfterLogin(credentials)) ElMessage.warning('浏览器无法保存登录信息，请检查浏览器存储设置')
    await router.push(feishuLoginReturn('admin', true))
  } catch (error) {
    // Real API failures are displayed by the request interceptor.
    if (useAdminMocks) ElMessage.error(error instanceof Error ? error.message : '登录失败，请重试')
  } finally {
    loading.value = false
  }
}

function quickLogin() {
  if (loading.value || !prepareQuickLogin()) return
  void submit()
}

function handleRememberChange(value: unknown) {
  if (!value && !forgetCredentials()) {
    rememberCredentials.value = true
    ElMessage.warning('无法清除登录信息，请检查浏览器存储设置')
  }
}

function handleForget() {
  if (!forgetCredentials()) {
    ElMessage.warning('无法清除登录信息，请检查浏览器存储设置')
    return
  }
  form.account = ''
  form.password = ''
  ElMessage.success('已清除记住的账号密码')
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--ui-bg);
}

.login-card {
  width: min(420px, calc(100vw - 32px));
  padding: 34px;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 8px;
  box-shadow: var(--ui-floating-shadow);
  border: 1px solid var(--ui-line);
}

.login-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
}

.login-title h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
}

.login-title p {
  margin: 6px 0 0;
  color: var(--ui-text-muted);
}

.login-submit {
  width: 100%;
}

.remember-login {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
}

.remember-login span {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.saved-login {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--ui-line-soft);
}

.saved-login__account {
  color: var(--ui-text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.saved-login__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.saved-login__actions .el-button {
  margin-left: 0;
}
</style>
