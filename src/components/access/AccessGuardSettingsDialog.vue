<template>
  <el-dialog v-model="settingsVisible" title="访问组合设置" width="760px" append-to-body @open="loadGroups">
    <el-alert title="创建访问组合后，组合内的功能共用同一访问密码；每项功能只能加入一个组合。未加入组合的功能不需要验证。" type="info" :closable="false" show-icon />

    <div class="toolbar">
      <span>当前账号的访问组合</span>
      <el-button type="primary" @click="openEditor()">新建组合</el-button>
    </div>
    <el-empty v-if="!groups.length" description="暂未创建访问组合" :image-size="72" />
    <div v-else class="group-list">
      <section v-for="group in groups" :key="group.id" class="group-card">
        <div class="group-card__top">
          <div>
            <strong>{{ group.name }}</strong>
            <el-tag size="small" :type="group.enabled ? 'success' : 'info'">{{ group.enabled ? '已启用' : '已停用' }}</el-tag>
          </div>
          <div>
            <el-button link type="primary" @click="openEditor(group)">编辑</el-button>
            <el-button link type="danger" @click="removeGroup(group)">删除</el-button>
          </div>
        </div>
        <div class="group-card__features">{{ group.features.map((feature) => featureLabels[feature]).join('、') || '未选择功能' }}</div>
        <div class="group-card__meta">验证后 {{ group.ttlMinutes }} 分钟内免输密码</div>
      </section>
    </div>
  </el-dialog>

  <el-dialog v-model="editorVisible" :title="editingId ? '编辑访问组合' : '新建访问组合'" width="560px" append-to-body @closed="resetEditor">
    <el-form label-position="top">
      <el-form-item label="组合名称" required>
        <el-input v-model="form.name" maxlength="24" show-word-limit placeholder="例如：经营数据" />
      </el-form-item>
      <el-form-item label="受保护功能" required>
        <el-checkbox-group v-model="form.features" class="feature-list">
          <el-checkbox v-for="feature in accessGuardFeatures" :key="feature" :label="feature" :disabled="isFeatureOwnedByOtherGroup(feature)">
            {{ featureLabels[feature] }}
            <span v-if="isFeatureOwnedByOtherGroup(feature)" class="feature-owned">（已加入其他组合）</span>
          </el-checkbox>
        </el-checkbox-group>
      </el-form-item>
      <el-form-item label="启用此组合">
        <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
      </el-form-item>
      <el-form-item label="免输密码时长">
        <el-input-number v-model="form.ttlMinutes" :min="1" :max="1440" />
        <span class="unit">分钟</span>
      </el-form-item>
      <el-form-item label="访问密码" required>
        <el-input v-model="form.password" type="password" show-password :placeholder="editingId ? '留空则保持当前密码' : '请输入至少 4 位密码'" />
      </el-form-item>
      <el-form-item label="确认访问密码" :required="!editingId || Boolean(form.password)">
        <el-input v-model="form.confirmPassword" type="password" show-password placeholder="再次输入访问密码" />
      </el-form-item>
      <el-form-item label="找回密码提示词">
        <el-input v-model="form.recoveryPrompt" placeholder="例如：常用管理员口令提示" />
      </el-form-item>
      <el-form-item label="找回答案">
        <el-input v-model="form.recoveryAnswer" type="password" show-password :placeholder="editingId ? '留空则保持当前答案' : '请输入找回答案'" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="editorVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="saveGroup">保存组合</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccessGuardStore } from '@/stores/accessGuard'
import { accessGuardFeatures, type AccessGuardFeature } from '@/router/guards'
import type { AccessGuardGroup } from '@/api/accessGuard'

const accessGuard = useAccessGuardStore()
const { groups, settingsVisible } = storeToRefs(accessGuard)
const editorVisible = ref(false)
const saving = ref(false)
const editingId = ref('')
const featureLabels: Record<AccessGuardFeature, string> = {
  FINANCE: '财务', EMPLOYEE_ATTENDANCE: '员工考勤', REPORTS: '报表', BLACKLIST: '黑名单', HISTORICAL_DATES: '历史日期查看',
  MEDICINE_INVENTORY: '药品库存', CUSTOMER_OVERVIEW: '客户总览', COMPLETED_SAMPLE_DATA: '已完成样品隐藏数据'
}
const form = reactive({
  name: '', enabled: true, ttlMinutes: 5, password: '', confirmPassword: '', recoveryPrompt: '', recoveryAnswer: '', features: [] as AccessGuardFeature[]
})

async function loadGroups() { await accessGuard.loadGroups(true) }
function resetEditor() {
  editingId.value = ''
  Object.assign(form, { name: '', enabled: true, ttlMinutes: 5, password: '', confirmPassword: '', recoveryPrompt: '', recoveryAnswer: '', features: [] })
}
function openEditor(group?: AccessGuardGroup) {
  resetEditor()
  if (group) {
    editingId.value = group.id
    Object.assign(form, { name: group.name, enabled: group.enabled, ttlMinutes: group.ttlMinutes, recoveryPrompt: group.recoveryPrompt, features: [...group.features] })
  }
  editorVisible.value = true
}
function isFeatureOwnedByOtherGroup(feature: AccessGuardFeature) {
  return groups.value.some((group) => group.id !== editingId.value && group.features.includes(feature))
}
async function saveGroup() {
  const name = form.name.trim()
  if (!name || !form.features.length) return ElMessage.warning('请填写组合名称并选择至少一个功能')
  const existing = editingId.value ? groups.value.find((group) => group.id === editingId.value) : undefined
  const password = form.password.trim() || existing?.password || ''
  const recoveryAnswer = form.recoveryAnswer.trim() || existing?.recoveryAnswer || ''
  if (password.length < 4 || form.password && form.password !== form.confirmPassword) return ElMessage.warning('访问密码至少 4 位，且两次输入必须一致')
  if (!form.recoveryPrompt.trim() || !recoveryAnswer) return ElMessage.warning('请填写找回密码提示词和答案')
  saving.value = true
  try {
    await accessGuard.saveGroup({ name, enabled: form.enabled, ttlMinutes: form.ttlMinutes, password, recoveryPrompt: form.recoveryPrompt.trim(), recoveryAnswer, features: form.features }, editingId.value || undefined)
    editorVisible.value = false
    ElMessage.success('访问组合已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存访问组合失败')
  } finally { saving.value = false }
}
async function removeGroup(group: AccessGuardGroup) {
  try {
    await ElMessageBox.confirm(`删除“${group.name}”后，其中的功能将不再受访问密码保护。`, '确认删除', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    await accessGuard.removeGroup(group.id)
    ElMessage.success('访问组合已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('删除访问组合失败')
  }
}
</script>

<style scoped>
.toolbar,.group-card__top { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:16px 0 10px; }
.group-list { display:grid; gap:10px; max-height:400px; overflow:auto; }
.group-card { border:1px solid #dbe5f0; border-radius:6px; padding:12px 14px; }
.group-card__top { margin:0; } .group-card__top strong { margin-right:8px; }
.group-card__features { color:#334155; line-height:1.6; }.group-card__meta,.feature-owned { color:#94a3b8; font-size:12px; }.feature-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 8px; }.unit { margin-left:10px; color:#64748b; }
</style>
