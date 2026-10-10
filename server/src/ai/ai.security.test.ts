import { afterEach, describe, expect, it, vi } from 'vitest'
import { decryptAiKey, encryptAiKey, isPrivateAddress, validateEndpoint, validateImage } from './ai.security'
afterEach(() => vi.unstubAllEnvs())
describe('AI provider and attachment security', () => {
  it.each(['127.0.0.1','10.0.0.2','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])('blocks non-public address %s', address => { expect(isPrivateAddress(address)).toBe(true) })
  it('accepts a regular public address', () => { expect(isPrivateAddress('8.8.8.8')).toBe(false) })
  it.each(['http://example.com/v1','https://user:pass@example.com/v1','https://example.com/v1?token=secret','https://example.com:8080/v1'])('rejects insecure provider URL %s without making a request', async url => { await expect(validateEndpoint(url)).rejects.toThrow() })
  it('encrypts with authenticated encryption and a fresh nonce', () => { vi.stubEnv('AI_API_KEY_SECRET', 'x'.repeat(32)); const a = encryptAiKey('sk-private-value'), b = encryptAiKey('sk-private-value'); expect(a).not.toBe(b); expect(a).not.toContain('sk-private-value'); expect(decryptAiKey(a)).toBe('sk-private-value'); const parts = a.split('.'); parts[2] = Buffer.from('tampered').toString('base64'); expect(() => decryptAiKey(parts.join('.'))).toThrow() })
  it('does not fall back to the login signing key for provider credentials', () => { vi.stubEnv('AI_API_KEY_SECRET', ''); vi.stubEnv('JWT_SECRET', 'x'.repeat(40)); expect(() => encryptAiKey('key')).toThrow() })
  it('rejects mismatched MIME and file signatures', () => { expect(() => validateImage(Buffer.from('<script>evil</script>'), 'image/jpeg')).toThrow(); expect(() => validateImage(Buffer.from([255,216,255]), 'image/png')).toThrow() })
  it('rejects oversized photos before storage', () => { const b = Buffer.alloc(5 * 1024 * 1024 + 1); b[0] = 255; b[1] = 216; b[2] = 255; expect(() => validateImage(b, 'image/jpeg')).toThrow() })
  it('accepts recognized image signatures', () => { expect(() => validateImage(Buffer.from([255,216,255,0]), 'image/jpeg')).not.toThrow(); expect(() => validateImage(Buffer.from([137,80,78,71,13,10,26,10]), 'image/png')).not.toThrow() })
})
