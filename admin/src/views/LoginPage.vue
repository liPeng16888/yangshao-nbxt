<template>
  <main class="login-page">
    <section class="login-card">
      <h1>仰韶化验室后台</h1>
      <p>后台管理系统</p>
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item label="账号">
          <el-input v-model="form.account" size="large" autofocus />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" size="large" show-password @keyup.enter="submit" />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" @click="submit">登录</el-button>
      </el-form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { adminLogin } from '../api'

const router = useRouter()
const loading = ref(false)
const form = reactive({ account: '', password: '' })

async function submit() {
  if (!form.account || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    await adminLogin(form)
    await router.push('/data')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #081729 0%, #173654 52%, #0d1f34 100%);
}

.login-card {
  width: min(420px, calc(100vw - 32px));
  padding: 34px;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 8px;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.28);
}

h1 {
  margin: 0;
  font-size: 26px;
}

p {
  margin: 8px 0 28px;
  color: #64748b;
}

.el-button {
  width: 100%;
}
</style>
