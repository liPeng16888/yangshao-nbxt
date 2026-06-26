<template>
  <section class="panel finance-form">
    <div class="panel__header">
      <h2>新增支出账单</h2>
    </div>
    <div class="panel__body">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="finance-form__grid">
          <el-form-item label="支付日期" prop="paymentDate">
            <el-date-picker v-model="form.paymentDate" type="date" value-format="YYYY-MM-DD" />
          </el-form-item>
          <el-form-item label="开支项目" prop="item">
            <el-input v-model.trim="form.item" />
          </el-form-item>
          <el-form-item label="开支金额" prop="amount">
            <el-input-number v-model="form.amount" :min="0" :precision="2" controls-position="right" />
          </el-form-item>
          <el-form-item label="支付方式" prop="paymentMethod">
            <el-radio-group v-model="form.paymentMethod">
              <el-radio-button label="cash">现金支付</el-radio-button>
              <el-radio-button label="online">线上支付</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </div>

        <el-form-item label="支付截图">
          <el-upload
            :auto-upload="false"
            :limit="1"
            :on-change="handleScreenshotChange"
            :on-remove="handleScreenshotRemove"
            list-type="picture-card"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model.trim="form.remark" type="textarea" :rows="3" />
        </el-form-item>

        <el-button type="primary" :loading="submitting" @click="submit">提交支出</el-button>
      </el-form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules, UploadFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { FinancePayload } from '@/types/finance'
import { todayInBeijing } from '@/utils/date'
import { validateFinancePayload } from '@/utils/validators'

const emit = defineEmits<{
  submit: [payload: FinancePayload]
}>()

const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive<FinancePayload>({
  paymentDate: todayInBeijing(),
  item: '',
  amount: 0,
  paymentMethod: 'online',
  screenshotUrl: '',
  remark: ''
})

const rules: FormRules = {
  paymentDate: [{ required: true, message: '请选择支付日期', trigger: 'change' }],
  item: [{ required: true, message: '请输入开支项目', trigger: 'blur' }],
  amount: [{ required: true, message: '请输入开支金额', trigger: 'change' }],
  paymentMethod: [{ required: true, message: '请选择支付方式', trigger: 'change' }]
}

function handleScreenshotChange(file: UploadFile) {
  if (file.raw) form.screenshotUrl = URL.createObjectURL(file.raw)
}

function handleScreenshotRemove() {
  form.screenshotUrl = ''
}

async function submit() {
  await formRef.value?.validate()
  const errors = validateFinancePayload(form)
  if (errors.length) {
    ElMessage.error(errors[0])
    return
  }
  submitting.value = true
  try {
    emit('submit', { ...form })
    Object.assign(form, {
      paymentDate: todayInBeijing(),
      item: '',
      amount: 0,
      paymentMethod: 'online',
      screenshotUrl: '',
      remark: ''
    })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.finance-form__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 12px;
}

@media (max-width: 900px) {
  .finance-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
