const networkOnlyBusinessData = ({ url }: { url: URL }) => (
  url.pathname === '/api' ||
  url.pathname.startsWith('/api/') ||
  url.pathname === '/uploads' ||
  url.pathname.startsWith('/uploads/')
)

export const pwaOptions = {
  registerType: 'prompt' as const,
  includeAssets: ['apple-touch-icon.png'],
  manifest: {
    name: '仰韶化验室',
    short_name: '仰韶化验',
    description: '仰韶化验室数据计算系统',
    lang: 'zh-CN',
    display: 'standalone' as const,
    start_url: '/data',
    scope: '/',
    orientation: 'any' as const,
    theme_color: '#10233f',
    background_color: '#eef3f8',
    icons: [
      { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' as const }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/uploads(?:\/|$)/],
    runtimeCaching: [
      {
        urlPattern: networkOnlyBusinessData,
        handler: 'NetworkOnly' as const
      }
    ]
  },
  devOptions: {
    enabled: true,
    suppressWarnings: true
  }
}
