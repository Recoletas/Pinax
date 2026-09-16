#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const source = path.resolve(process.argv[2] || path.join(root, 'assets', 'brand', 'pinax-icon-source.png'))
const outputs = {
  public: path.join(root, 'public'),
  desktop: path.join(root, 'assets', 'icons'),
  readme: path.join(root, 'docs', 'assets', 'readme')
}

await Promise.all(Object.values(outputs).map((directory) => fs.mkdir(directory, { recursive: true })))
const sourceData = await fs.readFile(source)
const sourceUrl = `data:image/png;base64,${sourceData.toString('base64')}`
const browser = await chromium.launch({ headless: true })

async function render(size) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(`<style>*{margin:0}html,body,img{width:${size}px;height:${size}px}img{display:block}</style><img src="${sourceUrl}">`)
  const png = await page.screenshot({ type: 'png', omitBackground: false })
  await page.close()
  return png
}

function buildIco(images) {
  const header = Buffer.alloc(6 + images.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16
    header[entry] = size >= 256 ? 0 : size
    header[entry + 1] = size >= 256 ? 0 : size
    header[entry + 2] = 0
    header[entry + 3] = 0
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map(({ png }) => png)])
}

function icnsChunk(type, png) {
  const header = Buffer.alloc(8)
  header.write(type, 0, 4, 'ascii')
  header.writeUInt32BE(png.length + 8, 4)
  return Buffer.concat([header, png])
}

const sizes = [16, 32, 48, 64, 128, 192, 256, 512, 1024]
const rendered = new Map()
for (const size of sizes) rendered.set(size, await render(size))
await browser.close()

await Promise.all([
  fs.writeFile(path.join(outputs.public, 'favicon-32.png'), rendered.get(32)),
  fs.writeFile(path.join(outputs.public, 'pinax-icon-192.png'), rendered.get(192)),
  fs.writeFile(path.join(outputs.public, 'pinax-icon-512.png'), rendered.get(512)),
  fs.writeFile(path.join(outputs.desktop, 'pinax.png'), rendered.get(512)),
  fs.writeFile(path.join(outputs.desktop, 'pinax.ico'), buildIco(sizes.filter((size) => size <= 256).map((size) => ({ size, png: rendered.get(size) })))),
  fs.writeFile(path.join(outputs.readme, 'pinax-icon.png'), rendered.get(512))
])

const icnsBody = Buffer.concat([
  icnsChunk('ic09', rendered.get(512)),
  icnsChunk('ic10', rendered.get(1024))
])
const icnsHeader = Buffer.alloc(8)
icnsHeader.write('icns', 0, 4, 'ascii')
icnsHeader.writeUInt32BE(icnsBody.length + 8, 4)
await fs.writeFile(path.join(outputs.desktop, 'pinax.icns'), Buffer.concat([icnsHeader, icnsBody]))

console.log(`Pinax icons generated from ${path.relative(root, source)}`)
