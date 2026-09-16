const { FusesPlugin } = require('@electron-forge/plugin-fuses')
const { AutoUnpackNativesPlugin } = require('@electron-forge/plugin-auto-unpack-natives')
const { VitePlugin } = require('@electron-forge/plugin-vite')
const { MakerSquirrel } = require('@electron-forge/maker-squirrel')
const { MakerZIP } = require('@electron-forge/maker-zip')
const { FuseV1Options, FuseVersion } = require('@electron/fuses')
const { installDesktopNativePrebuild } = require('./scripts/install-desktop-native-prebuild.cjs')
const path = require('node:path')

const packagedRuntimePaths = [
  '/node_modules/better-sqlite3',
  '/node_modules/bindings',
  '/node_modules/file-uri-to-path'
]

function ignoreUnbundledFiles(file) {
  if (!file) return false
  if (file.startsWith('/.vite') || file === '/node_modules') return false
  if (packagedRuntimePaths.some(path => file === path || file.startsWith(`${path}/`))) return false
  return true
}

module.exports = {
  hooks: {
    postPackage: async (_forgeConfig, packageResult) => {
      await installDesktopNativePrebuild(packageResult)
    }
  },
  packagerConfig: {
    asar: true,
    icon: path.join(__dirname, 'assets', 'icons', 'pinax'),
    ignore: ignoreUnbundledFiles
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin', 'linux', 'win32'])
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: 'electron/main.mjs', config: 'vite.main.config.mjs' },
        { entry: 'electron/preload.cjs', config: 'vite.preload.config.mjs' }
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.mjs' }
      ]
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
}
