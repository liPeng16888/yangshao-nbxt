import { Injectable } from '@nestjs/common'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const CIPHER_VERSION = 'v1'
const CIPHER_ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const DECRYPT_ERROR = 'Unable to decrypt employee data'

@Injectable()
export class EmployeeDataCipherService {
  encrypt(plaintext: string) {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(CIPHER_ALGORITHM, this.key(), iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    return [
      CIPHER_VERSION,
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64')
    ].join('.')
  }

  decrypt(ciphertext: string) {
    try {
      const [version, ivText, authTagText, encryptedText, extra] = String(ciphertext).split('.')
      if (version !== CIPHER_VERSION || extra !== undefined) throw new Error(DECRYPT_ERROR)

      const iv = decodeBase64(ivText, IV_BYTES)
      const authTag = decodeBase64(authTagText, AUTH_TAG_BYTES)
      const encrypted = decodeBase64(encryptedText)
      if (encrypted.length === 0) throw new Error(DECRYPT_ERROR)

      const decipher = createDecipheriv(CIPHER_ALGORITHM, this.key(), iv)
      decipher.setAuthTag(authTag)
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    } catch {
      throw new Error(DECRYPT_ERROR)
    }
  }

  mask(value?: string | null) {
    if (!value) return ''
    if (value.length <= 4) return '*'.repeat(value.length)
    return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`
  }

  private key() {
    const secret = process.env.EMPLOYEE_DATA_CIPHER_SECRET?.trim()
    if (!secret) throw new Error('EMPLOYEE_DATA_CIPHER_SECRET is required')
    return createHash('sha256').update(secret, 'utf8').digest()
  }
}

function decodeBase64(value: string | undefined, expectedBytes?: number) {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error(DECRYPT_ERROR)
  const decoded = Buffer.from(value, 'base64')
  if (decoded.toString('base64') !== value || (expectedBytes !== undefined && decoded.length !== expectedBytes)) {
    throw new Error(DECRYPT_ERROR)
  }
  return decoded
}
