import type {
  LabReportDraft,
  LabReportElement,
  LabReportElementKey,
  LabReportElementSelection,
  LabReportSmsTemplate,
  LabReportTemplate
} from '@/types/labReport'
import type { SampleBlock } from '@/types/labSheet'
import type { Customer } from '@/types/customer'

export const LAB_REPORT_TEMPLATE_STORAGE_KEY = 'yangshao-lab-report-template'
export const LAB_REPORT_SMS_TEMPLATE_STORAGE_KEY = 'yangshao-lab-report-sms-template'
const MIN_REPORT_ELEMENT_COLUMNS = 5
const REPORT_FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", Arial, sans-serif'
const STATEMENT_FONT = `12px ${REPORT_FONT_FAMILY}`
const STATEMENT_LINE_HEIGHT = 17
const STATEMENT_HORIZONTAL_PADDING = 8

export const labReportElements: LabReportElement[] = [
  { key: 'aluminum', label: '三氧化二铝', symbol: 'Al₂O₃', source: 'result', field: 'aluminum' },
  { key: 'silicon', label: '二氧化硅', symbol: 'SiO₂', source: 'result', field: 'silicon' },
  { key: 'iron', label: '三氧化二铁', symbol: 'Fe₂O₃', source: 'result', field: 'iron' },
  { key: 'aluminumSiliconRatio', label: '铝硅比', symbol: 'A/S', source: 'result', field: 'aluminumSiliconRatio' },
  { key: 'sulfur', label: '全硫', symbol: 'S', source: 'input', field: 'sulfur' },
  { key: 'carbon', label: '碳', symbol: 'C', source: 'input', field: 'carbon' },
  { key: 'moisture', label: '水分', symbol: 'H₂O', source: 'result', field: 'moisture' },
  { key: 'calcium', label: '氧化钙', symbol: 'CaO', source: 'result', field: 'calcium' },
  { key: 'magnesium', label: '氧化镁', symbol: 'MgO', source: 'result', field: 'magnesium' },
  { key: 'whiteness', label: '白度', symbol: '', source: 'input', field: 'whiteness' },
  { key: 'density', label: '比重', symbol: '', source: 'result', field: 'density' },
  { key: 'titanium', label: '钛', symbol: 'Ti', source: 'result', field: 'titanium' },
  { key: 'burnLoss', label: '灼减', symbol: 'LOI', source: 'result', field: 'burnLoss' }
]

export const defaultLabReportTemplate: LabReportTemplate = {
  title: '清镇市王庄乡仰韶化验室化验报告',
  sampleUnit: '',
  inspector: '检验员',
  reviewer: '张文',
  address: '清镇市王庄乡拾稍坝王庄大街299A',
  phone: '17885650811 15886788090',
  statements: [
    '本报告涂改、复印无效。',
    '本化验室化验结果只对本次小样品负责，如客户需要保留小样，即客户送样之日起，只保留三日，望留样或复检者三日内办理，小样品袋的存放不延时，如带来不便，望谅解。',
    '本化验室所化验结果只供参考数据，不能做任何交易或其他凭证。如以本化验室结果为依据造成任何损失！本化验室不负所有经济损失及法律责任！等等。',
    '若对本报告有异议，请于报告之日起三日内向本化验室提出，逾期恕不受理。'
  ],
  sealImage: ''
}

export const defaultLabReportSmsTemplate: LabReportSmsTemplate = {
  prefix: '',
  suffix: ''
}

export function loadLabReportTemplate(): LabReportTemplate {
  if (typeof window === 'undefined') return { ...defaultLabReportTemplate }
  try {
    const raw = window.localStorage.getItem(LAB_REPORT_TEMPLATE_STORAGE_KEY)
    if (!raw) return { ...defaultLabReportTemplate }
    const parsed = JSON.parse(raw) as Partial<LabReportTemplate>
    return {
      ...defaultLabReportTemplate,
      ...parsed,
      statements: parsed.statements?.length ? parsed.statements : [...defaultLabReportTemplate.statements]
    }
  } catch {
    return { ...defaultLabReportTemplate }
  }
}

export function saveLabReportTemplate(template: LabReportTemplate) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    LAB_REPORT_TEMPLATE_STORAGE_KEY,
    JSON.stringify({
      ...template,
      updatedAt: new Date().toISOString()
    })
  )
}

export function loadLabReportSmsTemplate(): LabReportSmsTemplate {
  if (typeof window === 'undefined') return { ...defaultLabReportSmsTemplate }
  try {
    const raw = window.localStorage.getItem(LAB_REPORT_SMS_TEMPLATE_STORAGE_KEY)
    if (!raw) return { ...defaultLabReportSmsTemplate }
    const parsed = JSON.parse(raw) as Partial<LabReportSmsTemplate>
    return {
      ...defaultLabReportSmsTemplate,
      ...parsed
    }
  } catch {
    return { ...defaultLabReportSmsTemplate }
  }
}

export function saveLabReportSmsTemplate(template: LabReportSmsTemplate) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    LAB_REPORT_SMS_TEMPLATE_STORAGE_KEY,
    JSON.stringify({
      ...template,
      updatedAt: new Date().toISOString()
    })
  )
}

export function getBlockDisplayName(block: SampleBlock) {
  return block.inputs.sampleNumber?.trim() || block.inputs.sequence?.trim() || String(block.index).padStart(3, '0')
}

export function getBlockCustomerName(block: SampleBlock) {
  const selectedCustomers = block.inputs.customers?.map((customer) => customer.name).filter(Boolean).join('、')
  return block.inputs.customerText?.trim() || selectedCustomers || ''
}

export function getBlockCustomerDisplayText(block: SampleBlock) {
  const selectedCustomers = block.inputs.customers?.map(formatCustomerDisplayText).filter(Boolean).join('、')
  return selectedCustomers || block.inputs.customerText?.trim() || ''
}

function formatCustomerDisplayText(customer: Customer) {
  return [customer.name, customer.phone, customer.wechat, customer.wechatNickname, customer.note].map((value) => value?.trim()).filter(Boolean).join(' ')
}

export function detectReportElementKeys(block: SampleBlock): LabReportElementKey[] {
  return labReportElements
    .filter((element) => {
      if (element.key === 'aluminumSiliconRatio') {
        return hasEnteredNumber(block.inputs.aluminumRaw) && hasEnteredNumber(block.inputs.siliconRaw)
      }
      if (element.source === 'input') return hasEnteredNumber(block.inputs[element.field as keyof typeof block.inputs])
      return hasReportValue(block.results[element.field as keyof typeof block.results])
    })
    .map((element) => element.key)
}

export function createReportDraft(
  blocks: SampleBlock[],
  selections: LabReportElementSelection[],
  template: LabReportTemplate,
  date: string
): LabReportDraft {
  const selectionMap = new Map(selections.map((selection) => [selection.blockId, selection.elementKeys]))
  const selectedBlocks = blocks.filter((block) => selectionMap.has(block.id))
  const elementKeys = uniqueKeys(selectedBlocks.flatMap((block) => selectionMap.get(block.id) || []))
  const elements = labReportElements
    .filter((element) => elementKeys.includes(element.key))
    .map((element) => ({ key: element.key, label: element.label, symbol: element.symbol }))

  return {
    title: template.title,
    sampleDate: date,
    reportDate: date,
    sampleUnit: template.sampleUnit || selectedBlocks.map(getBlockCustomerName).find(Boolean) || '',
    sampleCount: String(selectedBlocks.length),
    inspector: template.inspector,
    reviewer: template.reviewer,
    address: template.address,
    phone: template.phone,
    statements: [...template.statements],
    sealImage: template.sealImage,
    elements,
    rows: selectedBlocks.map((block) => {
      const rowKeys = selectionMap.get(block.id) || []
      const values = Object.fromEntries(
        labReportElements.map((element) => [
          element.key,
          rowKeys.includes(element.key) ? getReportElementValue(block, element) : ''
        ])
      ) as Record<LabReportElementKey, string>
      return {
        blockId: block.id,
        sampleName: getBlockDisplayName(block),
        values
      }
    })
  }
}

export function createLabReportSmsText(blocks: SampleBlock[], selections: LabReportElementSelection[], template: LabReportSmsTemplate) {
  const selectionMap = new Map(selections.map((selection) => [selection.blockId, selection.elementKeys]))
  const selectedBlocks = blocks.filter((block) => selectionMap.has(block.id))
  const sampleTexts = selectedBlocks
    .map((block) => {
      const selectedKeys = selectionMap.get(block.id) || []
      const elementText = labReportElements
        .filter((element) => selectedKeys.includes(element.key))
        .map((element) => {
          const value = getReportElementValue(block, element)
          return value ? `${getSmsElementLabel(element.key)}${value}` : ''
        })
        .filter(Boolean)
        .join('')
      if (!elementText) return ''
      const sampleNumber = block.inputs.sampleNumber?.trim()
      return [sampleNumber, elementText].filter(Boolean).join('\n')
    })
    .filter(Boolean)

  return [normalizeSmsTemplatePart(template.prefix), sampleTexts.join('\n\n'), normalizeSmsTemplatePart(template.suffix)].filter(Boolean).join('\n')
}

export function downloadLabReportAsPng(draft: LabReportDraft, filename = '化验报告.png') {
  const exportMargin = 28
  return downloadReportCanvasAsPng(draft, exportMargin, filename)
}

export function downloadLabReportElementAsPng(element: HTMLElement, filename = '化验报告.png') {
  try {
    const exportMargin = 28
    const width = Math.ceil(element.scrollWidth || element.getBoundingClientRect().width)
    const height = Math.ceil(element.scrollHeight || element.getBoundingClientRect().height)
    const clone = cloneForPngExport(element)
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
    clone.style.width = `${width}px`
    clone.style.height = `${height}px`
    clone.style.margin = '0'

    const html = new XMLSerializer().serializeToString(clone)
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <foreignObject width="100%" height="100%">${html}</foreignObject>
      </svg>
    `
    return downloadSvgAsPng(svg, width, height, exportMargin, filename)
  } catch {
    return Promise.resolve(false)
  }
}

function downloadSvgAsPng(svg: string, width: number, height: number, exportMargin: number, filename: string) {
  const image = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      URL.revokeObjectURL(url)
      resolve(result)
    }
    const timeout = window.setTimeout(() => finish(false), 5000)
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = width + exportMargin * 2
        canvas.height = height + exportMargin * 2
        const context = canvas.getContext('2d')
        if (!context) {
          finish(false)
          return
        }
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, exportMargin, exportMargin, width, height)
        void downloadCanvasBlob(canvas, filename).then(finish).catch(() => finish(false))
      } catch {
        finish(false)
      }
    }
    image.onerror = () => {
      finish(false)
    }
    image.src = url
  })
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
        if (!blob) {
          finish(false)
          return
        }
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.download = filename
        link.href = blobUrl
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        window.setTimeout(() => {
          link.remove()
          URL.revokeObjectURL(blobUrl)
        }, 1000)
        finish(true)
      }, 'image/png')
    } catch {
      finish(false)
    }
  })
}

async function downloadReportCanvasAsPng(draft: LabReportDraft, exportMargin: number, filename: string) {
  try {
    const layout = createReportCanvasLayout(draft)
    const canvas = document.createElement('canvas')
    canvas.width = layout.width + exportMargin * 2
    canvas.height = layout.height + exportMargin * 2
    const context = canvas.getContext('2d')
    if (!context) return false

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.save()
    context.translate(exportMargin, exportMargin)
    const sealImage = draft.sealImage ? await loadImageSafe(draft.sealImage) : null
    drawReportCanvas(context, draft, layout, sealImage)
    context.restore()

    return downloadCanvasDataUrl(canvas, filename)
  } catch {
    return false
  }
}

function downloadCanvasDataUrl(canvas: HTMLCanvasElement, filename: string) {
  try {
    const dataUrl = canvas.toDataURL('image/png')
    const blobUrl = URL.createObjectURL(dataUrlToBlob(dataUrl))
    const link = document.createElement('a')
    link.download = filename
    link.href = blobUrl
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    window.setTimeout(() => {
      link.remove()
      URL.revokeObjectURL(blobUrl)
    }, 1000)
    return true
  } catch {
    return false
  }
}

function dataUrlToBlob(dataUrl: string) {
  const [, base64] = dataUrl.split(',')
  const binary = window.atob(base64 || '')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: 'application/octet-stream' })
}

type ReportCanvasLayout = {
  width: number
  height: number
  titleHeight: number
  metaTop: number
  metaRowHeight: number
  resultTop: number
  resultRowHeight: number
  resultRows: number
  inspectorTop: number
  inspectorHeight: number
  bottomTop: number
  bottomHeight: number
  statementTitleHeight: number
  statementRows: Array<{ text: string; lines: string[]; height: number; y: number }>
  addressTop: number
  phoneTop: number
  firstColWidth: number
  statementRight: number
  sealWidth: number
  elementCount: number
  elementWidth: number
}

function createReportCanvasLayout(draft: LabReportDraft): ReportCanvasLayout {
  const width = 1008
  const titleHeight = 68
  const metaTop = titleHeight
  const metaRowHeight = 35
  const resultTop = metaTop + metaRowHeight * 2
  const resultRowHeight = 35
  const resultRows = 7
  const inspectorTop = resultTop + resultRowHeight * resultRows
  const inspectorHeight = 35
  const bottomTop = inspectorTop + inspectorHeight
  const statementTitleHeight = 34
  const sealWidth = 230
  const statementRight = width - sealWidth
  const firstColWidth = 142
  const elementCount = Math.max(MIN_REPORT_ELEMENT_COLUMNS, draft.elements.length, 1)
  const elementWidth = (width - firstColWidth) / elementCount

  let y = bottomTop + statementTitleHeight
  const statementTextWidth = statementRight - STATEMENT_HORIZONTAL_PADDING * 2
  const statementRows = draft.statements.slice(0, 4).map((text, index) => {
    const lines = wrapTextByWidth(`${index + 1}、${text}`, statementTextWidth, STATEMENT_FONT)
    const height = Math.max(28, 10 + lines.length * 18)
    const row = { text, lines, height, y }
    y += height
    return row
  })
  const addressTop = y
  const phoneTop = addressTop + 51
  const bottomHeight = Math.max(256, phoneTop + 51 - bottomTop)
  const height = bottomTop + bottomHeight

  return {
    width,
    height,
    titleHeight,
    metaTop,
    metaRowHeight,
    resultTop,
    resultRowHeight,
    resultRows,
    inspectorTop,
    inspectorHeight,
    bottomTop,
    bottomHeight,
    statementTitleHeight,
    statementRows,
    addressTop,
    phoneTop,
    firstColWidth,
    statementRight,
    sealWidth,
    elementCount,
    elementWidth
  }
}

function drawReportCanvas(
  context: CanvasRenderingContext2D,
  draft: LabReportDraft,
  layout: ReportCanvasLayout,
  sealImage: HTMLImageElement | null
) {
  const displayElements = getDisplayReportElements(draft)
  const rows = getPaddedReportRows(draft)

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, layout.width, layout.height)
  context.strokeStyle = '#111827'
  context.lineWidth = 1
  context.fillStyle = '#111827'
  context.textBaseline = 'middle'

  drawRect(context, 0, 0, layout.width, layout.height)
  drawText(context, draft.title, layout.width / 2, 34, '28px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')

  drawLine(context, 0, layout.titleHeight, layout.width, layout.titleHeight)
  drawLine(context, 0, layout.metaTop + layout.metaRowHeight, layout.width, layout.metaTop + layout.metaRowHeight)
  drawLine(context, 0, layout.resultTop, layout.width, layout.resultTop)

  const metaX = [170, 504, 674]
  metaX.forEach((x) => drawLine(context, x, layout.metaTop, x, layout.resultTop))
  drawMetaCell(context, '来样日期', 0, draft.sampleDate, 170, layout)
  drawMetaCell(context, '报告日期', 504, draft.reportDate, 674, layout)
  drawMetaCell(context, '来样单位', 0, draft.sampleUnit, 170, layout, 1)
  drawMetaCell(context, '来样数量', 504, draft.sampleCount, 674, layout, 1)

  drawResultGrid(context, displayElements, rows, layout)
  drawInspectorAndBottom(context, draft, layout)
  drawSeal(context, layout, sealImage)
}

function getDisplayReportElements(draft: LabReportDraft) {
  const elements: Array<{ key?: LabReportElementKey; label: string; symbol: string; blank: boolean }> = draft.elements.map((element) => ({
    key: element.key,
    label: element.label,
    symbol: element.symbol,
    blank: false
  }))
  while (elements.length < MIN_REPORT_ELEMENT_COLUMNS) {
    elements.push({ label: '', symbol: '', blank: true })
  }
  return elements
}

function getPaddedReportRows(draft: LabReportDraft) {
  const rows = draft.rows.map((row) => ({
    sampleName: row.sampleName,
    values: row.values
  }))
  while (rows.length < 5) {
    rows.push({ sampleName: '', values: {} as Record<LabReportElementKey, string> })
  }
  return rows
}

function drawMetaCell(
  context: CanvasRenderingContext2D,
  label: string,
  labelX: number,
  value: string,
  valueX: number,
  layout: ReportCanvasLayout,
  row = 0
) {
  const y = layout.metaTop + row * layout.metaRowHeight + layout.metaRowHeight / 2
  const valueWidth = valueX === 170 ? 334 : layout.width - valueX
  drawText(context, label, labelX + 85, y, '16px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')
  drawText(context, value, valueX + valueWidth / 2, y, '16px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')
}

function drawResultGrid(
  context: CanvasRenderingContext2D,
  elements: Array<{ key?: LabReportElementKey; label: string; symbol: string; blank: boolean }>,
  rows: Array<{ sampleName: string; values: Record<LabReportElementKey, string> }>,
  layout: ReportCanvasLayout
) {
  const resultBottom = layout.inspectorTop
  const xForElement = (index: number) => layout.firstColWidth + index * layout.elementWidth

  drawLine(context, 0, resultBottom, layout.width, resultBottom)
  drawLine(context, layout.firstColWidth, layout.resultTop, layout.firstColWidth, resultBottom)
  for (let index = 0; index <= layout.elementCount; index += 1) {
    const x = xForElement(index)
    drawLine(context, x, layout.resultTop, x, resultBottom)
  }
  for (let row = 1; row <= layout.resultRows; row += 1) {
    const y = layout.resultTop + row * layout.resultRowHeight
    const startX = row === 1 ? layout.firstColWidth : 0
    drawLine(context, startX, y, layout.width, y)
  }

  drawText(
    context,
    '检验项目/样品编号',
    layout.firstColWidth / 2,
    layout.resultTop + layout.resultRowHeight,
    '14px "Microsoft YaHei", "PingFang SC", Arial, sans-serif'
  )

  elements.forEach((element, index) => {
    const x = xForElement(index) + layout.elementWidth / 2
    drawText(context, element.label, x, layout.resultTop + layout.resultRowHeight / 2, '15px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')
    drawText(context, element.symbol, x, layout.resultTop + layout.resultRowHeight * 1.5, '15px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')
  })

  rows.forEach((row, rowIndex) => {
    const y = layout.resultTop + layout.resultRowHeight * (2 + rowIndex) + layout.resultRowHeight / 2
    drawText(context, row.sampleName, layout.firstColWidth / 2, y, '15px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')
    elements.forEach((element, elementIndex) => {
      if (!element.key) return
      const x = xForElement(elementIndex) + layout.elementWidth / 2
      drawText(context, row.values[element.key] || '', x, y, '15px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')
    })
  })
}

function drawInspectorAndBottom(context: CanvasRenderingContext2D, draft: LabReportDraft, layout: ReportCanvasLayout) {
  drawLine(context, 0, layout.inspectorTop, layout.width, layout.inspectorTop)
  drawLine(context, 0, layout.bottomTop, layout.width, layout.bottomTop)
  drawLine(context, 222, layout.inspectorTop, 222, layout.bottomTop)
  drawText(context, '检验员', 111, layout.inspectorTop + layout.inspectorHeight / 2, '15px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')
  drawText(context, draft.reviewer, (222 + layout.width) / 2, layout.inspectorTop + layout.inspectorHeight / 2, '15px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')

  drawLine(context, layout.statementRight, layout.bottomTop, layout.statementRight, layout.height)
  drawLine(context, 0, layout.bottomTop + layout.statementTitleHeight, layout.statementRight, layout.bottomTop + layout.statementTitleHeight)
  drawText(context, '声明事项', layout.statementRight / 2, layout.bottomTop + layout.statementTitleHeight / 2, '14px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')

  layout.statementRows.forEach((row) => {
    row.lines.forEach((line, lineIndex) => {
      drawLeftText(context, line, 4, row.y + 13 + lineIndex * STATEMENT_LINE_HEIGHT, STATEMENT_FONT)
    })
    drawLine(context, 0, row.y + row.height, layout.statementRight, row.y + row.height)
  })

  drawLine(context, 0, layout.addressTop, layout.statementRight, layout.addressTop)
  drawLine(context, 0, layout.phoneTop, layout.statementRight, layout.phoneTop)
  drawText(context, `地址： ${draft.address}`, layout.statementRight / 2, layout.addressTop + 25.5, '24px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')
  drawText(context, `联系电话： ${draft.phone}`, layout.statementRight / 2, layout.phoneTop + 25.5, '24px "Microsoft YaHei", "PingFang SC", Arial, sans-serif')
}

function drawSeal(context: CanvasRenderingContext2D, layout: ReportCanvasLayout, image: HTMLImageElement | null) {
  const x = layout.statementRight
  const y = layout.bottomTop
  const width = layout.sealWidth
  const height = layout.height - layout.bottomTop
  if (image) {
    const maxWidth = 190
    const maxHeight = 160
    const ratio = Math.min(maxWidth / image.width, maxHeight / image.height)
    const drawWidth = image.width * ratio
    const drawHeight = image.height * ratio
    context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
    return
  }

  context.save()
  context.strokeStyle = '#dc2626'
  context.fillStyle = '#dc2626'
  context.lineWidth = 3
  context.beginPath()
  context.arc(x + width / 2, y + height / 2, 76, 0, Math.PI * 2)
  context.stroke()
  drawText(context, '电子公章', x + width / 2, y + height / 2, '20px "Microsoft YaHei", "PingFang SC", Arial, sans-serif', '#dc2626')
  context.restore()
}

function loadImageSafe(source: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = source
  })
}

function drawText(context: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color = '#111827') {
  context.save()
  context.font = font
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = color
  context.fillText(text || '', x, y)
  context.restore()
}

function drawLeftText(context: CanvasRenderingContext2D, text: string, x: number, y: number, font: string) {
  context.save()
  context.font = font
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillStyle = '#111827'
  context.fillText(text || '', x, y)
  context.restore()
}

function drawLine(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  context.beginPath()
  context.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5)
  context.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5)
  context.stroke()
}

function drawRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  context.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(width) - 1, Math.round(height) - 1)
}

function wrapTextByWidth(value: string, maxWidth: number, font: string) {
  const text = value.trim()
  if (!text) return ['']
  if (typeof document === 'undefined') return wrapTextByChars(text, 64)

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return wrapTextByChars(text, 64)

  context.font = font
  const lines: string[] = []
  let currentLine = ''

  Array.from(text).forEach((char) => {
    const nextLine = `${currentLine}${char}`
    if (currentLine && context.measureText(nextLine).width > maxWidth) {
      lines.push(currentLine)
      currentLine = char
      return
    }
    currentLine = nextLine
  })

  if (currentLine) {
    lines.push(currentLine)
  }
  return lines
}

function wrapTextByChars(value: string, maxChars: number) {
  const lines: string[] = []
  for (let index = 0; index < value.length; index += maxChars) {
    lines.push(value.slice(index, index + maxChars))
  }
  return lines
}

function cloneForPngExport(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(false) as HTMLElement
  copyComputedStyle(element, clone)
  clone.style.boxSizing = 'border-box'
  Array.from(element.childNodes).forEach((child) => {
    clone.appendChild(cloneChildForPngExport(child))
  })
  return clone
}

function cloneChildForPngExport(node: ChildNode): ChildNode {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || '')
  if (!(node instanceof HTMLElement)) return node.cloneNode(true) as ChildNode

  const tagName = node.tagName.toLowerCase()
  if (tagName === 'input') return cloneInputAsText(node as HTMLInputElement)
  if (tagName === 'textarea') return cloneTextareaAsText(node as HTMLTextAreaElement)

  const clone = node.cloneNode(false) as HTMLElement
  copyComputedStyle(node, clone)
  clone.style.boxSizing = 'border-box'
  Array.from(node.childNodes).forEach((child) => {
    clone.appendChild(cloneChildForPngExport(child))
  })
  return clone
}

function cloneInputAsText(input: HTMLInputElement) {
  const text = document.createElement('div')
  copyComputedStyle(input, text)
  text.textContent = input.value
  text.style.display = 'flex'
  text.style.alignItems = 'center'
  text.style.justifyContent = input.style.textAlign === 'left' ? 'flex-start' : 'center'
  text.style.whiteSpace = 'pre-wrap'
  text.style.boxSizing = 'border-box'
  text.style.border = '0'
  text.style.outline = '0'
  text.style.background = 'transparent'
  return text
}

function cloneTextareaAsText(textarea: HTMLTextAreaElement) {
  const text = document.createElement('div')
  copyComputedStyle(textarea, text)
  text.textContent = textarea.value
  text.style.whiteSpace = 'pre-wrap'
  text.style.boxSizing = 'border-box'
  text.style.border = '0'
  text.style.borderBottom = getComputedStyle(textarea).borderBottom
  text.style.outline = '0'
  text.style.background = 'transparent'
  text.style.overflow = 'visible'
  return text
}

function copyComputedStyle(source: Element, target: HTMLElement) {
  const computed = window.getComputedStyle(source)
  Array.from(computed).forEach((property) => {
    target.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property))
  })
}

function getReportElementValue(block: SampleBlock, element: LabReportElement) {
  const source = element.source === 'result' ? block.results : block.inputs
  return formatReportNumber(source[element.field as keyof typeof source])
}

export function getSmsElementLabel(key: LabReportElementKey) {
  const labels: Record<LabReportElementKey, string> = {
    aluminum: '铝',
    silicon: '硅',
    iron: '铁',
    aluminumSiliconRatio: '铝硅比',
    sulfur: '硫',
    carbon: '碳',
    moisture: '水分',
    calcium: '钙',
    magnesium: '镁',
    whiteness: '白度',
    density: '比重',
    titanium: '钛',
    burnLoss: '灼减'
  }
  return labels[key]
}

export function parseLabElementKeys(value: string): LabReportElementKey[] {
  const text = value.trim()
  if (!text) return []
  const tokens = text
    .split(/[、,，\s/]+/)
    .map((token) => token.trim())
    .filter(Boolean)
  const matchedKeys = labReportElements.filter((element) => {
    const aliases = labElementAliases[element.key]
    return aliases.some((alias) => isElementAliasMatched(text, tokens, alias))
  })
  return uniqueKeys(matchedKeys.map((element) => element.key))
}

const labElementAliases: Record<LabReportElementKey, string[]> = {
  aluminum: ['三氧化二铝', '氧化铝', '铝', 'Al₂O₃', 'Al2O3'],
  silicon: ['二氧化硅', '氧化硅', '硅', 'SiO₂', 'SiO2'],
  iron: ['三氧化二铁', '氧化铁', '铁', 'Fe₂O₃', 'Fe2O3'],
  aluminumSiliconRatio: ['铝硅比', 'A/S'],
  sulfur: ['全硫', '硫', 'S'],
  carbon: ['碳', 'C'],
  moisture: ['水分', '水份', 'H₂O', 'H2O'],
  calcium: ['氧化钙', '钙', 'CaO'],
  magnesium: ['氧化镁', '镁', 'MgO'],
  whiteness: ['白度'],
  density: ['比重'],
  titanium: ['钛', 'Ti'],
  burnLoss: ['灼减', '烧失', 'LOI']
}

function isElementAliasMatched(text: string, tokens: string[], alias: string) {
  const hasAsciiSymbol = /^[A-Za-z]+$/.test(alias)
  if (alias.length <= 2 && hasAsciiSymbol) {
    return tokens.includes(alias)
  }
  return text.includes(alias) || tokens.includes(alias)
}

function normalizeSmsTemplatePart(value: string) {
  return value.trim()
}

function hasEnteredNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasReportValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0
}

function formatReportNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  const fixed = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2)
  return fixed.replace(/\.?0+$/, '')
}

function uniqueKeys(keys: LabReportElementKey[]) {
  return labReportElements.map((element) => element.key).filter((key) => keys.includes(key))
}
