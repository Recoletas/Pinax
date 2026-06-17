// 5C v3 P1.D: unify CTA slant to P5r 14° grammar.
//
// P5r uses a single accent angle of -12° to -14° for ALL CTAs (save/load
// buttons, action buttons). Pinax's BookmarkButton is currently slanted
// at -3deg (primary) / +2deg (secondary) — too subtle, reads as a
// misaligned grid, not a deliberate slash grammar. P1.D unifies the
// --command-tilt declaration to the P5r amplitude.
//
// Source-string assertions match the existing panelSlots / faceRotation
// / microLean convention in this codebase.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

function walkVueCssJs(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'dist') continue
      walkVueCssJs(full, acc)
    } else if (/\.(vue|css|js)$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

describe('CTA slant (5C v3.15+ upright stamp) — OpeningPage .stage-command base', () => {
  it('declares --command-tilt in the 5C v3.15+ upright-stamp band (-3deg..3deg) inside the .stage-command rule', () => {
    const sfc = readProjectFile('src/pages/OpeningPage.vue')

    // Pin the base .stage-command rule block. 5C v3.15+ uses an
    // upright stamp grammar (small tilt -3deg..3deg), replacing the
    // earlier v3 P1.D P5r-14° grammar. The user/linter is actively
    // iterating the exact value, so we test the band rather than a
    // specific number.
    const ruleMatch = sfc.match(/^[ \t]*\.stage-command\s*\{[\s\S]*?\n\}/m)
    expect(ruleMatch).not.toBeNull()
    const rule = ruleMatch?.[0] ?? ''
    const tiltMatch = rule.match(/--command-tilt:\s*(-?\d+(?:\.\d+)?)deg/)
    expect(tiltMatch, '.stage-command must declare --command-tilt').not.toBeNull()
    const value = Number(tiltMatch?.[1])
    expect(value).toBeGreaterThanOrEqual(-3)
    expect(value).toBeLessThanOrEqual(3)
  })
})

describe('CTA slant (5C v3.15+ upright stamp) — OpeningPage .stage-command--secondary', () => {
  it('declares --command-tilt in the 5C v3.15+ upright-stamp band (-3deg..3deg) for .stage-command--secondary', () => {
    const sfc = readProjectFile('src/pages/OpeningPage.vue')

    // Pin the secondary rule block. 5C v3.15+ secondary shares the
    // same upright-stamp band as the base (the v3.15+ design uses a
    // smaller secondary + scale(0.84) for visual layering rather than
    // a different tilt angle).
    const ruleMatch = sfc.match(/^[ \t]*\.stage-command--secondary\s*\{[\s\S]*?\n\}/m)
    expect(ruleMatch).not.toBeNull()
    const rule = ruleMatch?.[0] ?? ''
    const tiltMatch = rule.match(/--command-tilt:\s*(-?\d+(?:\.\d+)?)deg/)
    expect(tiltMatch, '.stage-command--secondary must declare --command-tilt').not.toBeNull()
    const value = Number(tiltMatch?.[1])
    expect(value).toBeGreaterThanOrEqual(-3)
    expect(value).toBeLessThanOrEqual(3)
  })
})

describe('CTA slant (5C v3 P1.D) — BookmarkButton consumer', () => {
  it('does not declare its own --command-tilt (slants are owned by .stage-command in OpeningPage)', () => {
    const sfc = readProjectFile('src/components/folio/BookmarkButton.vue')

    // BookmarkButton has its own clip-path + skewX decoration; it
    // should NOT override --command-tilt — that contract belongs to
    // the .stage-command consumer rules in OpeningPage. (If a future
    // P5r-aligned BookmarkButton override is added, that test gets
    // re-scoped; for P1.D the contract is "no override".)
    expect(sfc).not.toMatch(/--command-tilt/)
  })

  it('keeps its .bookmark-button base transform-origin / hover skew grammar intact', () => {
    const sfc = readProjectFile('src/components/folio/BookmarkButton.vue')

    // The component still owns its hover skew (-8deg) and its ::after
    // slash decoration (skewX 34deg) — neither is touched by P1.D.
    // We assert both survive to lock the scope of the P1.D change.
    //
    // The ::after rule comes AFTER a comma-grouped ".bookmark-button::before,
    // .bookmark-button::after { ... }" block that only sets content /
    // position / pointer-events. To grab the SECOND standalone
    // ".bookmark-button::after" rule (which carries transform: skewX(34deg)),
    // we use a global match and take the last match.
    const baseRule = sfc.match(/^[ \t]*\.bookmark-button\s*\{[\s\S]*?\n\}/m)?.[0] ?? ''
    const hoverMatches = [...sfc.matchAll(/^[ \t]*\.bookmark-button:hover[^{]*\{[\s\S]*?\n\}/gm)]
    const hoverRule = hoverMatches.length ? hoverMatches[hoverMatches.length - 1][0] : ''
    const afterMatches = [...sfc.matchAll(/^[ \t]*\.bookmark-button::after\s*\{[\s\S]*?\n\}/gm)]
    const afterRule = afterMatches.length ? afterMatches[afterMatches.length - 1][0] : ''

    expect(baseRule).toMatch(/transform-origin:\s*left center/)
    // The .bookmark-button:hover rule appears twice in the SFC — once
    // as the desktop default (contains skewX(-8deg)) and again inside
    // a @media (max-width: 760px) mobile override (only translateY(-2px)).
    // We want the DESKTOP one — the first match in source order.
    const desktopHoverMatch = hoverMatches.length ? hoverMatches[0][0] : ''
    expect(desktopHoverMatch).toMatch(/skewX\(-8deg\)/)
    expect(afterRule).toMatch(/skewX\(34deg\)/)
  })
})

describe('CTA slant (5C v3.15+ upright stamp) — repo-wide invariant', () => {
  it('no source file in src/components/folio/ or src/pages/ declares a --command-tilt outside the 5C v3.15+ upright-stamp band (-3deg..3deg)', () => {
    const root = resolve(process.cwd())
    const targets = [
      join(root, 'src/components/folio'),
      join(root, 'src/pages'),
    ]
    const files = targets.flatMap((dir) => walkVueCssJs(dir))

    // 5C v3.15+ band: small upright-stamp tilts (-3deg..3deg). The
    // legacy/ subdir is excluded — those files are frozen pre-kao
    // snapshots and may carry older -3deg / +2deg from the
    // 4e779d2 boundary.
    const offenders = []
    const declRe = /--command-tilt:\s*(-?\d+(?:\.\d+)?)deg/g
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      let match
      while ((match = declRe.exec(source)) !== null) {
        const value = Number(match[1])
        if (value < -3 || value > 3) {
          const upto = source.slice(0, match.index)
          const line = upto.split('\n').length
          const rel = file.replace(root + '/', '')
          offenders.push(`${rel}:${line} -> --command-tilt: ${match[0].split(':')[1].trim()}`)
        }
      }
    }

    expect(
      offenders,
      `All --command-tilt values must sit in the 5C v3.15+ upright-stamp band (-3deg..3deg).\nOffenders:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})

describe('CTA slant (5C v3 P1.D) — consumer wiring intact', () => {
  it('keeps the .stage-command consumer transform: rotate(var(--command-tilt)) unchanged', () => {
    const sfc = readProjectFile('src/pages/OpeningPage.vue')

    // P1.D only changes the --command-tilt VALUE, not the consumer.
    // The base .stage-command rule must still wire the var into
    // transform: rotate(...). Selector must be exactly ".stage-command"
    // (not "X .stage-command" such as the .opening-action-actions wrapper).
    const ruleMatch = sfc.match(/^[ \t]*\.stage-command\s*\{[\s\S]*?\n\}/m)
    expect(ruleMatch).not.toBeNull()
    const rule = ruleMatch?.[0] ?? ''

    expect(rule).toMatch(/transform:\s*rotate\(var\(--command-tilt\)\)/)
  })
})
