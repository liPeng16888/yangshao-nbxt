<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MobileFilterDrawer from '@/components/mobile/MobileFilterDrawer.vue'
import type { Employee } from '@/types/employeeAttendance'

const props = withDefaults(defineProps<{
  employees: Employee[]
  busy?: boolean
}>(), { busy: false })

const emit = defineEmits<{
  create: []
  edit: [employee: Employee]
  reveal: [employee: Employee]
  previewPhoto: [employee: Employee]
  uploadPhoto: [employee: Employee, file: File]
  remove: [employee: Employee]
}>()

const filterOpen = ref(false)
const keyword = ref('')
const status = ref<Employee['status'] | ''>('')
const draftKeyword = ref('')
const draftStatus = ref<Employee['status'] | ''>('')
const statusNames: Record<Employee['status'], string> = { ACTIVE: '在职', INACTIVE: '停用/离职' }
const summary = computed(() => [keyword.value || '全部员工', status.value ? statusNames[status.value] : '全部状态'].join(' · '))
const filtered = computed(() => props.employees.filter((employee) => {
  const matchesKeyword = !keyword.value || `${employee.employeeNumber}${employee.name}${employee.phone}`.includes(keyword.value.trim())
  return matchesKeyword && (!status.value || employee.status === status.value)
}))

watch(filterOpen, (open) => {
  if (!open) return
  draftKeyword.value = keyword.value
  draftStatus.value = status.value
})

function applyFilters() {
  keyword.value = draftKeyword.value.trim()
  status.value = draftStatus.value
  filterOpen.value = false
}

function resetFilters() {
  draftKeyword.value = ''
  draftStatus.value = ''
  keyword.value = ''
  status.value = ''
  filterOpen.value = false
}

function choosePhoto(employee: Employee, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('uploadPhoto', employee, file)
}
</script>

<template>
  <section class="mobile-employee-list" aria-label="员工档案列表">
    <div data-testid="mobile-employee-filter">
      <MobileFilterDrawer v-model="filterOpen" title="筛选员工档案" :summary="summary" fullscreen @apply="applyFilters" @reset="resetFilters">
        <div class="mobile-employee-list__filters">
          <label>
            <span>搜索</span>
            <el-input v-model="draftKeyword" data-testid="mobile-employee-keyword" clearable placeholder="编号、姓名或手机" />
          </label>
          <label>
            <span>状态</span>
            <el-select v-model="draftStatus" data-testid="mobile-employee-status" clearable placeholder="全部状态">
              <el-option label="在职" value="ACTIVE" />
              <el-option label="停用/离职" value="INACTIVE" />
            </el-select>
          </label>
        </div>
      </MobileFilterDrawer>
    </div>

    <button data-testid="mobile-create-employee" class="mobile-touch-target mobile-employee-list__create" type="button" :disabled="busy" @click="emit('create')">新增员工</button>

    <p v-if="!filtered.length" class="mobile-employee-list__empty" role="status">暂无员工档案</p>
    <div v-else class="mobile-employee-list__cards">
      <div
        v-for="employee in filtered"
        :key="employee.id"
        data-testid="mobile-employee-card"
      >
        <article
          :data-testid="`mobile-employee-card-${employee.id}`"
          :class="['mobile-employee-card', `mobile-employee-card--${employee.status.toLowerCase()}`]"
        >
        <header>
          <div class="mobile-employee-card__avatar" aria-hidden="true">{{ employee.name.trim().slice(0, 1) || '?' }}</div>
          <div class="mobile-employee-card__identity">
            <strong>{{ employee.name }}</strong>
            <span>{{ employee.employeeNumber }}</span>
          </div>
          <span class="mobile-employee-card__status">{{ statusNames[employee.status] }}</span>
        </header>
        <dl>
          <div><dt>手机</dt><dd>{{ employee.phone || '未填写' }}</dd></div>
          <div><dt>身份证</dt><dd>{{ employee.idCardMasked || '未填写' }}</dd></div>
          <div><dt>银行卡</dt><dd>{{ employee.bankCardMasked || '未填写' }}</dd></div>
          <div><dt>基本月薪</dt><dd>¥{{ employee.baseSalary.toFixed(2) }}</dd></div>
        </dl>
        <div class="mobile-employee-card__photo">
          <span>{{ employee.hasPhoto ? '已上传私有照片' : '暂无照片' }}</span>
          <button v-if="employee.hasPhoto" :data-testid="`mobile-preview-photo-${employee.id}`" class="mobile-touch-target" type="button" :disabled="busy" @click="emit('previewPhoto', employee)">查看照片</button>
          <label class="mobile-touch-target mobile-employee-card__upload">
            <span>{{ employee.hasPhoto ? '更换照片' : '上传照片' }}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" :aria-label="`${employee.name}上传照片`" @change="choosePhoto(employee, $event)" />
          </label>
        </div>
        <footer>
          <button :data-testid="`mobile-edit-employee-${employee.id}`" class="mobile-touch-target" type="button" :disabled="busy" @click="emit('edit', employee)">编辑</button>
          <button :data-testid="`mobile-reveal-employee-${employee.id}`" class="mobile-touch-target" type="button" :disabled="busy" @click="emit('reveal', employee)">查看敏感信息</button>
          <button :data-testid="`mobile-remove-employee-${employee.id}`" class="mobile-touch-target mobile-employee-card__danger" type="button" :disabled="busy" @click="emit('remove', employee)">删除/停用</button>
        </footer>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mobile-employee-list{display:grid;min-width:0;gap:12px;padding-bottom:max(12px,env(safe-area-inset-bottom))}.mobile-employee-list__filters{display:grid;gap:16px}.mobile-employee-list__filters label{display:grid;gap:6px}.mobile-employee-list__filters :deep(.el-input__wrapper),.mobile-employee-list__filters :deep(.el-select__wrapper){min-height:44px}.mobile-employee-list__create{justify-self:stretch;padding:8px 14px;color:#fff;background:#2563eb;border:1px solid #1d4ed8;border-radius:9px}.mobile-employee-list__cards{display:grid;gap:10px}.mobile-employee-card{position:relative;min-width:0;padding:14px;background:#fff;border:1px solid #d8e1eb;border-radius:12px}.mobile-employee-card header{display:flex;min-width:0;align-items:center;gap:10px}.mobile-employee-card__avatar{display:grid;flex:0 0 44px;width:44px;height:44px;place-items:center;color:#1d4ed8;background:#dbeafe;border-radius:50%;font-size:18px;font-weight:700}.mobile-employee-card__identity{display:grid;min-width:0;gap:3px}.mobile-employee-card__identity strong,.mobile-employee-card__identity span{overflow-wrap:anywhere}.mobile-employee-card__identity span{color:#64748b;font-size:13px}.mobile-employee-card__status{margin-left:auto;padding:4px 8px;color:#166534;background:#dcfce7;border-radius:999px;font-size:12px}.mobile-employee-card--inactive .mobile-employee-card__status{color:#475569;background:#e2e8f0}.mobile-employee-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.mobile-employee-card dl>div{min-width:0}.mobile-employee-card dt{color:#64748b;font-size:12px}.mobile-employee-card dd{margin:3px 0 0;color:#0f172a;overflow-wrap:anywhere}.mobile-employee-card__photo{display:flex;min-width:0;align-items:center;gap:8px;padding:10px 0;border-top:1px solid #edf2f7;color:#64748b;font-size:13px}.mobile-employee-card__photo>span:first-child{margin-right:auto}.mobile-employee-card button,.mobile-employee-card__upload{display:inline-flex;align-items:center;justify-content:center;padding:6px 9px;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font:inherit}.mobile-employee-card__upload{cursor:pointer}.mobile-employee-card__upload input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.mobile-employee-card footer{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding-top:10px;border-top:1px solid #edf2f7}.mobile-employee-card footer button{min-width:0;padding-inline:4px;overflow-wrap:anywhere}.mobile-employee-card footer .mobile-employee-card__danger{color:#b91c1c;background:#fef2f2;border-color:#fecaca}.mobile-employee-list__empty{margin:12px 0;color:#64748b;text-align:center}@media(max-width:380px){.mobile-employee-card dl{grid-template-columns:1fr}.mobile-employee-card footer{grid-template-columns:1fr}.mobile-employee-card__photo{align-items:stretch;flex-direction:column}.mobile-employee-card__photo>span:first-child{margin-right:0}}
</style>
