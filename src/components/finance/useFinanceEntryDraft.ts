import type { UploadUserFile } from 'element-plus'
import { uploadImages } from '@/api/upload'
import type { FinanceEntry, FinancePayload, PaymentMethod } from '@/types/finance'

export interface ExpenseDraftRow {
  id: string
  item: string
  amount: number
  paymentMethod: PaymentMethod | ''
  files: UploadUserFile[]
  remark: string
}

let rowSequence = 0

export function createRow(): ExpenseDraftRow {
  rowSequence += 1
  return {
    id: `${Date.now()}-${rowSequence}`,
    item: '',
    amount: 0,
    paymentMethod: '',
    files: [],
    remark: ''
  }
}

export function validateRows(paymentDate: string, rows: ExpenseDraftRow[]) {
  const normalizedPaymentDate = typeof paymentDate === 'string' ? paymentDate.trim() : ''
  if (!normalizedPaymentDate) return '请选择支付日期'
  if (!isStrictCalendarDate(normalizedPaymentDate)) return '支付日期格式无效'
  if (!rows.length) return '请至少保留一条开支记录'
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1
    if (!row.item.trim()) return `第 ${rowNumber} 行：开支项目必填`
    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount <= 0) return `第 ${rowNumber} 行：开支金额必须大于 0`
    const cents = amount * 100
    if (Math.abs(cents - Math.round(cents)) > 1e-8) return `第 ${rowNumber} 行：开支金额最多保留两位小数`
    if (!row.paymentMethod) return `第 ${rowNumber} 行：支付方式必填`
    if (row.paymentMethod !== 'cash' && row.paymentMethod !== 'online') return `第 ${rowNumber} 行：支付方式必须为现金或线上`
  }
  return ''
}

function isStrictCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export async function buildPayloads(
  paymentDate: string,
  rows: ExpenseDraftRow[],
  uploadedUrlsByFile = new WeakMap<File, string>()
): Promise<FinancePayload[]> {
  const payloads: FinancePayload[] = []
  for (const row of rows) {
    const existingUrls = row.files
      .map((file) => (!file.raw && file.url ? file.url.trim() : ''))
      .filter(Boolean)
    const localFiles = Array.from(new Set(row.files.flatMap((file) => file.raw ? [file.raw as File] : [])))
    const missingFiles = localFiles.filter((file) => !uploadedUrlsByFile.has(file))
    if (missingFiles.length) {
      const uploadedUrls = await uploadImages(missingFiles)
      missingFiles.forEach((file, index) => {
        const url = uploadedUrls[index]
        if (url) uploadedUrlsByFile.set(file, url)
      })
    }
    const uploadedUrls = localFiles
      .map((file) => uploadedUrlsByFile.get(file) || '')
      .filter(Boolean)
    const screenshotUrls = Array.from(new Set([...existingUrls, ...uploadedUrls]))
    payloads.push({
      paymentDate: paymentDate.trim(),
      item: row.item.trim(),
      amount: Number(row.amount),
      paymentMethod: row.paymentMethod as PaymentMethod,
      screenshotUrl: screenshotUrls[0] || '',
      screenshotUrls,
      remark: row.remark.trim()
    })
  }
  return payloads
}

export function getFinanceScreenshotUrls(row: FinanceEntry) {
  return Array.from(new Set(row.screenshotUrls?.length ? row.screenshotUrls : row.screenshotUrl ? [row.screenshotUrl] : [])).filter(Boolean)
}
