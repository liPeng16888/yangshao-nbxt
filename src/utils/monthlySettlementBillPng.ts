import type {
  MonthlyBillDraft,
  MonthlyBillEntry,
  MonthlyBillTableLayout
} from '@/types/monthlySettlementBill'
import {
  createMonthlyBillFilename,
  createMonthlyBillTableLayout,
  formatMonthlyBillDate,
  formatMonthlyBillMoney,
  formatMonthlyBillMonth,
  validateMonthlyBillDraft
} from './monthlySettlementBill'

const PIXEL_RATIO = 2
const DATE_WIDTH = 110
const ELEMENT_WIDTH = 120
const QUANTITY_WIDTH = 70
const PRICE_WIDTH = 110
const TITLE_HEIGHT = 94
const HEADER_HEIGHT = 42
const ROW_HEIGHT = 38
const TOTAL_HEIGHT = 46
const EXPORT_MARGIN = 24
const FONT_FAMILY = 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'

export interface MonthlyBillCanvasLayout {
  width: number
  height: number
  groupCount: number
  table: MonthlyBillTableLayout
}

export function createMonthlyBillCanvasLayout(draft: MonthlyBillDraft): MonthlyBillCanvasLayout {
  const table = createMonthlyBillTableLayout(draft, 5)
  const groupWidth = ELEMENT_WIDTH + QUANTITY_WIDTH + PRICE_WIDTH
  const width = DATE_WIDTH + table.groupCount * groupWidth
  const bodyRows = table.detailRows.length + table.summaryRows.length
  const height = TITLE_HEIGHT + HEADER_HEIGHT + bodyRows * ROW_HEIGHT + TOTAL_HEIGHT

  return { width, height, groupCount: table.groupCount, table }
}

export async function downloadMonthlyBillAsPng(
  draft: MonthlyBillDraft,
  filename = createMonthlyBillFilename(draft)
): Promise<boolean> {
  try {
    if (validateMonthlyBillDraft(draft).length) return false

    const layout = createMonthlyBillCanvasLayout(draft)
    const canvas = document.createElement('canvas')
    const exportWidth = layout.width + EXPORT_MARGIN * 2
    const exportHeight = layout.height + EXPORT_MARGIN * 2
    canvas.width = exportWidth * PIXEL_RATIO
    canvas.height = exportHeight * PIXEL_RATIO

    const context = canvas.getContext('2d')
    if (!context) return false

    context.scale(PIXEL_RATIO, PIXEL_RATIO)
    drawMonthlyBillCanvas(context, draft, layout, exportWidth, exportHeight)
    return downloadCanvasBlob(canvas, filename)
  } catch {
    return false
  }
}

function drawMonthlyBillCanvas(
  context: CanvasRenderingContext2D,
  draft: MonthlyBillDraft,
  layout: MonthlyBillCanvasLayout,
  exportWidth: number,
  exportHeight: number
) {
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, exportWidth, exportHeight)
  context.save()
  context.translate(EXPORT_MARGIN, EXPORT_MARGIN)

  context.strokeStyle = '#1f2937'
  context.lineWidth = 1
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  drawText(context, draft.title, layout.width / 2, 30, 'bold 26px', '#111827', layout.width - 24)
  drawText(
    context,
    `账期：${formatMonthlyBillMonth(draft.month)}`,
    layout.width / 2,
    68,
    '15px',
    '#475569',
    layout.width - 24
  )
  drawHeader(context, layout)
  drawDetailRows(context, layout.table, layout.groupCount)
  drawSummaryRows(context, layout.table, layout.groupCount)
  drawTotal(context, draft, layout)

  context.restore()
}

function drawHeader(context: CanvasRenderingContext2D, layout: MonthlyBillCanvasLayout) {
  const top = TITLE_HEIGHT
  drawCell(context, 0, top, DATE_WIDTH, HEADER_HEIGHT, '日期', 'bold 15px')

  for (let index = 0; index < layout.groupCount; index += 1) {
    const groupLeft = DATE_WIDTH + index * getGroupWidth()
    drawCell(context, groupLeft, top, ELEMENT_WIDTH, HEADER_HEIGHT, '元素', 'bold 15px')
    drawCell(
      context,
      groupLeft + ELEMENT_WIDTH,
      top,
      QUANTITY_WIDTH,
      HEADER_HEIGHT,
      '数量',
      'bold 15px'
    )
    drawCell(
      context,
      groupLeft + ELEMENT_WIDTH + QUANTITY_WIDTH,
      top,
      PRICE_WIDTH,
      HEADER_HEIGHT,
      '价格',
      'bold 15px'
    )
  }
}

function drawDetailRows(
  context: CanvasRenderingContext2D,
  table: MonthlyBillTableLayout,
  groupCount: number
) {
  let top = TITLE_HEIGHT + HEADER_HEIGHT
  table.detailRows.forEach((row) => {
    if (row.showDate) {
      drawCell(
        context,
        0,
        top,
        DATE_WIDTH,
        row.dateRowSpan * ROW_HEIGHT,
        formatMonthlyBillDate(row.date),
        '15px'
      )
    }
    drawEntryCells(context, row.entries, top, groupCount)
    top += ROW_HEIGHT
  })
}

function drawSummaryRows(
  context: CanvasRenderingContext2D,
  table: MonthlyBillTableLayout,
  groupCount: number
) {
  let top = TITLE_HEIGHT + HEADER_HEIGHT + table.detailRows.length * ROW_HEIGHT
  if (table.summaryRows.length) {
    drawCell(
      context,
      0,
      top,
      DATE_WIDTH,
      table.summaryRows.length * ROW_HEIGHT,
      '元素合计',
      '15px'
    )
  }
  table.summaryRows.forEach((row) => {
    row.forEach((total, index) => {
      const groupLeft = DATE_WIDTH + index * getGroupWidth()
      drawCell(context, groupLeft, top, ELEMENT_WIDTH, ROW_HEIGHT, total.elementLabel, '15px')
      drawCell(context, groupLeft + ELEMENT_WIDTH, top, QUANTITY_WIDTH, ROW_HEIGHT, `${total.quantity}`, '15px')
      drawCell(
        context,
        groupLeft + ELEMENT_WIDTH + QUANTITY_WIDTH,
        top,
        PRICE_WIDTH,
        ROW_HEIGHT,
        formatMonthlyBillMoney(total.amount),
        '15px'
      )
    })

    drawEmptyGroupCells(context, row.length, groupCount, top)
    top += ROW_HEIGHT
  })
}

function drawEntryCells(
  context: CanvasRenderingContext2D,
  entries: MonthlyBillEntry[],
  top: number,
  groupCount: number
) {
  entries.forEach((entry, index) => {
    const groupLeft = DATE_WIDTH + index * getGroupWidth()
    drawCell(context, groupLeft, top, ELEMENT_WIDTH, ROW_HEIGHT, entry.elementLabel, '15px')
    drawCell(context, groupLeft + ELEMENT_WIDTH, top, QUANTITY_WIDTH, ROW_HEIGHT, `${entry.quantity}`, '15px')
    drawCell(
      context,
      groupLeft + ELEMENT_WIDTH + QUANTITY_WIDTH,
      top,
      PRICE_WIDTH,
      ROW_HEIGHT,
      formatMonthlyBillMoney(entry.subtotal),
      '15px'
    )
  })

  drawEmptyGroupCells(context, entries.length, groupCount, top)
}

function drawEmptyGroupCells(
  context: CanvasRenderingContext2D,
  usedGroups: number,
  groupCount: number,
  top: number
) {
  for (let index = usedGroups; index < groupCount; index += 1) {
    const groupLeft = DATE_WIDTH + index * getGroupWidth()
    drawCell(context, groupLeft, top, ELEMENT_WIDTH, ROW_HEIGHT, '', '15px')
    drawCell(context, groupLeft + ELEMENT_WIDTH, top, QUANTITY_WIDTH, ROW_HEIGHT, '', '15px')
    drawCell(
      context,
      groupLeft + ELEMENT_WIDTH + QUANTITY_WIDTH,
      top,
      PRICE_WIDTH,
      ROW_HEIGHT,
      '',
      '15px'
    )
  }
}

function drawTotal(
  context: CanvasRenderingContext2D,
  draft: MonthlyBillDraft,
  layout: MonthlyBillCanvasLayout
) {
  const top = layout.height - TOTAL_HEIGHT
  drawCell(
    context,
    0,
    top,
    layout.width,
    TOTAL_HEIGHT,
    `总金额：${formatMonthlyBillMoney(draft.totalAmount)}`,
    'bold 18px',
    '#e53935'
  )
}

function drawCell(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  text: string,
  font: string,
  color = '#111827'
) {
  context.strokeRect(left, top, width, height)
  if (!text) return
  drawText(context, text, left + width / 2, top + height / 2, font, color, Math.max(1, width - 12))
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color = '#111827',
  maxWidth = Number.POSITIVE_INFINITY
) {
  context.fillStyle = color
  context.font = `${font} ${FONT_FAMILY}`
  const safeMaxWidth = Number.isFinite(maxWidth) ? Math.max(1, maxWidth) : 1
  context.fillText(fitCanvasText(context, text, safeMaxWidth), x, y, safeMaxWidth)
}

function fitCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text

  const ellipsis = '…'
  if (context.measureText(ellipsis).width > maxWidth) return ''
  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (context.measureText(`${text.slice(0, middle)}${ellipsis}`).width <= maxWidth) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  return `${text.slice(0, low)}${ellipsis}`
}

function getGroupWidth() {
  return ELEMENT_WIDTH + QUANTITY_WIDTH + PRICE_WIDTH
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
    const timeout = window.setTimeout(() => finish(false), 5000)

    try {
      canvas.toBlob((blob) => {
        if (settled) return
        if (!blob) {
          finish(false)
          return
        }

        let blobUrl: string | null = null
        let link: HTMLAnchorElement | null = null
        try {
          blobUrl = URL.createObjectURL(blob)
          link = document.createElement('a')
          link.download = filename
          link.href = blobUrl
          link.style.display = 'none'
          document.body.appendChild(link)
          link.click()
          window.setTimeout(() => cleanupDownload(link, blobUrl), 1000)
          finish(true)
        } catch {
          cleanupDownload(link, blobUrl)
          finish(false)
        }
      }, 'image/png')
    } catch {
      finish(false)
    }
  })
}

function cleanupDownload(link: HTMLAnchorElement | null, blobUrl: string | null) {
  try {
    link?.remove()
  } catch {
    // Cleanup should not turn a completed export into an unhandled rejection.
  }
  if (!blobUrl) return
  try {
    URL.revokeObjectURL(blobUrl)
  } catch {
    // URL revocation is best effort after the download attempt.
  }
}
