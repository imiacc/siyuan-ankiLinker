import type { Plugin } from 'siyuan'
import { readDir, removeFile } from '@/api'
import type { AnkiLinkerMapping, AnkiLinkerSettings } from '@/types/plugin'

export const SETTINGS_STORAGE_KEY = 'settings.json'
export const LEGACY_MAPPINGS_STORAGE_KEY = 'mappings.json'
export const MAPPINGS_INDEX_STORAGE_KEY = 'mappings.index.json'
export const MAPPINGS_BACKUP_STORAGE_KEY = 'mappings.backup.json'
export const MAPPINGS_SHARD_PREFIX = 'mappings.part-'
export const MAPPINGS_SHARD_SUFFIX = '.json'
export const STORAGE_DIR = 'siyuan-ankiLinker'

const STORAGE_BASE_PATH = `/data/storage/petal/${STORAGE_DIR}`
const STORAGE_VERSION = 2
const SHARD_BUCKET_COUNT = 32

type MappingShardSummary = {
  key: string
  bucket: number
  count: number
  checksum: string
  updatedAt: string
}

type MappingIndexFile = {
  version: number
  bucketCount: number
  totalCount: number
  updatedAt: string
  shards: MappingShardSummary[]
}

type PersistedState = {
  settings: Partial<AnkiLinkerSettings> | null
  mappings: AnkiLinkerMapping[]
  migrationMessage: string
}

function getShardKey(bucket: number) {
  return `${MAPPINGS_SHARD_PREFIX}${String(bucket).padStart(4, '0')}${MAPPINGS_SHARD_SUFFIX}`
}

function createHash(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index)
    hash |= 0
  }
  return `h${Math.abs(hash)}`
}

function getMappingIdentity(mapping: AnkiLinkerMapping) {
  return String(mapping.siyuanCardId || mapping.siyuanBlockId || mapping.ankiNoteId || '').trim()
}

function compareMappings(left: AnkiLinkerMapping, right: AnkiLinkerMapping) {
  const leftIdentity = getMappingIdentity(left)
  const rightIdentity = getMappingIdentity(right)
  if (leftIdentity !== rightIdentity) {
    return leftIdentity.localeCompare(rightIdentity)
  }

  const leftUpdatedAt = String(left.updatedAt || '')
  const rightUpdatedAt = String(right.updatedAt || '')
  if (leftUpdatedAt !== rightUpdatedAt) {
    return leftUpdatedAt.localeCompare(rightUpdatedAt)
  }

  return String(left.ankiNoteId || '').localeCompare(String(right.ankiNoteId || ''))
}

function normalizeMappings(mappings: AnkiLinkerMapping[]) {
  return [...mappings]
    .filter(Boolean)
    .map(mapping => ({
      ...mapping,
      siyuanCardId: String(mapping.siyuanCardId || '').trim(),
      siyuanDeckId: String(mapping.siyuanDeckId || '').trim(),
      siyuanBlockId: String(mapping.siyuanBlockId || '').trim(),
      hPath: String(mapping.hPath || '').trim(),
      deckName: String(mapping.deckName || '').trim(),
      noteType: String(mapping.noteType || '').trim(),
      hash: String(mapping.hash || '').trim(),
      createdAt: String(mapping.createdAt || '').trim(),
      updatedAt: String(mapping.updatedAt || '').trim(),
      ankiNoteId: Number(mapping.ankiNoteId || 0),
    }))
    .sort(compareMappings)
}

function isValidMappingIndex(value: unknown): value is MappingIndexFile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const data = value as MappingIndexFile
  return Array.isArray(data.shards)
    && typeof data.version === 'number'
    && typeof data.bucketCount === 'number'
    && typeof data.totalCount === 'number'
}

function getBucketForMapping(mapping: AnkiLinkerMapping) {
  const identity = getMappingIdentity(mapping)
  if (!identity) {
    return 0
  }

  let hash = 0
  for (let index = 0; index < identity.length; index += 1) {
    hash = ((hash << 5) - hash) + identity.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash) % SHARD_BUCKET_COUNT
}

function buildShardPayloads(mappings: AnkiLinkerMapping[]) {
  const bucketMap = new Map<number, AnkiLinkerMapping[]>()

  for (const mapping of normalizeMappings(mappings)) {
    const bucket = getBucketForMapping(mapping)
    const shardMappings = bucketMap.get(bucket) || []
    shardMappings.push(mapping)
    bucketMap.set(bucket, shardMappings)
  }

  const updatedAt = new Date().toISOString()
  const shards = [...bucketMap.entries()]
    .sort(([leftBucket], [rightBucket]) => leftBucket - rightBucket)
    .map(([bucket, shardMappings]) => {
      const key = getShardKey(bucket)
      const serialized = JSON.stringify(shardMappings)
      return {
        key,
        bucket,
        mappings: shardMappings,
        summary: {
          key,
          bucket,
          count: shardMappings.length,
          checksum: createHash(serialized),
          updatedAt,
        },
      }
    })

  return {
    updatedAt,
    normalizedMappings: normalizeMappings(mappings),
    shards,
    index: {
      version: STORAGE_VERSION,
      bucketCount: SHARD_BUCKET_COUNT,
      totalCount: mappings.length,
      updatedAt,
      shards: shards.map(item => item.summary),
    } satisfies MappingIndexFile,
  }
}

async function loadShardMappings(plugin: Plugin, index: MappingIndexFile) {
  const mappings: AnkiLinkerMapping[] = []

  for (const shard of index.shards) {
    const shardData = await plugin.loadData(shard.key) as AnkiLinkerMapping[] | null
    if (!Array.isArray(shardData)) {
      throw new Error(`missing shard: ${shard.key}`)
    }

    const normalizedShard = normalizeMappings(shardData)
    const checksum = createHash(JSON.stringify(normalizedShard))
    if (checksum !== shard.checksum) {
      throw new Error(`invalid shard checksum: ${shard.key}`)
    }

    mappings.push(...normalizedShard)
  }

  return normalizeMappings(mappings)
}

async function loadMappingsFromBackup(plugin: Plugin) {
  const backup = await plugin.loadData(MAPPINGS_BACKUP_STORAGE_KEY) as AnkiLinkerMapping[] | null
  return Array.isArray(backup) ? normalizeMappings(backup) : []
}

async function migrateLegacyMappings(plugin: Plugin, legacyMappings: AnkiLinkerMapping[]) {
  const normalizedMappings = normalizeMappings(legacyMappings)
  if (normalizedMappings.length === 0) {
    return ''
  }

  await plugin.saveData(MAPPINGS_BACKUP_STORAGE_KEY, normalizedMappings)
  await saveMappings(plugin, normalizedMappings)
  return `已将旧版 ${LEGACY_MAPPINGS_STORAGE_KEY} 迁移到分片存储，共 ${normalizedMappings.length} 条映射`
}

export async function loadPersistedState(plugin: Plugin): Promise<PersistedState> {
  const settings = await plugin.loadData(SETTINGS_STORAGE_KEY) as Partial<AnkiLinkerSettings> | null

  try {
    const indexData = await plugin.loadData(MAPPINGS_INDEX_STORAGE_KEY)
    if (isValidMappingIndex(indexData)) {
      const mappings = await loadShardMappings(plugin, indexData)
      return {
        settings,
        mappings,
        migrationMessage: '',
      }
    }
  } catch {
    const backupMappings = await loadMappingsFromBackup(plugin)
    if (backupMappings.length > 0) {
      await saveMappings(plugin, backupMappings)
      return {
        settings,
        mappings: backupMappings,
        migrationMessage: `检测到分片存储异常，已从备份恢复 ${backupMappings.length} 条映射`,
      }
    }
  }

  const legacyMappings = await plugin.loadData(LEGACY_MAPPINGS_STORAGE_KEY) as AnkiLinkerMapping[] | null
  if (Array.isArray(legacyMappings) && legacyMappings.length > 0) {
    const migrationMessage = await migrateLegacyMappings(plugin, legacyMappings)
    return {
      settings,
      mappings: normalizeMappings(legacyMappings),
      migrationMessage,
    }
  }

  const backupMappings = await loadMappingsFromBackup(plugin)
  return {
    settings,
    mappings: backupMappings,
    migrationMessage: backupMappings.length > 0 ? `映射主存储不可用，已加载备份中的 ${backupMappings.length} 条映射` : '',
  }
}

export async function saveSettings(plugin: Plugin, settings: AnkiLinkerSettings) {
  const settingsPayload: AnkiLinkerSettings = {
    ...settings,
    pathDeckRules: [...settings.pathDeckRules],
  }
  await plugin.saveData(SETTINGS_STORAGE_KEY, settingsPayload)
}

export async function saveMappings(plugin: Plugin, mappings: AnkiLinkerMapping[]) {
  const { normalizedMappings, shards, index } = buildShardPayloads(mappings)
  await plugin.saveData(MAPPINGS_BACKUP_STORAGE_KEY, normalizedMappings)

  const previousIndex = await plugin.loadData(MAPPINGS_INDEX_STORAGE_KEY) as MappingIndexFile | null
  const previousShardMap = isValidMappingIndex(previousIndex)
    ? new Map(previousIndex.shards.map(shard => [shard.key, shard]))
    : new Map<string, MappingShardSummary>()

  for (const shard of shards) {
    const previousSummary = previousShardMap.get(shard.key)
    if (previousSummary && previousSummary.checksum === shard.summary.checksum && previousSummary.count === shard.summary.count) {
      continue
    }
    await plugin.saveData(shard.key, shard.mappings)
  }

  await plugin.saveData(MAPPINGS_INDEX_STORAGE_KEY, index)

  if (isValidMappingIndex(previousIndex)) {
    const nextShardKeys = new Set(index.shards.map(shard => shard.key))
    for (const shard of previousIndex.shards) {
      if (!nextShardKeys.has(shard.key)) {
        await plugin.removeData(shard.key).catch(() => null)
      }
    }
  }
}

export async function clearStorageData(plugin: Plugin) {
  const entries = await readDir(STORAGE_BASE_PATH).catch(() => []) as IResReadDir | IResReadDir[]
  const fileEntries = Array.isArray(entries) ? entries : []

  await Promise.allSettled([
    plugin.removeData(SETTINGS_STORAGE_KEY),
    plugin.removeData(LEGACY_MAPPINGS_STORAGE_KEY),
    plugin.removeData(MAPPINGS_INDEX_STORAGE_KEY),
    plugin.removeData(MAPPINGS_BACKUP_STORAGE_KEY),
    ...fileEntries
      .filter(entry => entry && typeof entry.name === 'string' && !entry.isDir)
      .map(entry => removeFile(`${STORAGE_BASE_PATH}/${entry.name}`)),
  ])

  await removeFile(STORAGE_BASE_PATH).catch(() => null)
}
