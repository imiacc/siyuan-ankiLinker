import { getBlockAttrs, getBlockKramdown, getChildBlocks, getHPathByID, getRiffCards, getRiffDueCards, sql } from '@/api'
import { createAnkiClient } from '@/utils/anki'
import type {
  AnkiLinkerMapping,
  AnkiLinkerSettings,
  DeletionDiagnosticsResult,
  FlashcardCandidate,
  FlashcardKind,
  FlashcardPreview,
  MappingDeletionDiagnostic,
  SyncPreviewResult,
} from '@/types/plugin'
import type { ICard } from 'siyuan'

type CardDiagnostics = {
  cachedCount: number
  sqlCount: number
  apiCount: number
  dueCount: number
  blockScanCount: number
  tableNames: string[]
  cardColumns: string[]
}

type CardSourceSnapshot = {
  cachedCards: ICard[]
  apiCards: ICard[]
  dueCards: ICard[]
  sqlCards: ICard[]
  blockScannedCards: ICard[]
  mergedCards: ICard[]
  sqlCardsReliable: boolean
  blockScanReliable: boolean
}

type CandidateIndex = {
  byCardId: Map<string, FlashcardCandidate>
  byBlockId: Map<string, FlashcardCandidate>
}

type MappingIndex = {
  byCardId: Map<string, AnkiLinkerMapping>
  byBlockId: Map<string, AnkiLinkerMapping>
}

type AnkiTagMappingCache = {
  noteIds: number[]
  noteIdByCardTag: Map<string, number>
  fetchedAt: number
}

const RUNTIME_KEY = '_sy_siyuan_ankiLinker'
const PRIMARY_PLUGIN_TAG = 'siyuan-anki-linker'
const DEFAULT_SEPARATOR_PATTERN = /^-{3,}$|^\*{3,}$/m
const KRAMDOWN_BLOCK_IAL_LINE_PATTERN = /^\{:\s+[^\n]*?\bid="[^"]+"[^\n]*\}\s*$/gm
const KRAMDOWN_INLINE_IAL_PATTERN = /\s*\{:\s+[^\n{}]*\bid="[^"]+"[^\n{}]*\}/g
const SIYUAN_LAYOUT_CONTAINER_OPEN_LINE_PATTERN = /^\s*\{\{\{[a-zA-Z][^\n]*$/gm
const SIYUAN_LAYOUT_CONTAINER_CLOSE_LINE_PATTERN = /^\s*\}\}\}\s*$/gm
const SIYUAN_SUPER_BLOCK_DETECT_PATTERN = /^\s*\{\{\{[a-zA-Z]/
const CLOZE_PATTERN = /==((?=\S)(?:(?!==)[^\n])*?\S)==/g
const INLINE_CODE_PATTERN = /`[^`\n]+`/g
const BLOCK_CODE_PATTERN = /```[\s\S]*?```/g
const CLOZE_MASK_PLACEHOLDER_PATTERN = /(\d+)/g
const FLASHCARD_BLOCK_IAL_PATTERN = "%custom-riff-decks%"
const LEGACY_FLASHCARD_BLOCK_IAL_PATTERN = "%custom-fsrs-flashcard%"
const SQL_SCAN_PAGE_SIZE = 64
const SNAPSHOT_CACHE_TTL = 3000
const ANKI_TAG_CACHE_TTL = 15000
const UPDATE_BATCH_SIZE = 20

let snapshotCache: {
  value: CardSourceSnapshot
  expiresAt: number
} | null = null

const ankiTagMappingCache = new Map<string, AnkiTagMappingCache>()

function toSyntheticCardId(blockID: string) {
  return `block:${blockID}`
}

function normalizeCardIdentity(cardID: string, blockID: string) {
  return cardID || toSyntheticCardId(blockID)
}

function extractCardArray(payload: any): any[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload && typeof payload === 'object') {
    const candidates = [payload.cards, payload.data, payload.items, payload.list]
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate
      }
    }
  }

  return []
}

function normalizeCardLike(card: Record<string, any>): ICard | null {
  const rawCardID = String(card.cardID || card.cardId || card.id || card.riffCardId || '').trim()
  const blockID = String(card.blockID || card.blockId || card.block_id || card.sourceBlockId || '').trim()
  const deckID = String(card.deckID || card.deckId || card.deck_id || card.deck || '').trim()

  if (!blockID) {
    return null
  }

  return {
    cardID: normalizeCardIdentity(rawCardID, blockID),
    blockID,
    deckID,
  }
}

function normalizeCardList(payload: any): ICard[] {
  return extractCardArray(payload)
    .map((item: Record<string, any>) => normalizeCardLike(item))
    .filter((item: ICard | null): item is ICard => Boolean(item))
}

function mergeCardLists(...lists: ICard[][]): ICard[] {
  const mergedByBlockId = new Map<string, ICard>()

  for (const list of lists) {
    for (const item of list) {
      const blockID = String(item?.blockID || '').trim()
      if (!blockID) {
        continue
      }

      const normalizedItem: ICard = {
        cardID: normalizeCardIdentity(String(item.cardID || ''), blockID),
        blockID,
        deckID: String(item.deckID || '').trim(),
      }

      const existing = mergedByBlockId.get(blockID)
      if (!existing) {
        mergedByBlockId.set(blockID, normalizedItem)
        continue
      }

      const existingHasRealCardId = !String(existing.cardID || '').startsWith('block:')
      const nextHasRealCardId = !String(normalizedItem.cardID || '').startsWith('block:')
      const existingDeckID = String(existing.deckID || '').trim()
      const nextDeckID = String(normalizedItem.deckID || '').trim()

      if ((!existingHasRealCardId && nextHasRealCardId) || (!existingDeckID && !!nextDeckID)) {
        mergedByBlockId.set(blockID, {
          cardID: nextHasRealCardId ? normalizedItem.cardID : existing.cardID,
          blockID,
          deckID: nextDeckID || existingDeckID,
        })
      }
    }
  }

  return [...mergedByBlockId.values()]
}

async function querySqlInPages<T>(buildStatement: (offset: number, limit: number) => string): Promise<{
  rows: T[]
  reliable: boolean
}> {
  const rows: T[] = []
  let offset = 0
  let reliable = true

  while (true) {
    const page = await sql(buildStatement(offset, SQL_SCAN_PAGE_SIZE))
    const normalizedPage = Array.isArray(page) ? page as T[] : []
    rows.push(...normalizedPage)

    if (normalizedPage.length < SQL_SCAN_PAGE_SIZE) {
      break
    }

    offset += SQL_SCAN_PAGE_SIZE

    if (offset > 10000) {
      reliable = false
      break
    }
  }

  return {
    rows,
    reliable,
  }
}

async function getCardSourceSnapshot(): Promise<CardSourceSnapshot> {
  if (snapshotCache && snapshotCache.expiresAt > Date.now()) {
    return snapshotCache.value
  }

  const [cachedCards, apiCards, dueCards, sqlCardsResult, blockScannedCardsResult] = await Promise.all([
    Promise.resolve(getCachedCards()).then(cards => mergeCardLists(cards)),
    getApiCards(),
    getApiDueCards(),
    getSqlCards(),
    scanFlashcardBlocks(),
  ])

  const snapshot: CardSourceSnapshot = {
    cachedCards,
    apiCards,
    dueCards,
    sqlCards: sqlCardsResult.cards,
    blockScannedCards: blockScannedCardsResult.cards,
    mergedCards: mergeCardLists(sqlCardsResult.cards, apiCards, cachedCards, blockScannedCardsResult.cards),
    sqlCardsReliable: sqlCardsResult.reliable,
    blockScanReliable: blockScannedCardsResult.reliable,
  }

  snapshotCache = {
    value: snapshot,
    expiresAt: Date.now() + SNAPSHOT_CACHE_TTL,
  }

  return snapshot
}

function sanitizeSiyuanMarkdown(markdown: string) {
  return String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(KRAMDOWN_BLOCK_IAL_LINE_PATTERN, '')
    .replace(KRAMDOWN_INLINE_IAL_PATTERN, '')
    .replace(SIYUAN_LAYOUT_CONTAINER_OPEN_LINE_PATTERN, '')
    .replace(SIYUAN_LAYOUT_CONTAINER_CLOSE_LINE_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function splitMarkdownCard(markdown: string): FlashcardPreview | null {
  const normalized = sanitizeSiyuanMarkdown(markdown)
  if (!normalized) {
    return null
  }

  const lines = normalized.split('\n')
  const separatorIndex = lines.findIndex(line => DEFAULT_SEPARATOR_PATTERN.test(line.trim()))
  if (separatorIndex <= 0 || separatorIndex >= lines.length - 1) {
    return null
  }

  const front = lines.slice(0, separatorIndex).join('\n').trim()
  const back = lines.slice(separatorIndex + 1).join('\n').trim()
  if (!front || !back) {
    return null
  }

  return { front, back }
}

function applyClozeReplace(
  markdown: string,
  replacer: (content: string, index: number) => string,
): { text: string; count: number } {
  const masks: string[] = []
  const mask = (match: string) => {
    const placeholder = `${masks.length}`
    masks.push(match)
    return placeholder
  }

  const masked = markdown
    .replace(BLOCK_CODE_PATTERN, mask)
    .replace(INLINE_CODE_PATTERN, mask)

  let count = 0
  const replaced = masked.replace(CLOZE_PATTERN, (_, content: string) => {
    count += 1
    return replacer(content, count)
  })

  const text = replaced.replace(CLOZE_MASK_PLACEHOLDER_PATTERN, (_, idx: string) => masks[Number(idx)] ?? '')
  return { text, count }
}

function buildClozeText(markdown: string) {
  const sanitizedMarkdown = sanitizeSiyuanMarkdown(markdown)
  const { text, count } = applyClozeReplace(
    sanitizedMarkdown,
    (content, index) => `{{c${index}::${content.trim()}}}`,
  )
  return {
    text: text.trim(),
    count,
  }
}

function buildClozePreview(markdown: string): FlashcardPreview | null {
  const sanitizedMarkdown = sanitizeSiyuanMarkdown(markdown)
  const cloze = buildClozeText(sanitizedMarkdown)
  if (cloze.count === 0 || !cloze.text) {
    return null
  }

  const front = applyClozeReplace(sanitizedMarkdown, () => '_____').text.trim()
  const back = applyClozeReplace(sanitizedMarkdown, content => content).text.trim()
  if (!front || !back) {
    return null
  }

  return { front, back }
}

async function buildChildBlockPreview(blockID: string): Promise<FlashcardPreview | null> {
  try {
    const childBlocks = await getChildBlocks(blockID)
    if (!childBlocks || childBlocks.length < 2) {
      return null
    }

    const childMarkdownList = await Promise.all(childBlocks.map(async (child: Record<string, any>) => {
      const childID = String(child.id || '').trim()
      if (!childID) {
        return ''
      }
      const childKramdown = await getBlockKramdown(childID)
      return sanitizeSiyuanMarkdown(String(childKramdown?.kramdown || '').trim())
    }))

    const normalizedChildren = childMarkdownList.filter(Boolean)
    if (normalizedChildren.length < 2) {
      return null
    }

    const front = normalizedChildren[0].trim()
    const back = normalizedChildren.slice(1).join('\n\n').trim()
    if (!front || !back) {
      return null
    }

    return { front, back }
  } catch {
    return null
  }
}

async function parseFlashcardCandidate(card: ICard, rawMarkdown: string, isSuperBlock: boolean): Promise<{
  preview: FlashcardPreview | null
  kind: FlashcardKind
  clozeText: string
}> {
  if (isSuperBlock) {
    const childPreview = await buildChildBlockPreview(card.blockID)
    if (childPreview) {
      return {
        preview: childPreview,
        kind: 'qa',
        clozeText: '',
      }
    }
    return {
      preview: null,
      kind: 'qa',
      clozeText: '',
    }
  }

  const markdownPreview = splitMarkdownCard(rawMarkdown)
  if (markdownPreview) {
    return {
      preview: markdownPreview,
      kind: 'qa',
      clozeText: '',
    }
  }

  const clozePreview = buildClozePreview(rawMarkdown)
  if (clozePreview) {
    return {
      preview: clozePreview,
      kind: 'cloze',
      clozeText: buildClozeText(rawMarkdown).text,
    }
  }

  const childPreview = await buildChildBlockPreview(card.blockID)
  if (childPreview) {
    return {
      preview: childPreview,
      kind: 'qa',
      clozeText: '',
    }
  }

  return {
    preview: null,
    kind: 'qa',
    clozeText: '',
  }
}

function createHashValue(content: string): string {
  let hash = 0
  for (let index = 0; index < content.length; index += 1) {
    hash = ((hash << 5) - hash) + content.charCodeAt(index)
    hash |= 0
  }
  return `h${Math.abs(hash)}`
}

function resolveDeckNameByPath(hPath: string, settings: AnkiLinkerSettings) {
  const normalized = String(hPath || '').trim()
  for (const rule of settings.pathDeckRules || []) {
    const path = String(rule.path || '').trim()
    const deckName = String(rule.deckName || '').trim()
    if (!path || !deckName) {
      continue
    }
    if (normalized.startsWith(path)) {
      return deckName
    }
  }
  return settings.deckName
}

export function getCachedCards(): ICard[] {
  return window[RUNTIME_KEY]?.cards || []
}

export async function getApiCards(): Promise<ICard[]> {
  try {
    return normalizeCardList(await getRiffCards())
  } catch {
    return []
  }
}

export async function getApiDueCards(): Promise<ICard[]> {
  try {
    return normalizeCardList(await getRiffDueCards())
  } catch {
    return []
  }
}

export async function getSqlCards(): Promise<{
  cards: ICard[]
  reliable: boolean
}> {
  try {
    const result = await querySqlInPages<Record<string, any>>((offset, limit) => `
      select id as cardID, block_id as blockID, deck_id as deckID
      from cards
      order by id
      limit ${limit} offset ${offset}
    `)

    return {
      cards: result.rows.map((row: Record<string, any>) => {
        const blockID = String(row.blockID || row.blockid || row.block_id || '')
        const rawCardID = String(row.cardID || row.cardid || row.id || '')
        return {
          cardID: normalizeCardIdentity(rawCardID, blockID),
          blockID,
          deckID: String(row.deckID || row.deckid || row.deck_id || ''),
        }
      }).filter((item: ICard) => item.blockID),
      reliable: result.reliable,
    }
  } catch {
    return {
      cards: [],
      reliable: false,
    }
  }
}

export async function scanFlashcardBlocks(): Promise<{
  cards: ICard[]
  reliable: boolean
}> {
  try {
    const result = await querySqlInPages<Record<string, any>>((offset, limit) => `
      select id as blockID
      from blocks
      where ial like '${FLASHCARD_BLOCK_IAL_PATTERN}'
         or ial like '${LEGACY_FLASHCARD_BLOCK_IAL_PATTERN}'
      order by updated desc, id desc
      limit ${limit} offset ${offset}
    `)

    return {
      cards: result.rows.map((row: Record<string, any>) => {
        const blockID = String(row.blockID || row.blockid || row.id || '').trim()
        if (!blockID) {
          return null
        }
        return {
          cardID: toSyntheticCardId(blockID),
          blockID,
          deckID: '',
        }
      }).filter((item: ICard | null): item is ICard => Boolean(item)),
      reliable: result.reliable,
    }
  } catch {
    return {
      cards: [],
      reliable: false,
    }
  }
}

export async function getCardDiagnostics(): Promise<CardDiagnostics> {
  const snapshot = await getCardSourceSnapshot()

  let tableNames: string[] = []
  try {
    const tables = await sql("select name from sqlite_master where type='table' and (name like '%card%' or name like '%riff%') order by name")
    tableNames = (tables || []).map((row: Record<string, any>) => String(row.name || '')).filter(Boolean)
  } catch {
    tableNames = []
  }

  let cardColumns: string[] = []
  try {
    const columns = await sql('pragma table_info(cards)')
    cardColumns = (columns || []).map((row: Record<string, any>) => String(row.name || '')).filter(Boolean)
  } catch {
    cardColumns = []
  }

  return {
    cachedCount: snapshot.cachedCards.length,
    sqlCount: snapshot.sqlCards.length,
    apiCount: snapshot.apiCards.length,
    dueCount: snapshot.dueCards.length,
    blockScanCount: snapshot.blockScannedCards.length,
    tableNames,
    cardColumns,
  }
}

export async function getAvailableCards(): Promise<ICard[]> {
  const snapshot = await getCardSourceSnapshot()
  return snapshot.mergedCards
}

export async function getDueAvailableCards(): Promise<ICard[]> {
  const snapshot = await getCardSourceSnapshot()
  return mergeCardLists(snapshot.dueCards, snapshot.mergedCards)
}

function getCandidateTag(cardId: string) {
  return `siyuan-card:${cardId}`
}

function createCandidateIndex(candidates: FlashcardCandidate[]): CandidateIndex {
  const byCardId = new Map<string, FlashcardCandidate>()
  const byBlockId = new Map<string, FlashcardCandidate>()

  for (const candidate of candidates) {
    const cardId = String(candidate.cardId || '').trim()
    const blockId = String(candidate.blockId || '').trim()

    if (cardId && !byCardId.has(cardId)) {
      byCardId.set(cardId, candidate)
    }
    if (blockId && !byBlockId.has(blockId)) {
      byBlockId.set(blockId, candidate)
    }
  }

  return { byCardId, byBlockId }
}

function createMappingIndex(mappings: AnkiLinkerMapping[]): MappingIndex {
  const byCardId = new Map<string, AnkiLinkerMapping>()
  const byBlockId = new Map<string, AnkiLinkerMapping>()

  for (const mapping of mappings) {
    const cardId = String(mapping.siyuanCardId || '').trim()
    const blockId = String(mapping.siyuanBlockId || '').trim()

    if (cardId && !byCardId.has(cardId)) {
      byCardId.set(cardId, mapping)
    }
    if (blockId && !byBlockId.has(blockId)) {
      byBlockId.set(blockId, mapping)
    }
  }

  return { byCardId, byBlockId }
}

function findMappingByCandidateFromIndex(candidate: FlashcardCandidate, mappingIndex: MappingIndex) {
  const candidateCardId = String(candidate.cardId || '').trim()
  const candidateBlockId = String(candidate.blockId || '').trim()

  if (candidateCardId) {
    const matchedByCardId = mappingIndex.byCardId.get(candidateCardId)
    if (matchedByCardId) {
      return matchedByCardId
    }
  }

  if (candidateBlockId) {
    return mappingIndex.byBlockId.get(candidateBlockId)
  }

  return undefined
}

function findCandidateMatchForMappingFromIndex(mapping: AnkiLinkerMapping, candidateIndex: CandidateIndex) {
  const mappingCardId = String(mapping.siyuanCardId || '').trim()
  const mappingBlockId = String(mapping.siyuanBlockId || '').trim()

  if (mappingCardId) {
    const candidate = candidateIndex.byCardId.get(mappingCardId)
    if (candidate) {
      return {
        candidate,
        matchReason: 'cardId' as const,
      }
    }
  }

  if (mappingBlockId) {
    const candidate = candidateIndex.byBlockId.get(mappingBlockId)
    if (candidate) {
      return {
        candidate,
        matchReason: 'blockId' as const,
      }
    }
  }

  return null
}

function findMappingForCandidate(candidate: FlashcardCandidate, mappings: AnkiLinkerMapping[]) {
  return findMappingByCandidateFromIndex(candidate, createMappingIndex(mappings))
}

function findCandidateMatchForMapping(mapping: AnkiLinkerMapping, candidates: FlashcardCandidate[]) {
  return findCandidateMatchForMappingFromIndex(mapping, createCandidateIndex(candidates))
}

function findCandidateForMapping(mapping: AnkiLinkerMapping, candidates: FlashcardCandidate[]) {
  return findCandidateMatchForMapping(mapping, candidates)?.candidate
}

function canSafelyDeleteMappings(snapshot: CardSourceSnapshot) {
  return (snapshot.sqlCardsReliable && snapshot.sqlCards.length > 0)
    || (snapshot.blockScanReliable && snapshot.blockScannedCards.length > 0)
}

async function getAnkiTagMappingIndex(
  settings: AnkiLinkerSettings,
  forceRefresh = false,
): Promise<AnkiTagMappingCache> {
  const cacheKey = String(settings.ankiUrl || '').trim()
  const cached = ankiTagMappingCache.get(cacheKey)
  if (!forceRefresh && cached && cached.fetchedAt + ANKI_TAG_CACHE_TTL > Date.now()) {
    return cached
  }

  const client = createAnkiClient(settings.ankiUrl)
  const noteIds = await client.findNotes(`tag:${PRIMARY_PLUGIN_TAG}`)
  const notes = noteIds.length > 0 ? await client.notesInfo(noteIds) : []
  const noteIdByCardTag = new Map<string, number>()

  for (const note of notes) {
    for (const tag of note.tags || []) {
      if (typeof tag === 'string' && tag.startsWith('siyuan-card:')) {
        noteIdByCardTag.set(tag, note.noteId)
      }
    }
  }

  const nextCache: AnkiTagMappingCache = {
    noteIds,
    noteIdByCardTag,
    fetchedAt: Date.now(),
  }

  ankiTagMappingCache.set(cacheKey, nextCache)
  return nextCache
}

function invalidateSyncCaches(settings?: AnkiLinkerSettings) {
  snapshotCache = null
  if (settings) {
    ankiTagMappingCache.delete(String(settings.ankiUrl || '').trim())
    return
  }
  ankiTagMappingCache.clear()
}

async function hydrateMappingsFromAnki(
  settings: AnkiLinkerSettings,
  candidates: FlashcardCandidate[],
  mappings: AnkiLinkerMapping[],
): Promise<AnkiLinkerMapping[]> {
  const mappingIndex = createMappingIndex(mappings)
  const unresolvedCandidates = candidates.filter(candidate => !findMappingByCandidateFromIndex(candidate, mappingIndex))
  if (unresolvedCandidates.length === 0) {
    return mappings
  }

  try {
    const tagMappingIndex = await getAnkiTagMappingIndex(settings)
    if (tagMappingIndex.noteIds.length === 0) {
      return mappings
    }

    const recoveredMappings: AnkiLinkerMapping[] = [...mappings]
    for (const candidate of unresolvedCandidates) {
      const noteId = tagMappingIndex.noteIdByCardTag.get(getCandidateTag(candidate.cardId))
      if (!noteId || findMappingByCandidateFromIndex(candidate, mappingIndex)) {
        continue
      }

      const recoveredMapping: AnkiLinkerMapping = {
        siyuanCardId: candidate.cardId,
        siyuanDeckId: candidate.deckId,
        siyuanBlockId: candidate.blockId,
        hPath: candidate.hPath,
        ankiNoteId: noteId,
        deckName: candidate.targetDeckName || settings.deckName,
        noteType: candidate.noteType,
        hash: candidate.hash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      recoveredMappings.push(recoveredMapping)
      if (recoveredMapping.siyuanCardId) {
        mappingIndex.byCardId.set(recoveredMapping.siyuanCardId, recoveredMapping)
      }
      if (recoveredMapping.siyuanBlockId) {
        mappingIndex.byBlockId.set(recoveredMapping.siyuanBlockId, recoveredMapping)
      }
    }

    return recoveredMappings
  } catch {
    return mappings
  }
}

function normalizeAssetPath(path: string) {
  const trimmedPath = String(path || '').trim()
  if (!trimmedPath) {
    return ''
  }

  if (/^(https?:|data:|file:|siyuan:|mailto:|anki:)/i.test(trimmedPath)) {
    return trimmedPath
  }

  if (/^assets\//i.test(trimmedPath)) {
    return `/${trimmedPath}`
  }

  if (/^\/assets\//i.test(trimmedPath)) {
    return trimmedPath
  }

  return trimmedPath
}

function toAbsoluteSiyuanAssetUrl(path: string) {
  const normalizedPath = normalizeAssetPath(path)
  if (!normalizedPath || !/^\/assets\//i.test(normalizedPath)) {
    return normalizedPath
  }

  try {
    return new URL(normalizedPath, `${location.origin}/`).toString()
  } catch {
    return normalizedPath
  }
}

function rewriteMarkdownAssetLinks(markdown: string) {
  return String(markdown || '')
    .replace(/(!?\[[^\]]*\]\()([^\)]+)(\))/g, (_, prefix: string, path: string, suffix: string) => {
      return `${prefix}${toAbsoluteSiyuanAssetUrl(path)}${suffix}`
    })
    .replace(/\b(src|href)=(['"])([^'"]+)(\2)/gi, (_, attr: string, quote: string, path: string) => {
      return `${attr}=${quote}${toAbsoluteSiyuanAssetUrl(path)}${quote}`
    })
}

function prepareMarkdownForAnki(markdown: string) {
  return rewriteMarkdownAssetLinks(String(markdown || '').trim())
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const ORDERED_LIST_ITEM_PATTERN = /^\s*(\d+)[.)]\s+(.+)$/
const DASH_LIST_ITEM_PATTERN = /^\s*-\s+(.+)$/

function createHtmlList(tagName: 'ol' | 'ul', items: string[], start?: number) {
  const startAttr = tagName === 'ol' && start && start > 1 ? ` start="${start}"` : ''
  return `<${tagName}${startAttr}>${items.map(item => `<li>${escapeHtml(item.trim())}</li>`).join('')}</${tagName}>`
}

function normalizeListBlocksForAnki(markdown: string) {
  const lines = String(markdown || '').split('\n')
  const output: string[] = []

  for (let index = 0; index < lines.length;) {
    const orderedMatch = lines[index].match(ORDERED_LIST_ITEM_PATTERN)
    const dashMatch = lines[index].match(DASH_LIST_ITEM_PATTERN)

    if (orderedMatch) {
      const items: string[] = []
      const start = Number(orderedMatch[1])
      while (index < lines.length) {
        const match = lines[index].match(ORDERED_LIST_ITEM_PATTERN)
        if (!match) break
        items.push(match[2])
        index += 1
      }
      output.push(createHtmlList('ol', items, start))
      continue
    }

    if (dashMatch) {
      const items: string[] = []
      while (index < lines.length) {
        const match = lines[index].match(DASH_LIST_ITEM_PATTERN)
        if (!match) break
        items.push(match[1])
        index += 1
      }
      output.push(createHtmlList('ul', items))
      continue
    }

    output.push(escapeHtml(lines[index]))
    index += 1
  }

  return output.join('\n')
}

function isKaTeXMarkdownNoteType(noteType: string) {
  return /katex\s+and\s+markdown/i.test(String(noteType || ''))
}

function prepareKaTeXMarkdownFieldContent(markdown: string) {
  return escapeHtml(prepareMarkdownForAnki(markdown)).replace(/\n/g, '<br>')
}

function prepareAnkiFieldContent(markdown: string, noteType = '') {
  if (isKaTeXMarkdownNoteType(noteType)) {
    return prepareKaTeXMarkdownFieldContent(markdown)
  }

  return normalizeListBlocksForAnki(prepareMarkdownForAnki(markdown))
}

function hasAnkiHtmlNormalizedList(markdown: string) {
  return String(markdown || '').split('\n').some(line => ORDERED_LIST_ITEM_PATTERN.test(line) || DASH_LIST_ITEM_PATTERN.test(line))
}

function createCandidateHashInput(
  kind: FlashcardKind,
  rawMarkdown: string,
  clozeText: string,
  front: string,
  back: string,
  targetDeckName: string,
  noteType: string,
) {
  const baseContent = clozeText || rawMarkdown
  if (isKaTeXMarkdownNoteType(noteType)) {
    return [
      kind,
      'anki-katex-markdown-br-v1',
      prepareAnkiFieldContent(baseContent, noteType),
      prepareAnkiFieldContent(front, noteType),
      prepareAnkiFieldContent(back, noteType),
      targetDeckName,
    ].join(':')
  }

  if (!hasAnkiHtmlNormalizedList(baseContent) && !hasAnkiHtmlNormalizedList(front) && !hasAnkiHtmlNormalizedList(back)) {
    return `${kind}:${baseContent}:${targetDeckName}`
  }

  return [
    kind,
    'anki-list-html-v1',
    prepareAnkiFieldContent(baseContent, noteType),
    prepareAnkiFieldContent(front, noteType),
    prepareAnkiFieldContent(back, noteType),
    targetDeckName,
  ].join(':')
}

function buildAnkiFields(candidate: FlashcardCandidate, settings: AnkiLinkerSettings) {
  if (candidate.kind === 'cloze') {
    return {
      [settings.clozeTextField]: prepareAnkiFieldContent(String(candidate.clozeText || candidate.rawMarkdown || '').trim(), candidate.noteType),
      [settings.clozeExtraField]: prepareAnkiFieldContent(String(candidate.back || '').trim(), candidate.noteType),
    }
  }

  return {
    [settings.qaFrontField]: prepareAnkiFieldContent(String(candidate.front || '').trim(), candidate.noteType),
    [settings.qaBackField]: prepareAnkiFieldContent(String(candidate.back || '').trim(), candidate.noteType),
  }
}

function validateCandidateForAnki(candidate: FlashcardCandidate, settings: AnkiLinkerSettings) {
  if (candidate.kind === 'cloze') {
    const textValue = String(candidate.clozeText || candidate.rawMarkdown || '').trim()
    if (!textValue) {
      return '填空正文为空，请检查填空模板字段映射或块内容'
    }
    if (!/\{\{c\d+::.+?\}\}/.test(textValue)) {
      return '填空正文未生成有效的 Anki Cloze 语法'
    }
    if (!settings.clozeTextField.trim() || !settings.clozeExtraField.trim()) {
      return '填空模板字段名未配置完整'
    }
    return ''
  }

  const frontValue = String(candidate.front || '').trim()
  const backValue = String(candidate.back || '').trim()
  if (!frontValue || !backValue) {
    return '问答卡正面或背面为空'
  }
  if (!settings.qaFrontField.trim() || !settings.qaBackField.trim()) {
    return '问答模板字段名未配置完整'
  }
  return ''
}

export async function collectFlashcardCandidates(cards: ICard[], settings?: AnkiLinkerSettings): Promise<FlashcardCandidate[]> {
  const candidates = await Promise.all(cards.map(async (card) => {
    const [kramdown, attrs, hPath] = await Promise.all([
      getBlockKramdown(card.blockID),
      getBlockAttrs(card.blockID),
            getHPathByID(card.blockID).catch(() => ''),
    ])

    const rawKramdown = String(kramdown?.kramdown || '').trim()
    const isSuperBlock = SIYUAN_SUPER_BLOCK_DETECT_PATTERN.test(rawKramdown)
    const rawMarkdown = sanitizeSiyuanMarkdown(rawKramdown)
    const parsed = await parseFlashcardCandidate(card, rawMarkdown, isSuperBlock)
    const targetDeckName = settings ? resolveDeckNameByPath(String(hPath || ''), settings) : ''
    const noteType = parsed.kind === 'cloze' ? (settings?.clozeNoteType || 'Cloze') : (settings?.qaNoteType || 'Basic')

    const draftCandidate: FlashcardCandidate = {
      cardId: card.cardID,
      deckId: card.deckID,
      blockId: card.blockID,
      rootId: '',
      hPath: String(hPath || ''),
      targetDeckName,
      rawMarkdown,
      front: parsed.preview?.front || '',
      back: parsed.preview?.back || '',
      attrs: attrs || {},
      isValid: Boolean(parsed.preview),
      hash: createHashValue(createCandidateHashInput(
        parsed.kind,
        rawMarkdown,
        parsed.clozeText,
        parsed.preview?.front || '',
        parsed.preview?.back || '',
        targetDeckName,
        noteType,
      )),
      identityKind: String(card.cardID || '').startsWith('block:') ? 'block' : 'card',
      kind: parsed.kind,
      noteType,
      clozeText: parsed.clozeText,
      validationMessage: '',
    }

    const validationMessage = settings ? validateCandidateForAnki(draftCandidate, settings) : ''

    return {
      ...draftCandidate,
      isValid: Boolean(parsed.preview) && !validationMessage,
      validationMessage,
    }
  }))

  return candidates
}

export async function buildDeletionDiagnostics(
  settings: AnkiLinkerSettings,
  mappings: AnkiLinkerMapping[],
): Promise<DeletionDiagnosticsResult> {
  const snapshot = await getCardSourceSnapshot()
  const candidates = await collectFlashcardCandidates(snapshot.mergedCards, settings)
  const candidateIndex = createCandidateIndex(candidates)
  const hydratedMappings = await hydrateMappingsFromAnki(settings, candidates, mappings)
  const allowDeletion = canSafelyDeleteMappings(snapshot)

  const diagnostics: MappingDeletionDiagnostic[] = hydratedMappings.map((mapping) => {
    const match = findCandidateMatchForMappingFromIndex(mapping, candidateIndex)
    return {
      key: `${mapping.siyuanCardId}-${mapping.ankiNoteId}`,
      siyuanCardId: mapping.siyuanCardId,
      siyuanBlockId: mapping.siyuanBlockId,
      ankiNoteId: mapping.ankiNoteId,
      hPath: mapping.hPath,
      deckName: mapping.deckName,
      noteType: mapping.noteType,
      matched: Boolean(match),
      matchReason: match?.matchReason || 'none',
      matchedCandidateCardId: match?.candidate.cardId || '',
      matchedCandidateBlockId: match?.candidate.blockId || '',
      matchedCandidatePath: match?.candidate.hPath || '',
    }
  })

  return {
    allowDeletion,
    candidateCount: candidates.length,
    mappingCount: hydratedMappings.length,
    orphanCount: diagnostics.filter(item => !item.matched).length,
    matchedCount: diagnostics.filter(item => item.matched).length,
    diagnostics,
  }
}

export async function buildSyncPreview(
  settings: AnkiLinkerSettings,
  mappings: AnkiLinkerMapping[],
): Promise<SyncPreviewResult> {
  const snapshot = await getCardSourceSnapshot()
  const candidates = await collectFlashcardCandidates(snapshot.mergedCards, settings)
  const hydratedMappings = await hydrateMappingsFromAnki(settings, candidates, mappings)
  const mappingIndex = createMappingIndex(hydratedMappings)
  const allowDeletion = canSafelyDeleteMappings(snapshot)

  const added: FlashcardCandidate[] = []
  const updated: FlashcardCandidate[] = []
  const unchanged: FlashcardCandidate[] = []
  const invalid: FlashcardCandidate[] = []
  const deleted = allowDeletion
    ? hydratedMappings.filter(item => !findCandidateMatchForMappingFromIndex(item, createCandidateIndex(candidates)))
    : []

  for (const candidate of candidates) {
    if (!candidate.isValid) {
      invalid.push(candidate)
      continue
    }

    const mapping = findMappingByCandidateFromIndex(candidate, mappingIndex)
    if (!mapping) {
      added.push(candidate)
      continue
    }

    if (mapping.hash !== candidate.hash || mapping.deckName !== (candidate.targetDeckName || settings.deckName) || mapping.noteType !== candidate.noteType) {
      updated.push(candidate)
      continue
    }

    unchanged.push(candidate)
  }

  return {
    added,
    updated,
    deleted,
    unchanged,
    invalid,
    summary: {
      added: added.length,
      updated: updated.length,
      deleted: deleted.length,
      unchanged: unchanged.length,
      invalid: invalid.length,
    },
  }
}

export async function cleanupInvalidMappings(
  settings: AnkiLinkerSettings,
  mappings: AnkiLinkerMapping[],
): Promise<{
  mappings: AnkiLinkerMapping[]
  removedCount: number
  repairedCount: number
}> {
  if (mappings.length === 0) {
    return {
      mappings: [],
      removedCount: 0,
      repairedCount: 0,
    }
  }

  const tagMappingIndex = await getAnkiTagMappingIndex(settings, true)
  if (tagMappingIndex.noteIds.length === 0) {
    return {
      mappings: [],
      removedCount: mappings.length,
      repairedCount: 0,
    }
  }

  const existingNoteIds = new Set<number>(tagMappingIndex.noteIds)

  let removedCount = 0
  let repairedCount = 0
  const nextMappings: AnkiLinkerMapping[] = []

  for (const mapping of mappings) {
    if (existingNoteIds.has(mapping.ankiNoteId)) {
      nextMappings.push(mapping)
      continue
    }

    const repairedNoteId = tagMappingIndex.noteIdByCardTag.get(getCandidateTag(mapping.siyuanCardId))
    if (repairedNoteId) {
      nextMappings.push({
        ...mapping,
        ankiNoteId: repairedNoteId,
        updatedAt: new Date().toISOString(),
      })
      repairedCount += 1
      continue
    }

    removedCount += 1
  }

  return {
    mappings: nextMappings,
    removedCount,
    repairedCount,
  }
}

function isAnkiNoteNotFoundError(error: unknown) {
  return String(error || '').includes('Note was not found')
}

async function runInBatches<T>(items: T[], batchSize: number, worker: (item: T) => Promise<void>, onBatchDone?: (processed: number) => void) {
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize)
    await Promise.all(batch.map(item => worker(item)))
    if (onBatchDone) onBatchDone(index + batch.length)
  }
}

export async function runSync(
  settings: AnkiLinkerSettings,
  mappings: AnkiLinkerMapping[],
  onProgress?: (percent: number) => void,
): Promise<{
  mappings: AnkiLinkerMapping[]
  preview: SyncPreviewResult
}> {
  const preview = await buildSyncPreview(settings, mappings)
  const client = createAnkiClient(settings.ankiUrl)
  const rebuiltMappings = await hydrateMappingsFromAnki(settings, [...preview.added, ...preview.updated, ...preview.unchanged, ...preview.invalid], mappings)
  const rebuiltMappingIndex = createMappingIndex(rebuiltMappings)
  const nextMappings = new Map(rebuiltMappings.map(item => [item.siyuanCardId, item]))

  const totalItems = preview.deleted.length + preview.updated.length + preview.added.length
  let completedItems = 0
  const reportProgress = () => {
    if (onProgress && totalItems > 0) {
      onProgress(Math.round((completedItems / totalItems) * 100))
    }
  }

  if (preview.deleted.length > 0) {
    const deleteIds = preview.deleted.map(item => item.ankiNoteId)
    await client.deleteNotes(deleteIds)
    for (const item of preview.deleted) {
      nextMappings.delete(item.siyuanCardId)
    }
    completedItems += preview.deleted.length
    reportProgress()
  }

  if (preview.updated.length > 0) {
    const recreateItems: FlashcardCandidate[] = []

    await runInBatches(preview.updated, UPDATE_BATCH_SIZE, async (item) => {
      const mapping = findMappingByCandidateFromIndex(item, rebuiltMappingIndex)
      if (!mapping) {
        recreateItems.push(item)
        return
      }

      try {
        await client.updateNoteFields({
          id: mapping.ankiNoteId,
          fields: buildAnkiFields(item, settings),
        })
        if (mapping.siyuanCardId !== item.cardId) {
          nextMappings.delete(mapping.siyuanCardId)
          rebuiltMappingIndex.byCardId.delete(mapping.siyuanCardId)
        }
        nextMappings.set(item.cardId, {
          ...mapping,
          siyuanCardId: item.cardId,
          siyuanDeckId: item.deckId,
          siyuanBlockId: item.blockId,
          hPath: item.hPath,
          hash: item.hash,
          deckName: item.targetDeckName || settings.deckName,
          noteType: item.noteType,
          updatedAt: new Date().toISOString(),
        })
      } catch (error) {
        if (!isAnkiNoteNotFoundError(error)) {
          throw error
        }
        nextMappings.delete(mapping.siyuanCardId)
        rebuiltMappingIndex.byCardId.delete(mapping.siyuanCardId)
        rebuiltMappingIndex.byBlockId.delete(mapping.siyuanBlockId)
        recreateItems.push(item)
      }
    }, (processed) => {
      completedItems = preview.deleted.length + processed
      reportProgress()
    })

    if (recreateItems.length > 0) {
      const recreatedNoteIds = await client.addNotes(recreateItems.map(item => ({
        deckName: item.targetDeckName || settings.deckName,
        modelName: item.noteType,
        fields: buildAnkiFields(item, settings),
        tags: ['siyuan', PRIMARY_PLUGIN_TAG, getCandidateTag(item.cardId)],
      })))

      recreateItems.forEach((item, index) => {
        const noteId = recreatedNoteIds[index]
        if (!noteId) {
          throw new Error(`重建 Anki 笔记失败，card ID: ${item.cardId}`)
        }
        const previousMapping = findMappingByCandidateFromIndex(item, rebuiltMappingIndex)
        nextMappings.set(item.cardId, {
          siyuanCardId: item.cardId,
          siyuanDeckId: item.deckId,
          siyuanBlockId: item.blockId,
          hPath: item.hPath,
          ankiNoteId: noteId,
          deckName: item.targetDeckName || settings.deckName,
          noteType: item.noteType,
          hash: item.hash,
          createdAt: previousMapping?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      })
    }
  }

  if (preview.added.length > 0) {
    const noteIds = await client.addNotes(preview.added.map(item => ({
      deckName: item.targetDeckName || settings.deckName,
      modelName: item.noteType,
      fields: buildAnkiFields(item, settings),
      tags: ['siyuan', PRIMARY_PLUGIN_TAG, getCandidateTag(item.cardId)],
    })))

    preview.added.forEach((item, index) => {
      const noteId = noteIds[index]
      if (!noteId) {
        throw new Error(`添加 Anki 笔记失败，card ID: ${item.cardId}`)
      }
      nextMappings.set(item.cardId, {
        siyuanCardId: item.cardId,
        siyuanDeckId: item.deckId,
        siyuanBlockId: item.blockId,
        hPath: item.hPath,
        ankiNoteId: noteId,
        deckName: item.targetDeckName || settings.deckName,
        noteType: item.noteType,
        hash: item.hash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    })
    completedItems = totalItems
    reportProgress()
  }

  invalidateSyncCaches(settings)

  return {
    mappings: [...nextMappings.values()],
    preview,
  }
}
