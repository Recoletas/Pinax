import {
  VALID_BIOME_IDS,
  VALID_HEIGHTMAP_TEMPLATES,
  VALID_LAYER_KEYS,
  VALID_NAMING,
  VALID_STYLE_PRESETS,
} from '../../config/geography-types'

const FIELD_SPECS = [
  { key: 'width', type: 'int', min: 400, max: 4096 },
  { key: 'height', type: 'int', min: 400, max: 4096 },
  { key: 'pointCount', type: 'int', min: 2000, max: 20000 },
  { key: 'landRatio', type: 'num', min: 0.15, max: 0.8 },
  { key: 'plateCount', type: 'int', min: 2, max: 12 },
  { key: 'stateCount', type: 'int', min: 2, max: 15 },
  { key: 'burgDensity', type: 'num', min: 0.1, max: 1.5 },
  { key: 'temperatureShift', type: 'int', min: -20, max: 20 },
  { key: 'precipitationFactor', type: 'num', min: 0.2, max: 3.0 },
  { key: 'plateSpeedFactor', type: 'num', min: 0.1, max: 3.0 },
]

const KNOWN_TOP_LEVEL_FIELDS = new Set([
  'seed',
  'mapName',
  'pointCount',
  'landRatio',
  'heightmapTemplate',
  'plateCount',
  'continentCount',
  'stateCount',
  'burgDensity',
  'temperatureShift',
  'precipitationFactor',
  'width',
  'height',
  'plateSpeedFactor',
  'stylePreset',
  'layers',
  'biomeOverrides',
  'generateProvinces',
  'generateRoads',
  'namingStyle',
  'stateNames',
  'burgNames',
  'riverNames',
  'realism',
  'constraints',
])

export function validateMapConfig(parsed) {
  const warnings = []
  const unknownFields = []

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      warnings,
      unknownFields,
      reason: 'root is not an object',
    }
  }

  for (const key of Object.keys(parsed)) {
    if (!KNOWN_TOP_LEVEL_FIELDS.has(key)) unknownFields.push(key)
  }

  for (const spec of FIELD_SPECS) {
    const value = parsed[spec.key]
    if (value === undefined || value === null || value === '') continue
    if (!Number.isFinite(value)) {
      warnings.push(`${spec.key}: invalid number, fallback to default`)
      continue
    }
    if (value < spec.min || value > spec.max) {
      warnings.push(`${spec.key}: out of range ${spec.min}-${spec.max}, clamped`)
    }
  }

  if (parsed.heightmapTemplate !== undefined && !VALID_HEIGHTMAP_TEMPLATES.includes(parsed.heightmapTemplate)) {
    warnings.push(`heightmapTemplate: invalid preset "${parsed.heightmapTemplate}", ignored`)
  }

  if (parsed.namingStyle !== undefined && !VALID_NAMING.includes(parsed.namingStyle)) {
    warnings.push(`namingStyle: invalid style "${parsed.namingStyle}", ignored`)
  }

  if (parsed.stylePreset !== undefined && !VALID_STYLE_PRESETS.includes(parsed.stylePreset)) {
    warnings.push(`stylePreset: invalid preset "${parsed.stylePreset}", ignored`)
  }

  if (parsed.layers !== undefined) {
    if (!parsed.layers || typeof parsed.layers !== 'object' || Array.isArray(parsed.layers)) {
      warnings.push('layers: invalid object, ignored')
    } else {
      for (const key of Object.keys(parsed.layers)) {
        if (!VALID_LAYER_KEYS.includes(key)) {
          warnings.push(`layers.${key}: unknown layer, ignored`)
        }
      }
    }
  }

  if (parsed.biomeOverrides !== undefined) {
    if (!Array.isArray(parsed.biomeOverrides)) {
      warnings.push('biomeOverrides: invalid array, ignored')
    } else {
      for (const [index, override] of parsed.biomeOverrides.entries()) {
        if (!override || typeof override !== 'object') {
          warnings.push(`biomeOverrides[${index}]: invalid entry, ignored`)
          continue
        }
        if (!VALID_BIOME_IDS.includes(override.id)) {
          warnings.push(`biomeOverrides[${index}].id: invalid biome id, ignored`)
        }
      }
    }
  }

  return { ok: true, warnings, unknownFields }
}
