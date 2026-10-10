<template>
  <section class="ai-settings">
    <div class="ai-settings-heading"><div><h3>AI API 配置</h3><p>管理可用模型、账号的数据权限和写入记录。</p></div><el-button :loading="loading" @click="load">刷新配置</el-button></div>
    <el-alert v-if="useAdminMocks" type="warning" :closable="false" title="当前为本地演示登录，仅预览 AI 配置页面。请连接真实后端并使用真实主管理员账号后保存配置。" show-icon />
    <el-alert v-if="error" type="error" :closable="false" :title="error" show-icon />
    <el-tabs v-model="tab" class="ai-settings-tabs">
      <el-tab-pane label="模型与服务" name="models">
        <div class="ai-service-card"><div><strong>启用 AI 助手</strong><p>启用后，已授权账号可以使用下方配置的模型。</p></div><el-switch v-model="settings.enabled" :disabled="useAdminMocks" /></div>
        <div class="ai-service-limit"><label>每个账号每日对话上限</label><el-input-number v-model="settings.dailyRequestLimit" :min="1" :max="500" :disabled="useAdminMocks" /><el-button type="primary" :loading="saving" :disabled="useAdminMocks || !config" @click="saveSettings">保存服务设置</el-button></div>
        <div class="ai-table-heading"><h4>接入模型</h4><el-button type="primary" @click="editModel()">添加模型</el-button></div>
        <el-table :data="config?.models || []" empty-text="尚未接入模型，点击添加模型开始配置">
          <el-table-column prop="name" label="显示名称" min-width="130" /><el-table-column prop="modelId" label="模型标识" min-width="150" /><el-table-column prop="baseUrl" label="API 地址" min-width="220" />
          <el-table-column label="能力" width="140"><template #default="{ row }"><el-tag v-if="row.vision" size="small">图片</el-tag><el-tag v-if="row.tools" size="small">业务工具</el-tag><span v-if="!row.vision && !row.tools">文字对话</span></template></el-table-column>
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="210"><template #default="{ row }"><el-button link type="primary" @click="editModel(row)">编辑</el-button><el-button link type="primary" :disabled="useAdminMocks || saving" @click="testModel(row.id)">测试连接</el-button><el-button link type="danger" :disabled="useAdminMocks || saving || !row.enabled" @click="disableModel(row.id)">停用</el-button></template></el-table-column>
        </el-table>
        <p class="ai-help">支持 OpenAI 兼容的 Chat Completions API（例如 DeepSeek、通义千问及模型聚合服务）。API 地址填写到 /v1 等接口前缀，模型标识以供应商文档为准。密钥加密保存在服务端，保存后不返回原文。</p>
      </el-tab-pane>
      <el-tab-pane label="读取与写入权限" name="permissions">
        <div class="ai-policy-subject"><label>配置对象</label><el-select v-model="subjectId" filterable @change="selectPolicy"><el-option value="*" label="默认权限（未单独配置的账号）" /><el-option v-for="account in config?.accounts || []" :key="account.id" :value="account.id" :label="accountLabel(account)" /></el-select><el-switch v-model="policyEnabled" active-text="允许使用 AI" :disabled="useAdminMocks" /></div>
        <el-alert type="info" :closable="false" title="AI 授权不能超过原有菜单权限、账号范围和访问密码保护。未选字段不能读取；写入始终需人工核对确认。只读/原流程菜单不会因全选而开放写入。" show-icon />
        <AiPermissionTree v-model="rules" :catalog="activeCatalog" :blocked="settings.blockedFields" :disabled="saving" :account-audience="selectedAccountAudience" />
        <el-button type="primary" :loading="saving" :disabled="useAdminMocks || !config" @click="savePolicy">保存此对象的权限</el-button><el-button v-if="subjectId !== '*'" :disabled="useAdminMocks || saving" @click="inheritPolicy">恢复使用默认权限</el-button>
        <p class="ai-help">默认权限初始全部关闭。单独保存的账号使用独立配置；主账号和子账号可分别设置。权限变更后旧对话与旧草稿失效，需要新建对话。</p>
      </el-tab-pane>
      <el-tab-pane label="全局禁止字段" name="blocked">
        <el-alert type="warning" :closable="false" title="勾选表示禁止，优先于所有账号和模型授权。同一数据字段在其他菜单出现时也一起禁止。这里只限制 AI，不删除数据、不改变网站原页面权限。" show-icon />
        <div class="ai-fixed-boundaries"><h4>固定安全边界 · 始终禁止，不能关闭</h4><div v-for="boundary in fixedAiBoundaries" :key="boundary.label"><el-tag type="danger" size="small">始终禁止</el-tag><strong>{{ boundary.label }}</strong><p>{{ boundary.explanation }}</p></div></div>
        <p class="ai-help">以上限制的是 AI 接口，不等于前端源码保密。当前浏览器端仍执行部分计算；如需让公式对网站使用者保密，应另行迁移到服务端计算，不能依靠此处的权限开关实现。</p>
        <h4>可配置的业务字段禁止项</h4><el-input v-model="blockedKeyword" placeholder="搜索菜单或字段" clearable style="max-width:330px;margin-bottom:14px" />
        <el-collapse><el-collapse-item v-for="entry in filteredBlockedCatalog" :key="entry.key" :name="entry.key"><template #title><span>{{ (entry.frontend || entry.admin)?.group }} / {{ entry.label }}</span><el-tag size="small" style="margin-left:12px">已禁止 {{ (settings.blockedFields[entry.key] || []).length }} 项</el-tag></template><el-checkbox :model-value="(settings.blockedFields[entry.key] || []).length === entry.fields.length" :indeterminate="(settings.blockedFields[entry.key] || []).length > 0 && (settings.blockedFields[entry.key] || []).length < entry.fields.length" :disabled="saving" @change="blockMenu(entry.key,$event)">禁止此菜单全部字段</el-checkbox><div class="ai-blocked-options"><el-checkbox-group v-model="settings.blockedFields[entry.key]" :disabled="saving"><el-checkbox v-for="field in entry.fields" :key="field.key" :value="field.key">{{ field.label }}</el-checkbox></el-checkbox-group></div></el-collapse-item></el-collapse>
        <el-button type="primary" :loading="saving" :disabled="useAdminMocks || !config" @click="saveSettings">保存全局禁止字段</el-button>
      </el-tab-pane>
      <el-tab-pane label="飞书接入" name="feishu"><FeishuSettingsPanel v-if="tab === 'feishu'" :config="config" :mocks="useAdminMocks" /></el-tab-pane>
      <el-tab-pane label="操作记录" name="logs">
        <div class="ai-table-heading"><p>记录读取的字段、草稿生成、确认写入、取消及配置变更。</p><el-button :disabled="useAdminMocks" @click="loadLogs">刷新记录</el-button></div>
        <el-table :data="logs" empty-text="暂无操作记录"><el-table-column label="时间" width="180"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column><el-table-column label="操作账号" min-width="130"><template #default="{ row }">{{ findAccount(row.actorId) }}</template></el-table-column><el-table-column label="数据账号" min-width="130"><template #default="{ row }">{{ findAccount(row.ownerId) }}</template></el-table-column><el-table-column label="操作" width="140"><template #default="{ row }">{{ actionLabel(row.action) }}</template></el-table-column><el-table-column prop="resource" label="菜单" width="100" /><el-table-column label="详情" min-width="220"><template #default="{ row }"><span class="ai-log-detail">{{ JSON.stringify(row.detail) }}</span></template></el-table-column></el-table>
        <div class="ai-log-pages"><el-button :disabled="logPage <= 1 || useAdminMocks" @click="logPage--; loadLogs()">上一页</el-button><span>第 {{ logPage }} 页</span><el-button :disabled="logs.length < 50 || useAdminMocks" @click="logPage++; loadLogs()">下一页</el-button></div>
      </el-tab-pane>
    </el-tabs>
    <el-dialog v-model="modelVisible" :title="modelEditingId ? '编辑模型' : '添加模型'" width="min(620px, 94vw)">
      <el-form label-position="top"><el-form-item label="显示名称"><el-input v-model="modelForm.name" placeholder="例如：通义视觉模型" maxlength="60" /></el-form-item><el-form-item label="模型标识"><el-input v-model="modelForm.modelId" placeholder="供应商提供的准确模型名称" maxlength="150" /></el-form-item><el-form-item label="API 地址"><el-input v-model="modelForm.baseUrl" placeholder="https://api.example.com/v1" /></el-form-item><el-form-item :label="modelEditingId ? 'API 密钥（留空保留原密钥）' : 'API 密钥'"><el-input v-model="modelForm.apiKey" type="password" show-password autocomplete="new-password" /></el-form-item><el-form-item label="能力与状态"><el-checkbox v-model="modelForm.vision">支持照片识别</el-checkbox><el-checkbox v-model="modelForm.tools">支持业务工具调用</el-checkbox><el-checkbox v-model="modelForm.enabled">启用模型</el-checkbox></el-form-item><el-form-item label="允许使用的账号（留空表示所有已启用 AI 的账号）"><el-select v-model="modelForm.allowedUserIds" multiple filterable style="width:100%"><el-option v-for="account in config?.accounts || []" :key="account.id" :label="accountLabel(account)" :value="account.id" /></el-select></el-form-item></el-form>
      <p class="ai-help">只勾选供应商实际支持的能力。测试连接会向该接口发送一条不含业务数据的测试请求。</p>
      <template #footer><el-button @click="modelVisible = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="useAdminMocks" @click="saveModel">保存模型</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAdminMocks } from '../api'
import { aiClient } from '../../../shared/ai/client'
import type { AiAccount, AiConfig, AiConfiguredModel, AiRule } from '../../../shared/ai/types'
import { menuCatalog, fixedAiBoundaries, type AiAudience } from '../../../server/src/ai/ai-menu-catalog'
import AiPermissionTree from '../components/AiPermissionTree.vue'
import FeishuSettingsPanel from '../components/FeishuSettingsPanel.vue'
const request = aiClient('admin', import.meta.env.VITE_ADMIN_API_BASE_URL || '/api')
const config = ref<AiConfig | null>(null), loading = ref(false), saving = ref(false), error = ref(''), tab = ref('models')
const settings = reactive({ enabled: false, dailyRequestLimit: 50, blockedFields: {} as Record<string, string[]> })
const subjectId = ref('*'), policyEnabled = ref(true), rules = ref<AiRule[]>([])
const modelVisible = ref(false), modelEditingId = ref(''), modelForm = reactive({ name: '', modelId: '', baseUrl: '', apiKey: '', enabled: true, vision: false, tools: true, allowedUserIds: [] as string[] })
const logs = ref<{ id: string; actorId: string; ownerId?: string; resource?: string; action: string; detail: unknown; createdAt: string }[]>([]), logPage = ref(1)
const activeCatalog = computed(() => config.value?.catalog || menuCatalog)
const blockedKeyword=ref('')
const filteredBlockedCatalog=computed(()=>activeCatalog.value.filter(e=>`${e.frontend?.group||e.admin?.group} ${e.label} ${e.fields.map(f=>f.label).join(' ')}`.includes(blockedKeyword.value.trim())))
const selectedAccountAudience=computed<AiAudience|undefined>(()=>{if(subjectId.value==='*')return undefined;return ['ROOT_ADMIN','SUB_ADMIN'].includes(config.value?.accounts.find(a=>a.id===subjectId.value)?.role||'')?'admin':'frontend'})
function blockMenu(resource:string,value:unknown){const entry=activeCatalog.value.find(e=>e.key===resource)!;settings.blockedFields[resource]=value?entry.fields.map(f=>f.key):[]}
function accountLabel(account: AiAccount) { const role = ({ ROOT_ADMIN: '主管理员', SUB_ADMIN: '子管理员', FRONTEND_USER: '前台主账号', FRONTEND_SUB_USER: '前台子账号' } as Record<string, string>)[account.role]; return `${account.username}（${account.account} · ${role}）` }
async function load() {
  if (useAdminMocks) { for (const c of menuCatalog) settings.blockedFields[c.key] ||= []; selectPolicy(); return }
  loading.value = true; error.value = ''
  try { config.value = await request<AiConfig>('/admin/ai/config'); Object.assign(settings, config.value.settings); for (const c of config.value.catalog) settings.blockedFields[c.key] ||= []; selectPolicy() } catch (e) { error.value = (e as Error).message } finally { loading.value = false }
}
function selectPolicy() { const p = config.value?.policies.find(p => p.subjectId === subjectId.value) || config.value?.policies.find(p => p.subjectId === '*'); policyEnabled.value = p?.enabled ?? true; rules.value = (p?.rules || []).map(rule=>({...rule,readFields:[...rule.readFields],writeFields:[...rule.writeFields]})) }
async function perform(operation: () => Promise<void>) { saving.value = true; error.value = ''; try { await operation() } catch (e) { error.value = (e as Error).message } finally { saving.value = false } }
function saveSettings() { return perform(async () => { await request('/admin/ai/settings', { method: 'PUT', body: { enabled: settings.enabled, dailyRequestLimit: settings.dailyRequestLimit, blockedFields: settings.blockedFields } }); ElMessage.success('AI 服务设置已保存，旧对话和草稿已失效'); await load() }) }
function savePolicy() { return perform(async () => { await request(`/admin/ai/policies/${encodeURIComponent(subjectId.value)}`, { method: 'PUT', body: { enabled: policyEnabled.value, rules: rules.value } }); ElMessage.success('权限已保存'); await load() }) }
function inheritPolicy() { return perform(async () => { await request(`/admin/ai/policies/${encodeURIComponent(subjectId.value)}`, { method: 'DELETE' }); ElMessage.success('已恢复默认权限'); await load() }) }
function editModel(model?: AiConfiguredModel) { modelEditingId.value = model?.id || ''; Object.assign(modelForm, { name: model?.name || '', modelId: model?.modelId || '', baseUrl: model?.baseUrl || '', apiKey: '', enabled: model?.enabled ?? true, vision: model?.vision ?? false, tools: model?.tools ?? true, allowedUserIds: [...(model?.allowedUserIds || [])] }); modelVisible.value = true }
function saveModel() { return perform(async () => { await request(modelEditingId.value ? `/admin/ai/models/${modelEditingId.value}` : '/admin/ai/models', { method: modelEditingId.value ? 'PUT' : 'POST', body: modelForm }); modelVisible.value = false; modelForm.apiKey = ''; ElMessage.success('模型已保存'); await load() }) }
function testModel(id: string) { return perform(async () => { await request(`/admin/ai/models/${id}/test`, { method: 'POST' }); ElMessage.success('模型连接成功') }) }
async function disableModel(id: string) { try { await ElMessageBox.confirm('停用后用户将无法使用此模型，旧对话和草稿会失效。', '停用模型') } catch { return }; await perform(async () => { await request(`/admin/ai/models/${id}`, { method: 'DELETE' }); await load() }) }
async function loadLogs() { if (useAdminMocks) return; try { logs.value = await request(`/admin/ai/logs?page=${logPage.value}`) } catch (e) { error.value = (e as Error).message } }
function findAccount(id?: string) { const account = config.value?.accounts.find(a => a.id === id); return account ? `${account.username}（${account.account}）` : id || '—' }
function formatTime(text: string) { return new Date(text).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) }
function actionLabel(action: string) { return ({ READ: '读取业务数据', PROPOSED: '生成草稿', APPLIED: '确认写入', REJECTED: '取消草稿', EXPIRED: '草稿过期', CHAT_REQUEST: '对话请求', CHAT_FAILED: '请求失败', MODEL_SAVED: '保存模型', MODEL_DISABLED: '停用模型', MODEL_TESTED: '测试模型', FEISHU_CONFIG_SAVED: '飞书连接配置', FEISHU_INVITED: '生成飞书邀请', FEISHU_BOUND: '确认飞书绑定', FEISHU_UNBOUND: '解除飞书绑定', FEISHU_BINDING_UPDATED: '修改飞书绑定', FEISHU_ACCESS_VERIFIED: '飞书访问验证', SETTINGS_UPDATED: '修改服务设置', POLICY_UPDATED: '修改账号权限', POLICY_INHERITED: '恢复默认权限' } as Record<string, string>)[action] || action }
watch(tab, value => { if (value === 'logs') void loadLogs() })
onMounted(load)
</script>

<style scoped>
.ai-settings { background: white; border-radius: 12px; padding: 24px; }.ai-settings-heading,.ai-table-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.ai-settings h3 { margin: 0; font-size: 22px; }.ai-settings-heading p,.ai-help { color: var(--ui-text-muted); font-size: 13px; line-height: 1.7; }.ai-settings .el-alert { margin: 14px 0; }.ai-settings-tabs { margin-top: 18px; }.ai-service-card { display: flex; align-items: center; justify-content: space-between; padding: 18px; background: var(--ui-accent-soft); border-radius: 10px; }.ai-service-card p { color: var(--ui-text-muted); font-size: 13px; margin-bottom: 0; }.ai-service-limit,.ai-policy-subject { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; margin: 20px 0; font-size: 13px; }.ai-policy-subject .el-select { width: 330px; }.ai-rule-card { border: 1px solid #e1e7f0; padding: 16px 20px; border-radius: 10px; margin: 14px 0; }.ai-rule-card h4 { margin-top: 0; }.ai-rule-card>div { margin: 12px 0; }.ai-rule-card label { font-size: 12px; color: var(--ui-text-muted); display: block; margin-bottom: 8px; }.ai-rule-card :deep(.el-checkbox) { margin-bottom: 6px; }.ai-log-detail { font-size: 11px; overflow-wrap: anywhere; }.ai-log-pages { display: flex; justify-content: flex-end; gap: 12px; align-items: center; margin-top: 16px; }
</style>
<style scoped>
.ai-fixed-boundaries{background:#fff7f5;border:1px solid #f7d8d3;border-radius:10px;padding:16px 20px;margin:18px 0 24px}.ai-fixed-boundaries h4{margin-top:0}.ai-fixed-boundaries>div{margin:12px 0}.ai-fixed-boundaries strong{font-size:13px;margin-left:10px}.ai-fixed-boundaries p{color:var(--ui-text-muted);font-size:12px;margin:6px 0 0;line-height:1.7}.ai-blocked-options{padding:14px 0}.ai-blocked-options :deep(.el-checkbox){margin-bottom:8px}
</style>
