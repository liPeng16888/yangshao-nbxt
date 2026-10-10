<template>
  <main class="feishu-verify">
    <section class="verify-card">
      <div class="verify-kicker">仰韶化验室 · 飞书接入</div>
      <h1>{{ access ? '验证飞书访问权限' : '确认飞书账号绑定' }}</h1>
      <p class="verify-intro">{{ access ? '在此验证访问密码，然后返回飞书重新发送请求。授权随原有有效期过期。' : '核对网站账号与飞书身份。确认后，可以在机器人私聊中使用此账号已授权的 AI 功能。' }}</p>
      <el-alert v-if="mocks" title="演示登录不能完成真实飞书绑定，请连接真实后端并登录指定账号。" type="warning" :closable="false" show-icon />
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <div v-if="loading" class="verify-intro">正在核对链接和账号…</div>
      <template v-if="info">
        <dl><dt>网站账号</dt><dd>{{ info.username }}（{{ info.account }}）</dd><template v-if="!access"><dt>飞书使用者 ID</dt><dd>{{ info.feishuUser }}</dd><dt>默认模型</dt><dd>{{ info.model }}</dd></template></dl>
        <el-alert v-if="done" type="success" :closable="false" :title="access ? '访问验证成功，请返回飞书继续。' : '绑定成功，请返回飞书机器人私聊。'" show-icon />
        <template v-else-if="access">
          <el-form label-position="top"><el-form-item label="访问组合"><el-select v-model="groupId" placeholder="选择需要验证的访问组合"><el-option v-for="g in info.groups" :key="g.id" :label="`${g.name}（${g.ttlMinutes} 分钟）`" :value="g.id" /></el-select></el-form-item><el-form-item label="访问密码"><el-input v-model="password" type="password" show-password autocomplete="off" @keyup.enter="confirm" /></el-form-item></el-form>
          <p v-if="!info.groups?.length" class="verify-intro">当前没有已启用的访问组合。</p>
        </template>
        <el-button v-if="!done" type="primary" :loading="saving" :disabled="mocks || access && (!groupId || !password)" @click="confirm">{{ access ? '验证访问密码' : '确认绑定此账号' }}</el-button>
        <el-button v-if="done && access" @click="done = false">继续验证其他访问组合</el-button>
      </template>
      <div class="verify-footer"><el-button link @click="switchAccount">切换网站登录账号</el-button><el-button link @click="router.replace('/data')">返回网站</el-button></div>
    </section>
  </main>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { aiClient } from './client'
import { rememberFeishuReturn, type FeishuAudience } from './feishuReturn'
const props = defineProps<{ audience: FeishuAudience; mocks: boolean; apiBase: string }>()
const route = useRoute(), router = useRouter(), request = aiClient(props.audience, props.apiBase)
const access = computed(() => route.path.endsWith('/access'))
const proof = new URLSearchParams(route.hash.replace(/^#/, '')).get('proof') || ''
const loading = ref(false), saving = ref(false), error = ref(''), done = ref(false), password = ref(''), groupId = ref('')
const info = ref<{ account: string; username: string; feishuUser?: string; model?: string; groups?: { id: string; name: string; ttlMinutes: number }[] } | null>(null)
onMounted(async () => {
  if (props.mocks) return
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(proof)) { error.value = '链接不完整，请从机器人返回的链接进入'; return }
  loading.value = true
  try { info.value = await request(`/ai/feishu/${access.value ? 'access' : 'bind'}/resolve`, { method: 'POST', body: { proof } }); groupId.value = info.value?.groups?.[0]?.id || '' }
  catch (e) { error.value = (e as Error).message } finally { loading.value = false }
})
async function confirm() {
  if (saving.value || props.mocks || !info.value) return
  saving.value = true; error.value = ''
  try { await request(`/ai/feishu/${access.value ? 'access' : 'bind'}/confirm`, { method: 'POST', body: access.value ? { proof, groupId: groupId.value, password: password.value } : { proof } }); done.value = true }
  catch (e) { error.value = (e as Error).message } finally { password.value = ''; saving.value = false }
}
function switchAccount() {
  rememberFeishuReturn(props.audience, route.fullPath)
  const prefix = props.audience === 'admin' ? 'ys_admin' : 'ys'
  localStorage.removeItem(`${prefix}_token`); localStorage.removeItem(`${prefix}_user`)
  if (props.audience === 'frontend') localStorage.removeItem('ys_access_guard_group_sessions')
  window.location.assign(props.audience === 'admin' ? '/admin/login' : '/login')
}
</script>
<style scoped>
.feishu-verify{min-height:100vh;display:grid;place-items:center;background:var(--ui-bg,#f3f5f8);padding:24px}.verify-card{box-sizing:border-box;width:min(560px,100%);background:white;border:1px solid #e1e7ee;border-radius:16px;padding:32px}.verify-kicker{color:var(--ui-text-muted,#667585);font-size:13px}h1{font-size:24px;margin:12px 0}.verify-intro{font-size:14px;line-height:1.8;color:#667585}.verify-card .el-alert{margin:18px 0}dl{display:grid;grid-template-columns:110px 1fr;gap:14px;margin:26px 0;font-size:14px}dt{color:#667585}dd{margin:0;overflow-wrap:anywhere}.verify-footer{display:flex;justify-content:space-between;gap:12px;margin-top:24px}.el-select{width:100%}@media(max-width:500px){.verify-card{padding:22px}dl{grid-template-columns:1fr;gap:8px}}
</style>
