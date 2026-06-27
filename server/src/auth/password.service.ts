import { Injectable } from '@nestjs/common'
import bcrypt from 'bcryptjs'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

@Injectable()
export class PasswordService {
  async hash(password: string) {
    return bcrypt.hash(password, 12)
  }

  async verify(password: string, hash: string) {
    return bcrypt.compare(password, hash)
  }

  encryptForDisplay(password: string) {
    const key = this.key()
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.')
  }

  decryptForDisplay(value?: string | null) {
    if (!value) return ''
    const [ivText, tagText, encryptedText] = value.split('.')
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivText, 'base64'))
    decipher.setAuthTag(Buffer.from(tagText, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]).toString('utf8')
  }

  private key() {
    return createHash('sha256').update(process.env.PASSWORD_CIPHER_SECRET || 'dev-password-cipher-secret').digest()
  }
}
