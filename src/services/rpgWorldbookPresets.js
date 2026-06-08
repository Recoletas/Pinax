import xianxiaWorld from '../../server/data/worlds/仙侠世界/world.json'
import fantasyWorld from '../../server/data/worlds/奇幻大陆/world.json'
import apocalypseWorld from '../../server/data/worlds/末日生存/world.json'
import scifiWorld from '../../server/data/worlds/科幻星际/world.json'
import urbanWorld from '../../server/data/worlds/都市生活/world.json'
import {
  adaptRpgWorldToWorldbookPayload,
  summarizeRpgWorldShape
} from './worldbookPresetAdapter'

const RPG_WORLD_SOURCES = [
  ['rpg-xianxia', xianxiaWorld],
  ['rpg-fantasy', fantasyWorld],
  ['rpg-apocalypse', apocalypseWorld],
  ['rpg-scifi', scifiWorld],
  ['rpg-urban', urbanWorld]
]

export const rpgWorldbookPresets = RPG_WORLD_SOURCES.map(([id, world]) => ({
  ...adaptRpgWorldToWorldbookPayload(world, { id }),
  sourceWorldShape: summarizeRpgWorldShape(world)
}))

export function findRpgWorldbookPreset(id) {
  return rpgWorldbookPresets.find(preset => preset.id === id) || null
}
