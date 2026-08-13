import { describe, expect, it } from 'vitest'
import { normalizeFrontendPreferenceValue } from './frontend-preferences.validation'

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function validReport(overrides: Record<string, unknown> = {}) {
  return {
    title: '清镇市王庄乡仰韶化验室化验报告',
    sampleUnit: '',
    inspector: '检验员',
    reviewer: '张文',
    address: '清镇市王庄乡拾稍坝王庄大街299A',
    phone: '17885650811 15886788090',
    statements: ['一', '二', '三', '四'],
    sealImage: '',
    ...overrides
  }
}

describe('normalizeFrontendPreferenceValue', () => {
  it('normalizes units and element groups but rejects unknown element keys', () => {
    expect(normalizeFrontendPreferenceValue('LAB_REPORT_SAMPLE_UNITS', ['  王庄  ', '王庄', '清镇']))
      .toEqual(['王庄', '清镇'])
    expect(() => normalizeFrontendPreferenceValue('LAB_ELEMENT_GROUPS', [
      { id: 'group-1', name: '铝硅', elementKeys: ['aluminum', 'not-an-element'] }
    ])).toThrow('化验元素无效')
  })

  it('accepts a small PNG seal and rejects decoded files above 512 KiB', () => {
    const png = `data:image/png;base64,${PNG_HEADER.toString('base64')}`
    expect(normalizeFrontendPreferenceValue('LAB_REPORT_TEMPLATE', validReport({ sealImage: png })))
      .toMatchObject({ sealImage: png })
    const large = `data:image/png;base64,${Buffer.concat([PNG_HEADER, Buffer.alloc(512 * 1024)]).toString('base64')}`
    expect(() => normalizeFrontendPreferenceValue('LAB_REPORT_TEMPLATE', validReport({ sealImage: large })))
      .toThrow('电子公章不能超过 512 KiB')
  })

  it('rejects unknown report fields and report strings over their section limits', () => {
    expect(() => normalizeFrontendPreferenceValue('LAB_REPORT_TEMPLATE', validReport({ extra: '不应保存' })))
      .toThrow('报告模板字段无效')
    expect(() => normalizeFrontendPreferenceValue('LAB_REPORT_TEMPLATE', validReport({ inspector: '检'.repeat(41) })))
      .toThrow('检验员不能超过 40 个字符')
    expect(() => normalizeFrontendPreferenceValue('LAB_REPORT_TEMPLATE', validReport({ statements: ['一'.repeat(501), '二', '三', '四'] })))
      .toThrow('报告声明不能超过 500 个字符')
  })

  it('trims SMS fields, enforces their combined limit, and rejects unknown fields', () => {
    expect(normalizeFrontendPreferenceValue('LAB_REPORT_SMS_TEMPLATE', { prefix: '  前缀\n', suffix: ' 后缀  ' }))
      .toEqual({ prefix: '前缀', suffix: '后缀' })
    expect(() => normalizeFrontendPreferenceValue('LAB_REPORT_SMS_TEMPLATE', { prefix: '甲'.repeat(500), suffix: '乙'.repeat(301) }))
      .toThrow('短信模板总长度不能超过 800 个字符')
    expect(() => normalizeFrontendPreferenceValue('LAB_REPORT_SMS_TEMPLATE', { prefix: '', suffix: '', extra: '' }))
      .toThrow('短信模板字段无效')
  })

  it('counts SMS limits by Unicode code points instead of UTF-16 code units', () => {
    expect(normalizeFrontendPreferenceValue('LAB_REPORT_SMS_TEMPLATE', { prefix: '😀'.repeat(500), suffix: '' }))
      .toEqual({ prefix: '😀'.repeat(500), suffix: '' })
  })

  it('checks SMS, units, and group identities after boundary trimming', () => {
    const prefix = '前'.repeat(500)
    const unit = '样'.repeat(80)
    const id = 'group-'.repeat(13).slice(0, 80)
    const name = '铝'.repeat(40)

    expect(normalizeFrontendPreferenceValue('LAB_REPORT_SMS_TEMPLATE', { prefix: ` ${prefix} `, suffix: '' }))
      .toEqual({ prefix, suffix: '' })
    expect(normalizeFrontendPreferenceValue('LAB_REPORT_SAMPLE_UNITS', [` ${unit} `]))
      .toEqual([unit])
    expect(normalizeFrontendPreferenceValue('LAB_ELEMENT_GROUPS', [
      { id: ` ${id} `, name: ` ${name} `, elementKeys: ['aluminum'] }
    ])).toEqual([{ id, name, elementKeys: ['aluminum'] }])
  })

  it('canonicalizes group elements and rejects duplicate group identities', () => {
    expect(normalizeFrontendPreferenceValue('LAB_ELEMENT_GROUPS', [
      { id: ' group-1 ', name: ' 铝硅 ', elementKeys: ['silicon', 'aluminum', 'silicon'] }
    ])).toEqual([{ id: 'group-1', name: '铝硅', elementKeys: ['aluminum', 'silicon'] }])
    expect(() => normalizeFrontendPreferenceValue('LAB_ELEMENT_GROUPS', [
      { id: 'group-1', name: '铝', elementKeys: ['aluminum'] },
      { id: 'group-1', name: '硅', elementKeys: ['silicon'] }
    ])).toThrow('化验元素组合 ID 重复')
    expect(() => normalizeFrontendPreferenceValue('LAB_ELEMENT_GROUPS', [
      { id: 'group-1', name: '铝硅', elementKeys: ['aluminum'] },
      { id: 'group-2', name: ' 铝硅 ', elementKeys: ['silicon'] }
    ])).toThrow('化验元素组合名称重复')
  })
})
