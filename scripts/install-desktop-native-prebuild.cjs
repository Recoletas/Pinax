const { execFile } = require('node:child_process')
const { cp, copyFile, mkdir, mkdtemp, readFile, readdir, rm, unlink } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { dirname, join, resolve } = require('node:path')
const { promisify } = require('node:util')

const packageJson = require('../package.json')
const execFileAsync = promisify(execFile)
const projectRoot = resolve(__dirname, '..')

async function removeOtherNativeBinaries(directory, keepPath) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      await removeOtherNativeBinaries(entryPath, keepPath)
    } else if (entry.name.endsWith('.node') && resolve(entryPath) !== resolve(keepPath)) {
      await unlink(entryPath)
    }
  }
}

async function installDesktopNativePrebuild({ platform, arch, outputPaths }) {
  if (platform !== 'win32' || process.platform === 'win32') return

  const electronVersion = packageJson.devDependencies.electron
  if (!/^\d+\.\d+\.\d+$/.test(electronVersion)) {
    throw new Error(`Electron must use an exact version for native prebuilds, received: ${electronVersion}`)
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'pinax-native-prebuild-'))
  const stagedModule = join(temporaryRoot, 'better-sqlite3')

  try {
    await cp(join(projectRoot, 'node_modules', 'better-sqlite3'), stagedModule, { recursive: true })
    await execFileAsync(process.execPath, [
      require.resolve('prebuild-install/bin.js'),
      '--runtime=electron',
      `--target=${electronVersion}`,
      `--platform=${platform}`,
      `--arch=${arch}`
    ], { cwd: stagedModule })

    const stagedBinary = join(stagedModule, 'build', 'Release', 'better_sqlite3.node')
    const magic = (await readFile(stagedBinary)).subarray(0, 2).toString('ascii')
    if (magic !== 'MZ') {
      throw new Error(`Downloaded ${platform}-${arch} better-sqlite3 binary is not a Windows PE file`)
    }

    for (const outputPath of outputPaths) {
      const unpackedModule = join(
        outputPath,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'better-sqlite3'
      )
      const destination = join(unpackedModule, 'build', 'Release', 'better_sqlite3.node')
      await removeOtherNativeBinaries(unpackedModule, destination)
      await mkdir(dirname(destination), { recursive: true })
      await copyFile(stagedBinary, destination)
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

module.exports = { installDesktopNativePrebuild }
