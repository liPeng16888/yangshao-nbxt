const targets = {
  internal: {
    productName: '仰韶化验内部系统',
    appId: 'art.ysjc.internal-system',
    artifactPrefix: 'Yangshao-Internal-System',
  },
  backend: {
    productName: '仰韶化验后端系统',
    appId: 'art.ysjc.backend-system',
    artifactPrefix: 'Yangshao-Backend-System',
  },
}

export function createBuilderConfig(targetKey) {
  const target = targets[targetKey]
  if (!target) {
    throw new Error(`Unsupported desktop target: ${String(targetKey)}`)
  }

  const iconDirectory = `build/icons/${targetKey}`

  return {
    appId: target.appId,
    productName: target.productName,
    electronVersion: '43.2.0',
    asar: true,
    compression: 'maximum',
    npmRebuild: false,
    forceCodeSigning: false,
    publish: null,
    directories: {
      output: `release/${targetKey}`,
      buildResources: iconDirectory,
    },
    files: ['dist/**/*', 'package.json'],
    extraMetadata: {
      version: '1.0.0',
    },
    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
      icon: `${iconDirectory}/icon.ico`,
      artifactName: `${target.artifactPrefix}-\${version}-win-\${arch}.\${ext}`,
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: target.productName,
      uninstallDisplayName: `${target.productName} \${version}`,
      installerIcon: `${iconDirectory}/icon.ico`,
      uninstallerIcon: `${iconDirectory}/icon.ico`,
    },
    mac: {
      target: [{ target: 'dmg', arch: ['arm64'] }],
      icon: `${iconDirectory}/icon.icns`,
      category: 'public.app-category.business',
      minimumSystemVersion: '13.0.0',
      artifactName: `${target.artifactPrefix}-\${version}-mac-\${arch}.\${ext}`,
      identity: null,
      hardenedRuntime: false,
    },
    dmg: {
      sign: false,
    },
  }
}

export default () =>
  createBuilderConfig(process.env.YANGSHAO_DESKTOP_TARGET)
