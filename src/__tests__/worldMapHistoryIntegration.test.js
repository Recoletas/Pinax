import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('GEO-HISTORY: map generation feeds a reviewed history draft', () => {
  it('WorldMapPanel keeps map output, builds a draft, and persists only after explicit confirmation', () => {
    const panel = readProjectFile('src/components/geography/WorldMapPanel.vue')

    expect(panel).toContain("buildGeoHistoryDraft")
    expect(panel).toMatch(/latestMapData\.value\s*=\s*payload\?\.data/)
    expect(panel).toContain('historyDraft.value = result.geoHistory')
    expect(panel).toContain('worldStore.updateWorldbook')
    expect(panel).toContain('geoHistory: historyDraft.value')
    expect(panel).toContain('检查地理语义')
    expect(panel).toContain('整理历史草案')
    expect(panel).toContain('写入世界历史')
  })

  it('the map page keeps the worldbook/history integration visible in the main workspace', () => {
    const page = readProjectFile('src/pages/WorldMapPage.vue')
    const panel = readProjectFile('src/components/geography/WorldMapPanel.vue')

    expect(page).toContain(':focus-place-id="focusPlaceId"')
    expect(page).toContain(':focus-history-node-id="focusHistoryNodeId"')
    expect(page).toContain(':focus-entry-id="focusEntryId"')
    expect(page).toContain('@open-settings="openFocusedPlaceSettings"')
    expect(panel).toContain('class="history-draft-panel"')
    expect(panel).toContain('historyDraftNodes')
    expect(panel).toContain('historyDraftSites')
    expect(panel).toContain('historyDraftPlaces')
    expect(panel).toContain('buildPlaceEntityIndex')
    expect(panel).toContain('buildPlaceRuntimePatch')
    expect(panel).toContain('data-test="place-entity-panel"')
    expect(panel).toContain('gameStore.saveWorldMapState')
    expect(panel).toContain('gameStore.setHistoryNode')
    expect(panel).toContain('focusedPlaceEntity')
    expect(panel).toContain('focusedHistoryNode')
    expect(panel).toContain('focusedEntry')
    expect(panel).toContain("class=\"{ 'is-focused': entity.placeId === focusPlaceId }")
  })

  it('keeps the same place context when crossing from the map to structured settings', () => {
    const page = readProjectFile('src/pages/StructuredSettings.vue')

    expect(page).toContain('route.query.placeId')
    expect(page).toContain('data-test="settings-place-context"')
    expect(page).toContain('openFocusedPlaceMap')
    expect(page).toContain("name: 'settings-world-map'")
  })

  it('exposes per-history-node and per-entry map entrances from the focused place context', () => {
    const page = readProjectFile('src/pages/StructuredSettings.vue')

    expect(page).toContain('focusedPlace.historyNodes')
    expect(page).toContain('focusedPlace.entries')
    expect(page).toContain('query.historyNodeId = itemId')
    expect(page).toContain('query.entryId = itemId')
    expect(page).toContain('data-test="place-history-map-link"')
    expect(page).toContain('data-test="place-entry-map-link"')
  })

  it('OpeningPage applies the canonical history node before starting the adventure', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    expect(openingPage).toContain('gameStore.setHistoryNode(patches.historyNode)')
    expect(openingPage).toContain('gameStore.saveWorldMapState')
    expect(openingPage).toContain('gameStore.appendPlotJournal')
  })
})
