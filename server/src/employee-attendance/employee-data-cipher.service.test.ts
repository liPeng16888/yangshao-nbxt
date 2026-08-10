import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EmployeeDataCipherService } from './employee-data-cipher.service'

describe('EmployeeDataCipherService', () => {
  const originalSecret = process.env.EMPLOYEE_DATA_CIPHER_SECRET

  beforeEach(() => {
    process.env.EMPLOYEE_DATA_CIPHER_SECRET = 'employee-test-secret-that-is-not-used-elsewhere'
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.EMPLOYEE_DATA_CIPHER_SECRET
    else process.env.EMPLOYEE_DATA_CIPHER_SECRET = originalSecret
  })

  it('round-trips sensitive text with a non-deterministic authenticated ciphertext', () => {
    const service = new EmployeeDataCipherService()

    const first = service.encrypt('522601199001011234')
    const second = service.encrypt('522601199001011234')

    expect(first).not.toBe(second)
    expect(first).not.toContain('522601199001011234')
    expect(service.decrypt(first)).toBe('522601199001011234')
    expect(service.decrypt(second)).toBe('522601199001011234')
  })

  it.each([
    'not-a-ciphertext',
    'v1.bad.bad.bad',
    'v2.YWJj.ZGVm.Z2hp',
    ''
  ])('rejects malformed ciphertext with one generic error: %j', (ciphertext) => {
    const service = new EmployeeDataCipherService()

    expect(() => service.decrypt(ciphertext)).toThrowError('Unable to decrypt employee data')
  })

  it('rejects authenticated ciphertext that has been tampered with without exposing data or the secret', () => {
    const service = new EmployeeDataCipherService()
    const ciphertext = service.encrypt('贵州省黔东南州')
    const parts = ciphertext.split('.')
    parts[3] = `${parts[3].slice(0, -2)}AA`

    let caught: unknown
    try {
      service.decrypt(parts.join('.'))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('Unable to decrypt employee data')
    expect((caught as Error).message).not.toContain('贵州省黔东南州')
    expect((caught as Error).message).not.toContain(process.env.EMPLOYEE_DATA_CIPHER_SECRET!)
  })

  it('requires the dedicated employee-data secret', () => {
    delete process.env.EMPLOYEE_DATA_CIPHER_SECRET
    const service = new EmployeeDataCipherService()

    expect(() => service.encrypt('sensitive')).toThrowError('EMPLOYEE_DATA_CIPHER_SECRET is required')
  })

  it('rejects an employee-data secret shorter than 32 UTF-8 bytes', () => {
    process.env.EMPLOYEE_DATA_CIPHER_SECRET = 'x'.repeat(31)
    const service = new EmployeeDataCipherService()

    expect(() => service.encrypt('sensitive')).toThrowError('EMPLOYEE_DATA_CIPHER_SECRET must be at least 32 bytes')
  })

  it('rejects empty plaintext before producing an undecryptable ciphertext', () => {
    const service = new EmployeeDataCipherService()

    expect(() => service.encrypt('')).toThrowError('Employee data plaintext is required')
  })

  it('masks all but the final four characters and handles short or empty values', () => {
    const service = new EmployeeDataCipherService()

    expect(service.mask('6222020202021234')).toBe('************1234')
    expect(service.mask('1234')).toBe('****')
    expect(service.mask('')).toBe('')
    expect(service.mask(null)).toBe('')
  })
})
