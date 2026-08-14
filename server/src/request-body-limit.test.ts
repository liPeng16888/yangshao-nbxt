import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('request body limits', () => {
  it('disables the Nest default parser and installs an explicit 1mb parser', () => {
    const source = readFileSync(join(__dirname, 'main.ts'), 'utf8')
    expect(source).toContain('NestFactory.create(AppModule, { bodyParser: false })')
    expect(source).toContain("express.json({ limit: '1mb' })")
    expect(source).toContain("express.urlencoded({ extended: true, limit: '1mb' })")
  })
})
