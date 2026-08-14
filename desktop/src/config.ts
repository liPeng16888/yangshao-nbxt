export type DesktopTargetKey = 'internal' | 'backend'

export interface DesktopTargetConfig {
  readonly key: DesktopTargetKey
  readonly productName: string
  readonly appId: string
  readonly entryUrl: string
  readonly allowedOrigin: string
  readonly userDataDirectory: string
  readonly artifactPrefix: string
}

export const desktopTargets = {
  internal: {
    key: 'internal',
    productName: '仰韶化验内部系统',
    appId: 'art.ysjc.internal-system',
    entryUrl: 'https://www.ysjc.art/',
    allowedOrigin: 'https://www.ysjc.art',
    userDataDirectory: 'YangshaoInternalSystem',
    artifactPrefix: 'Yangshao-Internal-System',
  },
  backend: {
    key: 'backend',
    productName: '仰韶化验后端系统',
    appId: 'art.ysjc.backend-system',
    entryUrl: 'https://ys.ysjc.art/admin/login',
    allowedOrigin: 'https://ys.ysjc.art',
    userDataDirectory: 'YangshaoBackendSystem',
    artifactPrefix: 'Yangshao-Backend-System',
  },
} as const satisfies Record<DesktopTargetKey, DesktopTargetConfig>

export function resolveDesktopTarget(
  targetKey: string | undefined,
): DesktopTargetConfig {
  if (targetKey === 'internal' || targetKey === 'backend') {
    return desktopTargets[targetKey]
  }

  throw new Error(`Unsupported desktop target: ${String(targetKey)}`)
}
