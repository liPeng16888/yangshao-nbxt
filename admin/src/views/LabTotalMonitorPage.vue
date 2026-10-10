<template>
  <section class="monitor-page">
    <div class="monitor-heading">
      <div><h3>合量监测</h3><p>按铁计算值匹配合量正常范围，分别配置每个前台主账号。</p></div>
      <el-tag v-if="useAdminMocks" type="info">本地模拟预览</el-tag>
    </div>
    <div class="monitor-toolbar">
      <el-select v-model="ownerId" aria-label="配置前台账号" placeholder="选择前台账号" :disabled="loading || saving" @change="selectOwner">
        <el-option v-for="option in options" :key="option.id" :value="option.id" :label="`${option.name}（${option.account}）`" />
      </el-select>
      <el-button :disabled="!loaded || loading || saving" @click="addRule">添加监测规则</el-button>
      <el-button :disabled="!ownerId || loading || saving" @click="reload">重新加载</el-button>
      <el-button type="primary" :loading="saving" :disabled="!loaded || loading || !dirty" @click="save">保存配置</el-button>
      <el-button :disabled="!loaded || loading || saving || dirty || !rules.length" :title="dirty ? '请先保存当前账号的规则' : '选择规则并追加到其他账号'" @click="openBulk">批量添加到其他账号</el-button>
      <span v-if="dirty" class="monitor-unsaved">有未保存的修改，保存后可批量添加</span>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert type="info" :closable="false" show-icon title="铁、硅、铝均填写并计算后才检查合量。区间包含上下限；铁值未匹配任何已启用规则时也判为异常。未配置规则或全部停用时不监测。" />
    <el-table v-loading="loading" :data="rules" empty-text="尚未添加规则，点击“添加监测规则”开始配置。">
      <el-table-column prop="name" label="规则名称" min-width="150" />
      <el-table-column label="铁计算值范围" min-width="150"><template #default="{ row }">{{ row.ironMin }} ≤ 铁 ≤ {{ row.ironMax }}</template></el-table-column>
      <el-table-column label="合量正常范围" min-width="160"><template #default="{ row }">{{ row.totalMin }} ≤ 合量 ≤ {{ row.totalMax }}</template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{ row }"><el-switch v-model="row.enabled" :aria-label="`启用${row.name}`" :disabled="saving" /></template></el-table-column>
      <el-table-column label="操作" width="150"><template #default="{ row }"><el-button link :disabled="saving" @click="editRule(row)">编辑</el-button><el-button link type="danger" :disabled="saving" @click="removeRule(row)">移除</el-button></template></el-table-column>
    </el-table>
    <p class="monitor-note">异常时，前台合量格显示浅红背景及异常说明；生成短信或报告前，需手动确认才继续。规则仅用于提示，不修改计算公式或结果。</p>
    <el-dialog v-model="editorVisible" :title="editingId ? '编辑监测规则' : '添加监测规则'" width="min(540px, 94vw)">
      <el-form label-position="top">
        <el-form-item label="规则名称"><el-input v-model="form.name" aria-label="规则名称" maxlength="60" /></el-form-item>
        <div class="monitor-range">
          <el-form-item label="铁计算值下限"><el-input-number v-model="form.ironMin" aria-label="铁计算值下限" :precision="4" :step="0.1" controls-position="right" /></el-form-item>
          <el-form-item label="铁计算值上限"><el-input-number v-model="form.ironMax" aria-label="铁计算值上限" :precision="4" :step="0.1" controls-position="right" /></el-form-item>
          <el-form-item label="合量正常下限"><el-input-number v-model="form.totalMin" aria-label="合量正常下限" :precision="4" :step="0.1" controls-position="right" /></el-form-item>
          <el-form-item label="合量正常上限"><el-input-number v-model="form.totalMax" aria-label="合量正常上限" :precision="4" :step="0.1" controls-position="right" /></el-form-item>
        </div>
        <el-checkbox v-model="form.enabled">启用此规则</el-checkbox>
      </el-form>
      <el-alert v-if="editorError" :title="editorError" type="error" :closable="false" />
      <p class="monitor-note">已启用规则的铁含量范围不能重叠，填写的边界值也包含在区间内。</p>
      <template #footer><el-button @click="editorVisible = false">取消</el-button><el-button type="primary" @click="applyRule">{{ editingId ? '确定修改' : '添加到列表' }}</el-button></template>
    </el-dialog>
    <el-dialog v-model="bulkVisible" title="批量添加到其他账号" width="min(760px, 94vw)"
      :close-on-click-modal="!bulkSaving" :close-on-press-escape="!bulkSaving" :show-close="!bulkSaving">
      <p class="monitor-note">来源：{{ accountLabel(bulkSourceId) }}。追加到目标账号，保留原有规则；铁区间重叠或超过 100 条时，跳过该账号。</p>
      <div class="monitor-bulk-heading"><strong>要添加的规则</strong><el-button link :disabled="bulkSaving" @click="bulkRuleIds = rules.map(row => row.id); bulkResults = []">全选规则</el-button></div>
      <el-checkbox-group v-model="bulkRuleIds" class="monitor-bulk-rules" :disabled="bulkSaving" @change="bulkResults = []">
        <el-checkbox v-for="row in rules" :key="row.id" :value="row.id"><strong>{{ row.name }}</strong><span>铁 {{ row.ironMin }}–{{ row.ironMax }} → 合量 {{ row.totalMin }}–{{ row.totalMax }}{{ row.enabled ? '' : '（停用）' }}</span></el-checkbox>
      </el-checkbox-group>
      <div class="monitor-bulk-heading"><strong>目标前台账号</strong><el-button link :disabled="bulkSaving || bulkTargets.length > 100" @click="bulkOwnerIds = bulkTargets.map(row => row.id); bulkResults = []">选择全部其他账号</el-button></div>
      <el-select v-model="bulkOwnerIds" multiple filterable collapse-tags collapse-tags-tooltip aria-label="批量目标前台账号" placeholder="请选择一个或多个前台账号" :disabled="bulkSaving" :multiple-limit="100" class="monitor-bulk-select" @change="bulkResults = []">
        <el-option v-for="option in bulkTargets" :key="option.id" :value="option.id" :label="`${option.name}（${option.account}）`" />
      </el-select>
      <p class="monitor-note">已选 {{ bulkRuleIds.length }} 条规则、{{ bulkOwnerIds.length }} 个目标账号。相同范围和启用状态的指标会自动去重。</p>
      <el-alert v-if="bulkError" :title="bulkError" type="error" :closable="false" show-icon />
      <template v-if="bulkResults.length">
        <el-alert :title="bulkSummary" :type="bulkResults.some(row => ['skipped', 'conflict', 'failed'].includes(row.status)) ? 'warning' : 'success'" :closable="false" show-icon />
        <el-table :data="bulkResults" class="monitor-bulk-results">
          <el-table-column label="账号" min-width="150"><template #default="{ row }">{{ accountLabel(row.frontendUserId) }}</template></el-table-column>
          <el-table-column label="结果" width="100"><template #default="{ row }">{{ bulkStatusLabel(row.status) }}</template></el-table-column>
          <el-table-column prop="message" label="说明" min-width="240" />
        </el-table>
      </template>
      <template #footer><el-button :disabled="bulkSaving" @click="bulkVisible = false">关闭</el-button><el-button type="primary" :loading="bulkSaving" :disabled="!bulkRuleIds.length || !bulkOwnerIds.length" @click="applyBulk">开始批量添加</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getFrontendOptions, useAdminMocks } from '../api'
import type { FrontendOption } from '../types'
import { bulkAppendAdminLabTotalMonitorRules, getAdminLabTotalMonitorConfig, saveAdminLabTotalMonitorConfig } from '../api/labTotalMonitor'
import { validateLabTotalRules, type LabTotalMonitorBulkResult, type LabTotalMonitorRule } from '../../../server/src/common/lab-total-monitor'

const options = ref<FrontendOption[]>([]), ownerId = ref(''), loadedOwner = ref('')
const rules = ref<LabTotalMonitorRule[]>([]), version = ref(0), savedRules = ref('[]')
const loading = ref(false), saving = ref(false), loaded = ref(false), error = ref('')
const editorVisible = ref(false), editingId = ref(''), editorError = ref('')
const form = reactive({ name: '', ironMin: 5 as number | undefined, ironMax: 10 as number | undefined,
  totalMin: 80.5 as number | undefined, totalMax: 82.5 as number | undefined, enabled: true })
const dirty = computed(() => JSON.stringify(rules.value) !== savedRules.value)
const bulkVisible = ref(false), bulkSaving = ref(false), bulkError = ref(''), bulkSourceId = ref(''), bulkSourceVersion = ref(0)
const bulkRuleIds = ref<string[]>([]), bulkOwnerIds = ref<string[]>([]), bulkResults = ref<LabTotalMonitorBulkResult[]>([])
const bulkTargets = computed(() => options.value.filter(row => row.id !== bulkSourceId.value))
const bulkSummary = computed(() => `已添加 ${bulkResults.value.filter(row => row.status === 'applied').length} 个账号，无需重复添加 ${bulkResults.value.filter(row => row.status === 'unchanged').length} 个，跳过或失败 ${bulkResults.value.filter(row => ['skipped', 'conflict', 'failed'].includes(row.status)).length} 个`)
let requestId = 0

function accountLabel(id: string) { const row = options.value.find(row => row.id === id); return row ? `${row.name}（${row.account}）` : id }
function bulkStatusLabel(status: LabTotalMonitorBulkResult['status']) { return { applied: '已添加', unchanged: '无需添加', skipped: '已跳过', conflict: '版本冲突', failed: '添加失败' }[status] }
function openBulk() {
  if (!loaded.value || dirty.value || saving.value || loading.value || !rules.value.length) return
  bulkSourceId.value = ownerId.value; bulkSourceVersion.value = version.value
  bulkRuleIds.value = rules.value.map(row => row.id); bulkOwnerIds.value = []; bulkResults.value = []; bulkError.value = ''; bulkVisible.value = true
}
async function applyBulk() {
  if (bulkSaving.value || !bulkRuleIds.value.length || !bulkOwnerIds.value.length) return
  bulkSaving.value = true; bulkError.value = ''; bulkResults.value = []
  try {
    bulkResults.value = await bulkAppendAdminLabTotalMonitorRules({ sourceFrontendUserId: bulkSourceId.value, sourceVersion: bulkSourceVersion.value,
      ruleIds: [...bulkRuleIds.value], frontendUserIds: [...bulkOwnerIds.value] })
  } catch (e) {
    const response = (e as { response?: { data?: { message?: unknown } } }).response?.data?.message
    bulkError.value = typeof response === 'string' ? response : (e as Error).message || '批量添加失败，请重试'
  } finally { bulkSaving.value = false }
}

async function discardChanges() {
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('当前规则尚未保存，是否放弃这些修改？', '未保存的修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false }
}
async function selectOwner() {
  if (!await discardChanges()) { ownerId.value = loadedOwner.value; return }
  await load()
}
async function reload() { if (await discardChanges()) await load() }
async function load() {
  const id = ownerId.value, token = ++requestId
  loading.value = true; loaded.value = false; error.value = ''; rules.value = []; savedRules.value = '[]'; version.value = 0
  try {
    const result = await getAdminLabTotalMonitorConfig(id)
    if (token !== requestId || id !== ownerId.value) return
    if (result.frontendUserId !== id) throw new Error('配置账号不匹配')
    rules.value = result.rules.map((row) => ({ ...row })); version.value = result.version
    savedRules.value = JSON.stringify(rules.value); loadedOwner.value = id; loaded.value = true
  } catch (e) { if (token === requestId) error.value = (e as Error).message || '加载失败，请重试' }
  finally { if (token === requestId) loading.value = false }
}
function addRule() {
  if (rules.value.length >= 100) { ElMessage.warning('最多添加 100 条规则'); return }
  editingId.value = ''; editorError.value = ''
  Object.assign(form, { name: `规则 ${rules.value.length + 1}`, ironMin: 5, ironMax: 10, totalMin: 80.5, totalMax: 82.5, enabled: true })
  editorVisible.value = true
}
function editRule(row: LabTotalMonitorRule) { editingId.value = row.id; Object.assign(form, { name: row.name, ironMin: row.ironMin, ironMax: row.ironMax, totalMin: row.totalMin, totalMax: row.totalMax, enabled: row.enabled }); editorError.value = ''; editorVisible.value = true }
function applyRule() {
  const id = editingId.value || crypto.randomUUID()
  const next = editingId.value ? rules.value.map((row) => row.id === id ? { id, ...form } : row) : [...rules.value, { id, ...form }]
  try { rules.value = validateLabTotalRules(next); editorVisible.value = false } catch (e) { editorError.value = (e as Error).message }
}
function removeRule(row: LabTotalMonitorRule) { rules.value = rules.value.filter((item) => item.id !== row.id) }
async function save() {
  if (saving.value || !loaded.value || ownerId.value !== loadedOwner.value) return
  let value: LabTotalMonitorRule[]
  try { value = validateLabTotalRules(rules.value) } catch (e) { error.value = (e as Error).message; return }
  saving.value = true; error.value = ''
  try {
    const result = await saveAdminLabTotalMonitorConfig(ownerId.value, value, version.value)
    rules.value = result.rules.map((row) => ({ ...row })); version.value = result.version
    savedRules.value = JSON.stringify(rules.value); ElMessage.success('合量监测规则已保存')
  } catch (e) { error.value = `${(e as Error).message || '保存失败'}；当前修改已保留。` }
  finally { saving.value = false }
}
onMounted(async () => {
  loading.value = true
  try {
    options.value = await getFrontendOptions()
    if (useAdminMocks) options.value.unshift({ id: 'u-admin', account: 'admin', name: '模拟前台管理员', disabled: false })
    ownerId.value = options.value[0]?.id || ''
    if (ownerId.value) await load()
  } catch (e) { error.value = (e as Error).message || '前台账号加载失败' }
  finally { loading.value = false }
})
</script>

<style scoped>
.monitor-page { display: grid; gap: 16px; min-width: 0; }
.monitor-heading, .monitor-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.monitor-heading { justify-content: space-between; }
.monitor-heading h3 { margin: 0 0 6px; }
.monitor-heading p, .monitor-note { margin: 0; color: var(--ui-text-muted); font-size: 13px; line-height: 1.6; }
.monitor-toolbar .el-select { width: 280px; max-width: 100%; }
.monitor-unsaved { color: var(--ui-warning); font-size: 13px; }
.monitor-range { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.monitor-range .el-input-number { width: 100%; }
.monitor-bulk-heading { display: flex; justify-content: space-between; align-items: center; margin: 18px 0 8px; }
.monitor-bulk-rules { display: grid; gap: 6px; max-height: 220px; overflow-y: auto; }
.monitor-bulk-rules :deep(.el-checkbox) { height: auto; margin: 0; }
.monitor-bulk-rules :deep(.el-checkbox__label) { display: grid; white-space: normal; line-height: 1.6; }
.monitor-bulk-rules span { font-size: 12px; color: var(--ui-text-muted); }
.monitor-bulk-select { width: 100%; margin-bottom: 8px; }
.monitor-bulk-results { margin-top: 12px; }
</style>
