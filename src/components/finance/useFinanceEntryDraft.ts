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
  if (!paymentDate.trim()) return '请选择支付日期'
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1
    if (!row.item.trim()) return `第 ${rowNumber} 行：开支项目必填`
    if (!Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0) return `第 ${rowNumber} 行：开支金额必须大于 0`
    if (!row.paymentMethod) return `第 ${rowNumber} 行：支付方式必填`
  }
  return ''
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
