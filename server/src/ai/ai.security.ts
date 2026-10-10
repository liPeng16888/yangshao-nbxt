import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpsRequest } from 'node:https'

export function encryptAiKey(key: string) {
  const secret = process.env.AI_API_KEY_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) throw new ServiceUnavailableException('请先设置至少 32 字节的 AI_API_KEY_SECRET')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv)
  const data = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.')
}
export function decryptAiKey(cipherText: string) {
  const secret = process.env.AI_API_KEY_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) throw new ServiceUnavailableException('AI 密钥加密配置不可用')
  try {
    const [iv, tag, data] = cipherText.split('.')
    const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  } catch { throw new ServiceUnavailableException('AI 密钥无法解密，请在后台重新保存密钥') }
}
export function isPrivateAddress(address: string) {
  const s = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (s.includes(':')) return s === '::' || s === '::1' || /^(fc|fd|fe[89ab]|ff)/.test(s) || s.startsWith('::ffff:') || !isIP(s)
  const p = s.split('.').map(Number)
  return p.length !== 4 || p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
}
export async function validateEndpoint(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443')) throw new BadRequestException('模型 API 地址必须是无账号、无查询参数的 HTTPS 公网地址')
  let addresses: { address: string }[]
  try { addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true }) } catch { throw new BadRequestException('模型 API 域名无法解析') }
  if (!addresses.length || addresses.some(a => isPrivateAddress(a.address))) throw new BadRequestException('模型 API 不能访问本机、内网或云元数据地址')
  return url.toString().replace(/\/$/, '')
}

// Resolve and pin a public IP for each call. Do not follow redirects or permit DNS rebinding.
export function providerFetch(baseUrl: string): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.origin !== new URL(baseUrl).origin) throw new Error('Provider origin mismatch')
    await validateEndpoint(url.origin + url.pathname)
    const addresses = await lookup(url.hostname, { all: true })
    if (!addresses.length || addresses.some(a => isPrivateAddress(a.address))) throw new Error('Private provider address')
    const chosen = addresses.find(a => a.family === 4) || addresses[0]
    return new Promise<Response>((resolve, reject) => {
      const headers = { ...Object.fromEntries(new Headers(init?.headers).entries()), 'accept-encoding': 'identity' }
      const req = httpsRequest(url, { method: init?.method || 'POST', headers, signal: init?.signal || undefined,
        lookup: (_hostname, options, callback) => {
          if ((options as { all?: boolean }).all) {
            (callback as unknown as (error: Error | null, values: { address: string; family: number }[]) => void)(null, [chosen])
          } else callback(null, chosen.address, chosen.family)
        } }, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) { res.resume(); reject(new Error('Provider redirects disabled')); return }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 4 * 1024 * 1024) { req.destroy(new Error('Provider response too large')); return }; chunks.push(chunk) })
        res.on('error', reject)
        res.on('end', () => resolve(new Response(new Uint8Array(Buffer.concat(chunks)), { status: res.statusCode || 502, headers: { 'content-type': String(res.headers['content-type'] || 'application/json') } })))
      })
      req.setTimeout(45000, () => req.destroy(new Error('Provider timeout')))
      req.on('error', reject)
      if (init?.body) req.write(init.body)
      req.end()
    })
  }) as typeof fetch
}
export function validateImage(bytes: Buffer, mime: string) {
  const jpeg = mime === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const webp = mime === 'image/webp' && bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP'
  if (!bytes.length || bytes.length > 5 * 1024 * 1024 || !(jpeg || png || webp)) throw new BadRequestException('只支持 5MB 内的 JPG、PNG、WebP 照片')
}
