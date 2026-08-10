<template>
  <PageShell title="员工档案" description="管理员工人事信息、薪资参数和私有照片；敏感信息默认脱敏。" :show-month="false" :show-employee="false" @refresh="load">
    <div class="toolbar">
      <el-input v-model="keyword" clearable placeholder="搜索编号、姓名或手机" style="width:260px" />
      <el-button type="primary" @click="openCreate">新增员工</el-button>
    </div>
    <el-table :data="filtered" empty-text="暂无员工档案">
      <el-table-column prop="employeeNumber" label="编号" width="100"/><el-table-column prop="name" label="姓名" width="110"/>
      <el-table-column prop="phone" label="手机" width="130"/><el-table-column label="照片" width="72"><template #default="{ row }"><el-button v-if="row.hasPhoto" link type="primary" @click="previewPhoto(row)">查看</el-button><span v-else class="muted">无</span></template></el-table-column><el-table-column prop="idCardMasked" label="身份证" min-width="160"/>
      <el-table-column prop="bankCardMasked" label="银行卡" min-width="160"/><el-table-column prop="baseSalary" label="基本月薪" width="110"><template #default="{ row }">¥{{ row.baseSalary.toFixed(2) }}</template></el-table-column>
      <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'">{{ statusName(row.status) }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="265" fixed="right"><template #default="{ row }">
        <el-button link type="primary" @click="openEdit(row)">编辑</el-button><el-button link @click="reveal(row)">查看敏感信息</el-button>
        <el-upload :show-file-list="false" :auto-upload="false" accept="image/png,image/jpeg,image/webp" :on-change="(file:any) => upload(row, file.raw)" style="display:inline-block"><el-button link type="primary">照片</el-button></el-upload>
        <el-button link type="danger" @click="removeEmployee(row)">删除/停用</el-button>
      </template></el-table-column>
    </el-table>
  </PageShell>
  <el-dialog v-model="visible" :title="editingId ? '编辑员工' : '新增员工'" width="760px" :close-on-click-modal="false">
    <el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon />
    <el-form label-position="top" class="form-grid">
      <el-form-item label="员工编号" required><el-input v-model="form.employeeNumber"/></el-form-item><el-form-item label="姓名" required><el-input v-model="form.name"/></el-form-item>
      <el-form-item label="在职状态"><el-select v-model="form.status"><el-option label="在职" value="ACTIVE"/><el-option label="停用" value="INACTIVE"/><el-option label="已离职" value="TERMINATED"/></el-select></el-form-item>
      <el-form-item label="手机"><el-input v-model="form.phone"/></el-form-item><el-form-item label="身份证"><el-input v-model="form.idCard" placeholder="编辑时留空保持原值"/></el-form-item><el-form-item label="银行卡"><el-input v-model="form.bankCard"/></el-form-item>
      <el-form-item label="住址"><el-input v-model="form.address"/></el-form-item><el-form-item label="紧急联系人"><el-input v-model="form.emergencyContact"/></el-form-item><el-form-item label="入职日期" required><el-date-picker v-model="form.hireDate" type="date" value-format="YYYY-MM-DD"/></el-form-item>
      <el-form-item label="基本月薪"><el-input-number v-model="form.baseSalary" :min="0"/></el-form-item><el-form-item label="全勤奖"><el-input-number v-model="form.attendanceBonus" :min="0"/></el-form-item><el-form-item label="加班时薪"><el-input-number v-model="form.overtimeHourlyRate" :min="0"/></el-form-item><el-form-item label="默认月休额度"><el-input-number v-model="form.restQuotaDays" :min="0"/></el-form-item>
    </el-form><template #footer><el-button @click="visible=false">取消</el-button><el-button type="primary" :loading="store.saving" @click="save">保存</el-button></template>
  </el-dialog>
  <el-dialog v-model="revealVisible" title="敏感信息（本次查看）" width="560px"><el-descriptions v-if="revealed" :column="1" border><el-descriptions-item label="身份证">{{ revealed.idCard || '-' }}</el-descriptions-item><el-descriptions-item label="银行卡">{{ revealed.bankCard || '-' }}</el-descriptions-item><el-descriptions-item label="住址">{{ revealed.address || '-' }}</el-descriptions-item><el-descriptions-item label="紧急联系人">{{ revealed.emergencyContact || '-' }}</el-descriptions-item></el-descriptions></el-dialog>
  <el-dialog v-model="photoVisible" title="员工私有照片" width="520px" @closed="releasePhoto"><img v-if="photoUrl" :src="photoUrl" alt="员工照片" style="display:block;max-width:100%;max-height:65vh;margin:auto"/><el-empty v-else description="Mock 演示不存储实际照片文件"/></el-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'; import { ElMessage, ElMessageBox } from 'element-plus'; import dayjs from 'dayjs'
import PageShell from './EmployeeAttendancePageShell.vue'; import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'; import * as api from '@/api/employeeAttendance'; import type { Employee, EmployeePayload, RevealedEmployee } from '@/types/employeeAttendance'
const store=useEmployeeAttendanceStore(), keyword=ref(''), visible=ref(false), editingId=ref(''), formError=ref(''), revealVisible=ref(false), revealed=ref<RevealedEmployee|null>(null), photoVisible=ref(false), photoUrl=ref('')
const statusLabel={ACTIVE:'在职',INACTIVE:'停用',TERMINATED:'已离职'}; const statusName=(status:Employee['status'])=>statusLabel[status]; const blank=():EmployeePayload=>({employeeNumber:'',name:'',status:'ACTIVE',phone:'',idCard:'',bankCard:'',address:'',emergencyContact:'',hireDate:dayjs().format('YYYY-MM-DD'),baseSalary:0,attendanceBonus:0,overtimeHourlyRate:0,restQuotaDays:4}); const form=reactive<EmployeePayload>(blank())
const filtered=computed(()=>store.employees.filter(row=>!keyword.value||`${row.employeeNumber}${row.name}${row.phone}`.includes(keyword.value)))
async function load(){await store.loadEmployees().catch(()=>undefined)} function openCreate(){editingId.value='';Object.assign(form,blank());formError.value='';visible.value=true} function openEdit(row:Employee){editingId.value=row.id;Object.assign(form,blank(),row);formError.value='';visible.value=true}
async function save(){if(!form.employeeNumber.trim()||!form.name.trim()){formError.value='请填写员工编号和姓名';return}try{await store.run(()=>editingId.value?api.updateEmployee(editingId.value,{...form}):api.createEmployee({...form}),true);visible.value=false;await load();ElMessage.success('员工档案已保存')}catch(error){formError.value=error instanceof Error?error.message:'保存失败'}}
async function reveal(row:Employee){try{revealed.value=await api.revealEmployee(row.id);revealVisible.value=true}catch{/* global error */}} async function upload(row:Employee,file?:File){if(!file)return;await store.run(()=>api.uploadEmployeePhoto(row.id,file),true).then(load).then(()=>ElMessage.success('照片已保存')).catch(()=>undefined)} async function removeEmployee(row:Employee){try{await ElMessageBox.confirm('有历史记录的员工将改为停用或离职，是否继续？','确认',{type:'warning'});await api.deleteEmployee(row.id);await load()}catch{/* cancel */}} onMounted(load)
async function previewPhoto(row:Employee){releasePhoto();const blob=await api.readEmployeePhoto(row.id);if(blob)photoUrl.value=URL.createObjectURL(blob);photoVisible.value=true}function releasePhoto(){if(photoUrl.value)URL.revokeObjectURL(photoUrl.value);photoUrl.value=''}
</script>
