<template>
  <div class="frontend-subaccounts-readonly">
    <div class="readonly-heading">
      <strong>客户前端子账号（只读）</strong>
      <span>由客户主账号自行创建和管理，后台仅同步查看。</span>
    </div>
    <div v-if="!rows.length" class="empty">未创建客户前端子账号</div>
    <div v-for="row in rows" v-else :key="row.id" class="subaccount-card">
      <div class="identity">
        <strong>{{ row.username }}</strong>
        <span>{{ row.account }}</span>
        <el-tag size="small" :type="row.disabled ? 'danger' : 'success'">{{ row.disabled ? '已停用' : '正常' }}</el-tag>
      </div>
      <div class="detail-grid">
        <div><span>访问密码</span>{{ row.requiresAccessGuardPassword ? '需要输入' : '无需输入' }}</div>
        <div><span>最后登录</span>{{ formatDate(row.lastLoginAt) }}</div>
        <div><span>创建时间</span>{{ formatDate(row.createdAt) }}</div>
      </div>
      <div class="permission-groups">
        <span>菜单权限</span>
        <div v-if="permissionGroups(row.permissions).length" class="permission-list">
          <p v-for="group in permissionGroups(row.permissions)" :key="group.label">
            <strong>{{ group.label }}：</strong>{{ group.children.join('、') }}
          </p>
        </div>
        <em v-else>未分配</em>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import type { AdminFrontendSubAccount, FrontendMenuPermission } from '../types'

defineProps<{ rows: AdminFrontendSubAccount[] }>()

const permissionCatalog: Array<{ label: string; children: Array<[FrontendMenuPermission, string]> }> = [
  { label: '数据计算', children: [['DATA_MAIN', '数据计算'], ['DATA_STANDARD_SAMPLE', '标样计算'], ['DATA_COEFFICIENT', '系数计算']] },
  { label: '化验报告', children: [['LAB_REPORT_IMAGE_TEMPLATE', '图片模板'], ['LAB_REPORT_SMS_TEMPLATE', '短信模板']] },
  { label: '员工考勤', children: [['ATTENDANCE_OVERVIEW', '考勤概览'], ['ATTENDANCE_EMPLOYEES', '员工档案'], ['ATTENDANCE_SCHEDULES', '排班管理'], ['ATTENDANCE_RECORDS', '考勤记录'], ['ATTENDANCE_LEAVE', '请假管理'], ['ATTENDANCE_COMPENSATION', '提成与奖金'], ['ATTENDANCE_PAYROLL', '工资统计']] },
  { label: '财务', children: [['FINANCE_EXPENSES', '支出账单'], ['FINANCE_INCOME', '收入账单'], ['FINANCE_UNSETTLED', '未结款'], ['FINANCE_MONTHLY_SETTLEMENT', '月结款'], ['FINANCE_PREPAID_ADD', '预存款添加'], ['FINANCE_PREPAID_CUSTOMERS', '预存款客户']] },
  { label: '报表', children: [['REPORTS', '报表']] },
  { label: '药品库存', children: [['MEDICINE_STOCK', '药品库存'], ['MEDICINE_INBOUND', '药品入库'], ['MEDICINE_OUTBOUND', '药品出库']] },
  { label: '客户总览', children: [['CUSTOMER_OVERVIEW', '客户总览']] },
  { label: '黑名单', children: [['BLACKLIST', '黑名单']] }
]

function permissionGroups(permissions: FrontendMenuPermission[]) {
  const assigned = new Set(permissions)
  return permissionCatalog.flatMap((group) => {
    const children = group.children.filter(([permission]) => assigned.has(permission)).map(([, label]) => label)
    return children.length ? [{ label: group.label, children }] : []
  })
}

function formatDate(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '尚未登录'
}
</script>

<style scoped>
.frontend-subaccounts-readonly { padding: 14px 18px; background: #f7faff; }
.readonly-heading { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.readonly-heading span, .empty { color: #8190a5; }
.subaccount-card { padding: 12px 14px; border: 1px solid #dce6f2; border-radius: 6px; background: #fff; }
.subaccount-card + .subaccount-card { margin-top: 10px; }
.identity { display: flex; align-items: center; gap: 10px; }
.identity > span { color: #64748b; }
.detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 10px; color: #334155; }
.detail-grid span, .permission-groups > span { display: block; margin-bottom: 3px; color: #8290a4; font-size: 12px; }
.permission-groups { margin-top: 10px; }
.permission-list { display: flex; flex-wrap: wrap; gap: 6px 18px; }
.permission-list p { margin: 0; color: #475569; }
.permission-groups em { color: #94a3b8; font-style: normal; }
</style>
