<template>
  <div class="auth-page">
    <section class="auth-card">
      <div class="auth-title">
        <BrandLogo class="auth-title__mark" :size="48" />
        <div>
          <h1>仰韶化验室内部系统</h1>
          <p>矿石检测数据、财务、报表与风险客户联动管理</p>
        </div>
      </div>

      <el-tabs v-model="activeTab" stretch>
        <el-tab-pane label="登录" name="login">
          <el-form ref="loginFormRef" :model="loginForm" :rules="loginRules" label-position="top" @submit.prevent="handleLogin">
            <el-form-item label="账号" prop="account">
              <el-input v-model.trim="loginForm.account" autocomplete="username" :disabled="loginPending" />
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input v-model="loginForm.password" type="password" autocomplete="current-password" show-password :disabled="loginPending" @keyup.enter="handleLogin" />
            </el-form-item>
            <div class="remember-login">
              <el-checkbox v-model="rememberCredentials" :disabled="loginPending" @change="handleRememberChange">记住账号密码</el-checkbox>
              <span>仅在此浏览器保存，请在本人设备上使用</span>
            </div>
            <el-button class="auth-submit" type="primary" :loading="loginPending" @click="handleLogin">登录</el-button>
            <div v-if="savedCredentials" class="saved-login">
              <div class="saved-login__account">已记住账号：{{ savedCredentials.account }}</div>
              <div class="saved-login__actions">
                <el-button :disabled="loginPending" @click="handleQuickLogin">快捷登录</el-button>
                <el-button text :disabled="loginPending" @click="handleForget">清除已记住信息</el-button>
              </div>
            </div>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="注册" name="register">
          <el-form ref="registerFormRef" :model="registerForm" :rules="registerRules" label-position="top" @submit.prevent>
            <el-form-item label="用户名" prop="username">
              <el-input v-model.trim="registerForm.username" />
            </el-form-item>
            <el-form-item label="账号" prop="account">
              <el-input v-model.trim="registerForm.account" autocomplete="username" />
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input v-model="registerForm.password" type="password" autocomplete="new-password" show-password />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input v-model="registerForm.confirmPassword" type="password" autocomplete="new-password" show-password />
            </el-form-item>
            <el-form-item label="一次性注册码" prop="inviteCode">
              <el-input v-model.trim="registerForm.inviteCode" />
            </el-form-item>
            <el-button class="auth-submit" type="primary" :loading="authStore.loading" @click="handleRegister">注册并进入系统</el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useMocks } from '@/utils/request'
import { useRememberedLogin } from '../../../shared/useRememberedLogin'
import BrandLogo from '../../../shared/BrandLogo.vue'
import { feishuLoginReturn } from '../../../shared/ai/feishuReturn'

const router = useRouter()
const authStore = useAuthStore()
const activeTab = ref<'login' | 'register'>('login')
const loginFormRef = ref<FormInstance>()
const registerFormRef = ref<FormInstance>()

const loginPending = ref(false)
const {
  form: loginForm, savedCredentials, rememberCredentials,
  forgetCredentials, saveAfterLogin, prepareQuickLogin
} = useRememberedLogin('frontend')

const registerForm = reactive({
  username: '',
  account: '',
  password: '',
  confirmPassword: '',
  inviteCode: ''
})

const loginRules: FormRules = {
  account: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const registerRules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  account: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== registerForm.password) callback(new Error('两次输入的密码不一致'))
        else callback()
      },
      trigger: 'blur'
    }
  ],
  inviteCode: [{ required: true, message: '请输入一次性注册码', trigger: 'blur' }]
}

async function handleLogin() {
  if (loginPending.value) return
  loginPending.value = true
  try {
    const valid = await loginFormRef.value?.validate().catch(() => false)
    if (!valid) return
    const credentials = { ...loginForm }
    await authStore.loginWithPassword(credentials)
    if (!saveAfterLogin(credentials)) ElMessage.warning('浏览器无法保存登录信息，请检查浏览器存储设置')
    ElMessage.success('登录成功')
    await router.replace(feishuLoginReturn('frontend', true))
  } catch (error) {
    // Real API failures are displayed by the request interceptor.
    if (useMocks) ElMessage.error(error instanceof Error ? error.message : '登录失败，请重试')
  } finally {
    loginPending.value = false
  }
}

function handleQuickLogin() {
  if (loginPending.value || !prepareQuickLogin()) return
  void handleLogin()
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
  loginForm.account = ''
  loginForm.password = ''
  loginFormRef.value?.clearValidate()
  ElMessage.success('已清除记住的账号密码')
}

async function handleRegister() {
  await registerFormRef.value?.validate()
  await authStore.registerWithInvite(registerForm)
  ElMessage.success('注册成功')
  router.replace(feishuLoginReturn('frontend', true))
}
</script>

<style scoped lang="scss">
.auth-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 28px;
  background: var(--ui-bg);
}

.auth-card {
  width: min(440px, 100%);
  padding: 28px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--ui-line);
  border-radius: 8px;
  box-shadow: var(--ui-floating-shadow);
}

.auth-title {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 20px;

  h1 {
    margin: 0;
    color: var(--ui-text);
    font-size: 24px;
    line-height: 1.3;
  }

  p {
    margin: 6px 0 0;
    color: var(--ui-text-muted);
    font-size: 13px;
  }
}

.auth-title__mark {
  width: 48px;
  height: 48px;
}

@media (max-width: 480px) {
  .auth-title h1 {
    font-size: 22px;
  }
}

.auth-submit {
  width: 100%;
  margin-top: 6px;
}

.remember-login {
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;

  span {
    color: var(--ui-text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
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

  .el-button { margin-left: 0; }
}
</style>
