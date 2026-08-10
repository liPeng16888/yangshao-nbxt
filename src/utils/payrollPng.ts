import type { PayrollItem, PayrollRun } from '@/types/employeeAttendance'

const PIXEL_RATIO = 2
const EXPORT_TIMEOUT_MS = 5000
const FONT_FAMILY = 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
const PAGE_MARGIN = 28
const PAYSLIP_WIDTH = 1000
const PAYSLIP_TITLE_HEIGHT = 106
const PAYSLIP_ROW_HEIGHT = 42
const PAYSLIP_SECTION_GAP = 18
const SUMMARY_WIDTH = 1540
const SUMMARY_TITLE_HEIGHT = 112
const SUMMARY_HEADER_HEIGHT = 48
const SUMMARY_ROW_HEIGHT = 42
const SUMMARY_TOTAL_HEIGHT = 52

export interface EmployeePayrollCanvasLayout {
  width: number
  height: number
  adjustmentRows: number
  issueRows: number
}

export interface PayrollSummaryCanvasLayout {
  width: number
  height: number
  rowCount: number
}

export function formatPayrollMoney(value: number) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0
  return amount < 0 ? `-¥${Math.abs(amount).toFixed(2)}` : `¥${amount.toFixed(2)}`
}

export function formatPayrollMonth(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  return match ? `${match[1]}年${match[2]}月` : month
}

export function createEmployeePayrollCanvasLayout(item: PayrollItem): EmployeePayrollCanvasLayout {
  const adjustmentRows = Math.max(1, item.adjustments.length)
  const issueRows = Math.max(1, item.issues.length)
  const fixedRows = 12
  const contentHeight = (fixedRows + adjustmentRows + issueRows) * PAYSLIP_ROW_HEIGHT
  return {
    width: PAYSLIP_WIDTH,
    height: PAGE_MARGIN * 2 + PAYSLIP_TITLE_HEIGHT + contentHeight + PAYSLIP_SECTION_GAP * 2,
    adjustmentRows,
    issueRows
  }
}

export function createPayrollSummaryCanvasLayout(run: PayrollRun): PayrollSummaryCanvasLayout {
  return {
    width: SUMMARY_WIDTH,
    height: PAGE_MARGIN * 2 + SUMMARY_TITLE_HEIGHT + SUMMARY_HEADER_HEIGHT
      + run.items.length * SUMMARY_ROW_HEIGHT + SUMMARY_TOTAL_HEIGHT,
    rowCount: run.items.length
  }
}

export async function downloadEmployeePayrollPng(
  item: PayrollItem,
  filename = `${item.calculationSnapshot.generatedAt.slice(0, 7)}_${item.employee.employeeNumber}_${item.employee.name}_工资条`
): Promise<boolean> {
  try {
    const layout = createEmployeePayrollCanvasLayout(item)
    return await renderAndDownload(layout, filename, (context) => {
      drawEmployeePayslip(context, item, layout)
    })
  } catch {
    return false
  }
}

export async function downloadPayrollSummaryPng(
  run: PayrollRun,
  filename = `${run.month}_全员工资汇总表`
): Promise<boolean> {
  try {
    const layout = createPayrollSummaryCanvasLayout(run)
    return await renderAndDownload(layout, filename, (context) => {
      drawPayrollSummary(context, run, layout)
    })
  } catch {
    return false
  }
}

async function renderAndDownload(
  layout: { width: number; height: number },
  filename: string,
  draw: (context: CanvasRenderingContext2D) => void
) {
  if (typeof document === 'undefined') return false
  const canvas = document.createElement('canvas')
  canvas.width = layout.width * PIXEL_RATIO
  canvas.height = layout.height * PIXEL_RATIO
  const context = canvas.getContext('2d')
  if (!context) return false

  context.scale(PIXEL_RATIO, PIXEL_RATIO)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, layout.width, layout.height)
  draw(context)
  return downloadCanvasBlob(canvas, sanitizePngFilename(filename))
}

function drawEmployeePayslip(
  context: CanvasRenderingContext2D,
  item: PayrollItem,
  layout: EmployeePayrollCanvasLayout
) {
  const { employee, calculationSnapshot: snapshot } = item
  const input = snapshot.input
  const result = snapshot.result
  const left = PAGE_MARGIN
  const contentWidth = layout.width - PAGE_MARGIN * 2

  context.strokeStyle = '#64748b'
  context.lineWidth = 1
  context.textBaseline = 'middle'

  drawText(context, `${employee.name}工资条`, layout.width / 2, PAGE_MARGIN + 27, 'bold 26px', '#0f172a', contentWidth)
  drawText(
    context,
    `员工编号：${employee.employeeNumber}    生成时间：${formatTimestamp(snapshot.generatedAt)}`,
    layout.width / 2,
    PAGE_MARGIN + 68,
    '14px',
    '#475569',
    contentWidth
  )

  let top = PAGE_MARGIN + PAYSLIP_TITLE_HEIGHT
  const standardRows: Array<[string, string]> = [
    ['基本月薪', formatPayrollMoney(input.baseSalary)],
    ['全勤奖', formatPayrollMoney(result.attendanceBonus)],
    ['应出勤天数 / 月休额度', `${input.scheduledWorkDays.toFixed(2)} 天 / ${input.restQuotaDays.toFixed(2)} 天`],
    ['计入月休请假 / 超额请假', `${input.countedLeaveDays.toFixed(2)} 天 / ${result.excessLeaveDays.toFixed(2)} 天`],
    ['超额请假扣款', formatPayrollMoney(-Math.abs(result.leaveDeduction))],
    ['缺勤天数 / 缺勤扣款', `${input.absenceDays.toFixed(2)} 天 / ${formatPayrollMoney(-Math.abs(result.absenceDeduction))}`],
    ['加班时长 / 加班费', `${result.overtimeHours.toFixed(2)} 小时 / ${formatPayrollMoney(result.overtimePay)}`],
    ['提成', formatPayrollMoney(result.commissionAmount)],
    ['奖金', formatPayrollMoney(result.bonusAmount)],
    ['人工调整合计', formatPayrollMoney(result.adjustmentAmount)],
    ['日工资', formatPayrollMoney(result.dailyRate)],
    ['应发工资', formatPayrollMoney(result.payableAmount)]
  ]
  standardRows.forEach(([label, value], index) => {
    drawKeyValueRow(context, left, top, contentWidth, label, value, index === standardRows.length - 1)
    top += PAYSLIP_ROW_HEIGHT
  })

  top += PAYSLIP_SECTION_GAP
  const adjustments = item.adjustments.length
    ? item.adjustments.map((adjustment) => [`${adjustment.reason}`, formatPayrollMoney(adjustment.amount)] as const)
    : [['无人工调整', '—'] as const]
  adjustments.forEach(([reason, amount], index) => {
    drawKeyValueRow(context, left, top, contentWidth, index === 0 ? `调整明细：${reason}` : reason, amount)
    top += PAYSLIP_ROW_HEIGHT
  })

  top += PAYSLIP_SECTION_GAP
  const issues = item.issues.length ? item.issues : ['无异常事项']
  issues.forEach((issue, index) => {
    drawKeyValueRow(context, left, top, contentWidth, index === 0 ? '异常提示' : '', issue, false, '#b45309')
    top += PAYSLIP_ROW_HEIGHT
  })
}

function drawPayrollSummary(
  context: CanvasRenderingContext2D,
  run: PayrollRun,
  layout: PayrollSummaryCanvasLayout
) {
  context.strokeStyle = '#64748b'
  context.lineWidth = 1
  context.textBaseline = 'middle'
  const contentWidth = layout.width - PAGE_MARGIN * 2
  drawText(context, `${formatPayrollMonth(run.month)}全员工资汇总表`, layout.width / 2, PAGE_MARGIN + 28, 'bold 26px', '#0f172a', contentWidth)
  drawText(
    context,
    `状态：${run.status === 'CONFIRMED' ? '已确认' : '草稿'}`,
    PAGE_MARGIN,
    PAGE_MARGIN + 72,
    '14px',
    '#475569',
    240,
    'left'
  )
  drawText(
    context,
    `员工人数：${run.items.length}    异常：${run.issueCount}`,
    layout.width - PAGE_MARGIN,
    PAGE_MARGIN + 72,
    '14px',
    '#475569',
    320,
    'right'
  )

  const columns = [
    { label: '编号', width: 82 },
    { label: '姓名', width: 116 },
    { label: '基本工资', width: 126 },
    { label: '全勤奖', width: 112 },
    { label: '加班费', width: 112 },
    { label: '提成', width: 108 },
    { label: '奖金', width: 108 },
    { label: '请假扣款', width: 122 },
    { label: '缺勤扣款', width: 122 },
    { label: '调整', width: 108 },
    { label: '应发工资', width: 132 },
    { label: '异常', width: 236 }
  ]
  let top = PAGE_MARGIN + SUMMARY_TITLE_HEIGHT
  drawTableRow(context, PAGE_MARGIN, top, columns, columns.map((column) => column.label), true)
  top += SUMMARY_HEADER_HEIGHT

  run.items.forEach((item) => {
    const { input, result } = item.calculationSnapshot
    drawTableRow(context, PAGE_MARGIN, top, columns, [
      item.employee.employeeNumber,
      item.employee.name,
      formatPayrollMoney(input.baseSalary),
      formatPayrollMoney(result.attendanceBonus),
      formatPayrollMoney(result.overtimePay),
      formatPayrollMoney(result.commissionAmount),
      formatPayrollMoney(result.bonusAmount),
      formatPayrollMoney(-Math.abs(result.leaveDeduction)),
      formatPayrollMoney(-Math.abs(result.absenceDeduction)),
      formatPayrollMoney(result.adjustmentAmount),
      formatPayrollMoney(item.payableAmount),
      item.issues.join('；') || '—'
    ])
    top += SUMMARY_ROW_HEIGHT
  })

  context.fillStyle = '#eff6ff'
  context.fillRect(PAGE_MARGIN, top, contentWidth, SUMMARY_TOTAL_HEIGHT)
  context.strokeRect(PAGE_MARGIN, top, contentWidth, SUMMARY_TOTAL_HEIGHT)
  drawText(
    context,
    '应发合计',
    layout.width - PAGE_MARGIN - 250,
    top + SUMMARY_TOTAL_HEIGHT / 2,
    'bold 19px',
    '#dc2626',
    180,
    'right'
  )
  drawText(
    context,
    formatPayrollMoney(run.totalAmount),
    layout.width - PAGE_MARGIN - 16,
    top + SUMMARY_TOTAL_HEIGHT / 2,
    'bold 19px',
    '#dc2626',
    220,
    'right'
  )
}

function drawKeyValueRow(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  label: string,
  value: string,
  emphasized = false,
  valueColor = '#0f172a'
) {
  const labelWidth = 300
  if (emphasized) {
    context.fillStyle = '#eff6ff'
    context.fillRect(left, top, width, PAYSLIP_ROW_HEIGHT)
  }
  context.strokeRect(left, top, labelWidth, PAYSLIP_ROW_HEIGHT)
  context.strokeRect(left + labelWidth, top, width - labelWidth, PAYSLIP_ROW_HEIGHT)
  drawText(context, label, left + 14, top + PAYSLIP_ROW_HEIGHT / 2, emphasized ? 'bold 16px' : '15px', '#334155', labelWidth - 28, 'left')
  drawText(context, value, left + width - 14, top + PAYSLIP_ROW_HEIGHT / 2, emphasized ? 'bold 18px' : '15px', emphasized ? '#dc2626' : valueColor, width - labelWidth - 28, 'right')
}

function drawTableRow(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  columns: Array<{ label: string; width: number }>,
  values: string[],
  header = false
) {
  let cursor = left
  const height = header ? SUMMARY_HEADER_HEIGHT : SUMMARY_ROW_HEIGHT
  columns.forEach((column, index) => {
    if (header) {
      context.fillStyle = '#eaf2fb'
      context.fillRect(cursor, top, column.width, height)
    }
    context.strokeRect(cursor, top, column.width, height)
    drawText(context, values[index] || '', cursor + column.width / 2, top + height / 2, header ? 'bold 14px' : '13px', '#0f172a', column.width - 10)
    cursor += column.width
  })
}

function drawText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  font: string,
  color: string,
  maxWidth: number,
  align: CanvasTextAlign = 'center'
) {
  context.font = `${font} ${FONT_FAMILY}`
  context.fillStyle = color
  context.textAlign = align
  context.fillText(fitCanvasText(context, value, Math.max(1, maxWidth)), x, y, Math.max(1, maxWidth))
}

function fitCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) return value
  const ellipsis = '…'
  let low = 0
  let high = value.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (context.measureText(`${value.slice(0, middle)}${ellipsis}`).width <= maxWidth) low = middle
    else high = middle - 1
  }
  return low > 0 ? `${value.slice(0, low)}${ellipsis}` : ''
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function sanitizePngFilename(filename: string) {
  const withoutExtension = filename.replace(/(?:\.png)+$/i, '')
  const safeBase = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 120)
    .trim() || '工资图片'
  return `${safeBase}.png`
}

function downloadCanvasBlob(canvas: HTMLCanvasElement, filename: string) {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve(result)
    }
    const timeout = window.setTimeout(() => finish(false), EXPORT_TIMEOUT_MS)

    try {
      canvas.toBlob((blob) => {
        if (settled) return
        if (!blob) {
          finish(false)
          return
        }

        let objectUrl: string | null = null
        let link: HTMLAnchorElement | null = null
        try {
          objectUrl = URL.createObjectURL(blob)
          if (!objectUrl) throw new Error('Object URL unavailable')
          link = document.createElement('a')
          link.href = objectUrl
          link.download = filename
          link.style.display = 'none'
          document.body.appendChild(link)
          link.click()
          finish(cleanupDownload(link, objectUrl))
        } catch {
          cleanupDownload(link, objectUrl)
          finish(false)
        }
      }, 'image/png')
    } catch {
      finish(false)
    }
  })
}

function cleanupDownload(link: HTMLAnchorElement | null, objectUrl: string | null) {
  let cleaned = true
  if (link) {
    try {
      link.remove()
    } catch {
      try {
        link.parentNode?.removeChild(link)
      } catch {
        cleaned = false
      }
    }
  }
  if (objectUrl) {
    try {
      URL.revokeObjectURL(objectUrl)
    } catch {
      cleaned = false
    }
  }
  return cleaned
}
