import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createBuilderConfig } from '../electron-builder.config.mjs'

describe('electron-builder target configuration', () => {
  it('builds the approved internal Windows and macOS installer metadata', () => {
    const config = createBuilderConfig('internal')

    expect(config).toMatchObject({
      appId: 'art.ysjc.internal-system',
      productName: '仰韶化验内部系统',
      electronVersion: '43.2.0',
      asar: true,
      npmRebuild: false,
      publish: null,
      electronFuses: {
        runAsNode: false,
        enableCookieEncryption: true,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true,
        grantFileProtocolExtraPrivileges: false,
        resetAdHocDarwinSignature: true,
      },
      directories: {
        output: 'release/internal',
        buildResources: 'build/icons/internal',
      },
      extraMetadata: {
        version: '1.0.0',
      },
      win: {
        target: [{ target: 'nsis', arch: ['x64'] }],
        icon: 'build/icons/internal/icon.ico',
        artifactName:
          'Yangshao-Internal-System-${version}-win-${arch}.${ext}',
      },
      mac: {
        target: [{ target: 'dmg', arch: ['arm64'] }],
        icon: 'build/icons/internal/icon.icns',
        minimumSystemVersion: '13.0.0',
        artifactName:
          'Yangshao-Internal-System-${version}-mac-${arch}.${ext}',
        identity: null,
        hardenedRuntime: false,
      },
      nsis: {
        oneClick: false,
        perMachine: false,
        allowElevation: false,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: '仰韶化验内部系统',
      },
    })
  })

  it('builds an independently identified backend application', () => {
    const config = createBuilderConfig('backend')

    expect(config.appId).toBe('art.ysjc.backend-system')
    expect(config.productName).toBe('仰韶化验后端系统')
    expect(config.directories).toMatchObject({
      output: 'release/backend',
      buildResources: 'build/icons/backend',
    })
    expect(config.win?.icon).toBe('build/icons/backend/icon.ico')
    expect(config.mac?.icon).toBe('build/icons/backend/icon.icns')
    expect(config.win?.artifactName).toBe(
      'Yangshao-Backend-System-${version}-win-${arch}.${ext}',
    )
    expect(config.mac?.artifactName).toBe(
      'Yangshao-Backend-System-${version}-mac-${arch}.${ext}',
    )
    expect(config.nsis?.shortcutName).toBe('仰韶化验后端系统')
  })

  it('packages only compiled runtime files and rejects unknown targets', () => {
    const config = createBuilderConfig('internal')

    expect(config.files).toEqual(['dist/**/*', 'package.json'])
    expect(() => createBuilderConfig('admin')).toThrow(
      'Unsupported desktop target: admin',
    )
  })
})

describe('desktop icon assets', () => {
  const desktopDirectory = fileURLToPath(new URL('..', import.meta.url))

  it.each(['internal', 'backend'])('%s has valid PNG, ICO and ICNS assets', (target) => {
    const iconDirectory = `${desktopDirectory}/build/icons/${target}`
    const source = readFileSync(`${iconDirectory}/source.png`)
    const png = readFileSync(`${iconDirectory}/icon.png`)
    const ico = readFileSync(`${iconDirectory}/icon.ico`)
    const icns = readFileSync(`${iconDirectory}/icon.icns`)

    expect(source.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(1024)
    expect(png.readUInt32BE(20)).toBe(1024)
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(7)
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns')
  })
})
