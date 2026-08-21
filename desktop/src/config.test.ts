import { describe, expect, it } from 'vitest'

import { desktopTargets, resolveDesktopTarget } from './config'

describe('desktop target configuration', () => {
  it('maps the internal application to its approved identity and endpoint', () => {
    expect(desktopTargets.internal).toEqual({
      key: 'internal',
      productName: '仰韶化验内部系统',
      appId: 'art.ysjc.internal-system',
      entryUrl: 'https://www.ysjc.art/',
      allowedOrigin: 'https://www.ysjc.art',
      userDataDirectory: 'YangshaoInternalSystem',
      artifactPrefix: 'Yangshao-Internal-System',
    })
  })

  it('maps the backend application to its approved identity and endpoint', () => {
    expect(desktopTargets.backend).toEqual({
      key: 'backend',
      productName: '仰韶化验后端系统',
      appId: 'art.ysjc.backend-system',
      entryUrl: 'https://ys.ysjc.art/admin/login',
      allowedOrigin: 'https://ys.ysjc.art',
      userDataDirectory: 'YangshaoBackendSystem',
      artifactPrefix: 'Yangshao-Backend-System',
    })
  })

  it('keeps install identities, storage and artifacts isolated', () => {
    expect(desktopTargets.internal.appId).not.toBe(desktopTargets.backend.appId)
    expect(desktopTargets.internal.userDataDirectory).not.toBe(
      desktopTargets.backend.userDataDirectory,
    )
    expect(desktopTargets.internal.artifactPrefix).not.toBe(
      desktopTargets.backend.artifactPrefix,
    )
  })

  it('resolves only supported target keys', () => {
    expect(resolveDesktopTarget('internal')).toBe(desktopTargets.internal)
    expect(resolveDesktopTarget('backend')).toBe(desktopTargets.backend)
    expect(() => resolveDesktopTarget('admin')).toThrow(
      'Unsupported desktop target: admin',
    )
    expect(() => resolveDesktopTarget(undefined)).toThrow(
      'Unsupported desktop target: undefined',
    )
  })
})
