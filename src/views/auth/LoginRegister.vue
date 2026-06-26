<template>
  <div class="auth-page">
    <section class="auth-card">
      <div class="auth-title">
        <div class="auth-title__mark">仰</div>
        <div>
          <h1>仰韶化验室内部系统</h1>
          <p>矿石检测数据、财务、报表与风险客户联动管理</p>
        </div>
      </div>

      <el-tabs v-model="activeTab" stretch>
        <el-tab-pane label="登录" name="login">
          <el-form ref="loginFormRef" :model="loginForm" :rules="loginRules" label-position="top" @submit.prevent>
            <el-form-item label="账号" prop="account">
              <el-input v-model.trim="loginForm.account" autocomplete="username" />
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input v-model="loginForm.password" type="password" autocomplete="current-password" show-password />
            </el-form-item>
            <el-button class="auth-submit" type="primary" :loading="authStore.loading" @click="handleLogin">登录</el-button>
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

const router = useRouter()
const authStore = useAuthStore()
const activeTab = ref<'login' | 'register'>('login')
const loginFormRef = ref<FormInstance>()
const registerFormRef = ref<FormInstance>()

const loginForm = reactive({
  account: 'admin',
  password: 'admin123'
})

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
  await loginFormRef.value?.validate()
  await authStore.loginWithPassword(loginForm)
  ElMessage.success('登录成功')
  router.replace('/data')
}

async function handleRegister() {
  await registerFormRef.value?.validate()
  await authStore.registerWithInvite(registerForm)
  ElMessage.success('注册成功')
  router.replace('/data')
}
</script>

<style scoped lang="scss">
.auth-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 28px;
  background:
    linear-gradient(120deg, rgba(8, 20, 34, 0.92), rgba(29, 39, 50, 0.86)),
    repeating-linear-gradient(35deg, rgba(255, 255, 255, 0.04) 0 1px, transparent 1px 18px),
    radial-gradient(circle at 25% 30%, rgba(190, 74, 43, 0.2), transparent 26%),
    radial-gradient(circle at 72% 64%, rgba(88, 130, 150, 0.22), transparent 28%),
    #0b1826;
}

.auth-card {
  width: min(440px, 100%);
  padding: 28px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(226, 232, 240, 0.28);
  border-radius: 8px;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.34);
}

.auth-title {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 20px;

  h1 {
    margin: 0;
    color: #142033;
    font-size: 24px;
    line-height: 1.3;
  }

  p {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 13px;
  }
}

.auth-title__mark {
  display: grid;
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  place-items: center;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(145deg, #d9472f, #8f1d16);
  border-radius: 8px;
}

.auth-submit {
  width: 100%;
  margin-top: 6px;
}
</style>
