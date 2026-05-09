import { getBlockAttrs, getBlockKramdown, getChildBlocks, getHPathByID, getRiffCards, getRiffDueCards, sql } from '@/api'
import { createAnkiClient } from '@/utils/anki'
import type {
  AnkiLinkerMapping,
  AnkiLinkerSettings,
  FlashcardCandidate,
  FlashcardKind,
  FlashcardPreview,
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

const DEFAULT_SEPARATOR_PATTERN = /^-{3,}$|^\*{3,}$/m
const KRAMDOWN_BLOCK_IAL_LINE_PATTERN = /^\{:\s+[^\n]*?\bid="[^"]+"[^\n]*\}\s*$/gm
const KRAMDOWN_INLINE_IAL_PATTERN = /\s*\{:\s+[^\n{}]*\bid="[^"]+"[^\n{}]*\}/g
const SIYUAN_LAYOUT_CONTAINER_OPEN_LINE_PATTERN = /^\s*\{\{\{[a-zA-Z][^\n]*$/gm
const SIYUAN_LAYOUT_CONTAINER_CLOSE_LINE_PATTERN = /^\s*\}\}\}\s*$/gm
const CLOZE_PATTERN = /==(.+?)==/g
const FLASHCARD_BLOCK_IAL_PATTERN = "%custom-riff-decks%"
const LEGACY_FLASHCARD_BLOCK_IAL_PATTERN = "%custom-fsrs-flashcard%"

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

function buildClozeText(markdown: string) {
  const sanitizedMarkdown = sanitizeSiyuanMarkdown(markdown)
  let index = 0
  const text = sanitizedMarkdown.replace(CLOZE_PATTERN, (_, content: string) => {
    index += 1
    return `{{c${index}::${content.trim()}}}`
  }).trim()

  return {
    text,
    count: index,
  }
}

function buildClozePreview(markdown: string): FlashcardPreview | null {
  const sanitizedMarkdown = sanitizeSiyuanMarkdown(markdown)
  const cloze = buildClozeText(sanitizedMarkdown)
  if (cloze.count === 0 || !cloze.text) {
    return null
  }

  const front = sanitizedMarkdown.replace(CLOZE_PATTERN, '_____').trim()
  const back = sanitizedMarkdown.replace(CLOZE_PATTERN, '$1').trim()
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

async function parseFlashcardCandidate(card: ICard, rawMarkdown: string): Promise<{
  preview: FlashcardPreview | null
  kind: FlashcardKind
  clozeText: string
}> {
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
  return window._sy_ankilinker?.cards || []
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

export async function getSqlCards(): Promise<ICard[]> {
  try {
    const rows = await sql('select id as cardID, block_id as blockID, deck_id as deckID from cards')
    return (rows || []).map((row: Record<string, any>) => {
      const blockID = String(row.blockID || row.blockid || row.block_id || '')
      const rawCardID = String(row.cardID || row.cardid || row.id || '')
      return {
        cardID: normalizeCardIdentity(rawCardID, blockID),
        blockID,
        deckID: String(row.deckID || row.deckid || row.deck_id || ''),
      }
    }).filter((item: ICard) => item.blockID)
  } catch {
    return []
  }
}

export async function scanFlashcardBlocks(): Promise<ICard[]> {
  try {
    const rows = await sql(`
      select id as blockID
      from blocks
      where ial like '${FLASHCARD_BLOCK_IAL_PATTERN}'
         or ial like '${LEGACY_FLASHCARD_BLOCK_IAL_PATTERN}'
      order by updated desc
    `)

    return (rows || []).map((row: Record<string, any>) => {
      const blockID = String(row.blockID || row.blockid || row.id || '').trim()
      if (!blockID) {
        return null
      }
      return {
        cardID: toSyntheticCardId(blockID),
        blockID,
        deckID: '',
      }
    }).filter((item: ICard | null): item is ICard => Boolean(item))
  } catch {
    return []
  }
}

export async function getCardDiagnostics(): Promise<CardDiagnostics> {
  const cachedCount = getCachedCards().length
  const apiCards = await getApiCards()
  const dueCards = await getApiDueCards()
  const blockScannedCards = await scanFlashcardBlocks()

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

  const sqlCards = await getSqlCards()

  return {
    cachedCount,
    sqlCount: sqlCards.length,
    apiCount: apiCards.length,
    dueCount: dueCards.length,
    blockScanCount: blockScannedCards.length,
    tableNames,
    cardColumns,
  }
}

export async function getAvailableCards(): Promise<ICard[]> {
  const cached = getCachedCards()
  if (cached.length > 0) {
    return cached.map(item => ({
      ...item,
      cardID: normalizeCardIdentity(String(item.cardID || ''), String(item.blockID || '')),
    }))
  }

  const apiCards = await getApiCards()
  if (apiCards.length > 0) {
    return apiCards
  }

  const blockScannedCards = await scanFlashcardBlocks()
  if (blockScannedCards.length > 0) {
    return blockScannedCards
  }

  return await getSqlCards()
}

export async function getDueAvailableCards(): Promise<ICard[]> {
  const apiDueCards = await getApiDueCards()
  if (apiDueCards.length > 0) {
    return apiDueCards
  }

  return await getAvailableCards()
}

function getCandidateTag(cardId: string) {
  return `siyuan-card:${cardId}`
}

async function hydrateMappingsFromAnki(
  settings: AnkiLinkerSettings,
  candidates: FlashcardCandidate[],
  mappings: AnkiLinkerMapping[],
): Promise<AnkiLinkerMapping[]> {
  const unresolvedCandidates = candidates.filter(candidate => !mappings.some(mapping => mapping.siyuanCardId === candidate.cardId))
  if (unresolvedCandidates.length === 0) {
    return mappings
  }

  try {
    const client = createAnkiClient(settings.ankiUrl)
    const noteIds = await client.findNotes('tag:ankilinker')
    if (noteIds.length === 0) {
      return mappings
    }

    const notes = await client.notesInfo(noteIds)
    const mappingByTag = new Map<string, number>()
    for (const note of notes) {
      for (const tag of note.tags || []) {
        if (typeof tag === 'string' && tag.startsWith('siyuan-card:')) {
          mappingByTag.set(tag, note.noteId)
        }
      }
    }

    const recoveredMappings: AnkiLinkerMapping[] = [...mappings]
    const knownCardIds = new Set(mappings.map(item => item.siyuanCardId))
    for (const candidate of unresolvedCandidates) {
      const noteId = mappingByTag.get(getCandidateTag(candidate.cardId))
      if (!noteId || knownCardIds.has(candidate.cardId)) {
        continue
      }
      recoveredMappings.push({
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
      })
      knownCardIds.add(candidate.cardId)
    }

    return recoveredMappings
  } catch {
    return mappings
  }
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildAnkiFields(candidate: FlashcardCandidate, settings: AnkiLinkerSettings) {
  if (candidate.kind === 'cloze') {
    return {
      [settings.clozeTextField]: escapeHtml(String(candidate.clozeText || candidate.rawMarkdown || '').trim()),
      [settings.clozeExtraField]: escapeHtml(String(candidate.back || '').trim()),
    }
  }

  return {
    [settings.qaFrontField]: escapeHtml(String(candidate.front || '').trim()),
    [settings.qaBackField]: escapeHtml(String(candidate.back || '').trim()),
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

    const rawMarkdown = sanitizeSiyuanMarkdown((kramdown?.kramdown || '').trim())
    const parsed = await parseFlashcardCandidate(card, rawMarkdown)
    const targetDeckName = settings ? resolveDeckNameByPath(String(hPath || ''), settings) : ''

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
      hash: createHashValue(`${parsed.kind}:${parsed.clozeText || rawMarkdown}:${targetDeckName}`),
      identityKind: String(card.cardID || '').startsWith('block:') ? 'block' : 'card',
      kind: parsed.kind,
      noteType: parsed.kind === 'cloze' ? (settings?.clozeNoteType || 'Cloze') : (settings?.qaNoteType || 'Basic'),
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

export async function buildSyncPreview(
  settings: AnkiLinkerSettings,
  mappings: AnkiLinkerMapping[],
): Promise<SyncPreviewResult> {
  const cards = await getAvailableCards()
  const candidates = await collectFlashcardCandidates(cards, settings)
  const hydratedMappings = await hydrateMappingsFromAnki(settings, candidates, mappings)
  const candidateMap = new Map(candidates.map(item => [item.cardId, item]))
  const mappingMap = new Map(hydratedMappings.map(item => [item.siyuanCardId, item]))

  const added: FlashcardCandidate[] = []
  const updated: FlashcardCandidate[] = []
  const unchanged: FlashcardCandidate[] = []
  const invalid: FlashcardCandidate[] = []
  const deleted = hydratedMappings.filter(item => !candidateMap.has(item.siyuanCardId))

  for (const candidate of candidates) {
    if (!candidate.isValid) {
      invalid.push(candidate)
      continue
    }

    const mapping = mappingMap.get(candidate.cardId)
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

  const client = createAnkiClient(settings.ankiUrl)
  const noteIds = await client.findNotes('tag:ankilinker')
  if (noteIds.length === 0) {
    return {
      mappings: [],
      removedCount: mappings.length,
      repairedCount: 0,
    }
  }

  const notes = await client.notesInfo(noteIds)
  const existingNoteIds = new Set<number>()
  const noteIdByCardTag = new Map<string, number>()

  for (const note of notes) {
    existingNoteIds.add(note.noteId)
    for (const tag of note.tags || []) {
      if (typeof tag === 'string' && tag.startsWith('siyuan-card:')) {
        noteIdByCardTag.set(tag, note.noteId)
      }
    }
  }

  let removedCount = 0
  let repairedCount = 0
  const nextMappings: AnkiLinkerMapping[] = []

  for (const mapping of mappings) {
    if (existingNoteIds.has(mapping.ankiNoteId)) {
      nextMappings.push(mapping)
      continue
    }

    const repairedNoteId = noteIdByCardTag.get(getCandidateTag(mapping.siyuanCardId))
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

export async function runSync(
  settings: AnkiLinkerSettings,
  mappings: AnkiLinkerMapping[],
): Promise<{
  mappings: AnkiLinkerMapping[]
  preview: SyncPreviewResult
}> {
  const preview = await buildSyncPreview(settings, mappings)
  const client = createAnkiClient(settings.ankiUrl)
  const rebuiltMappings = await hydrateMappingsFromAnki(settings, [...preview.added, ...preview.updated, ...preview.unchanged, ...preview.invalid], mappings)
  const mappingByCardId = new Map(rebuiltMappings.map(item => [item.siyuanCardId, item]))
  const nextMappings = new Map(rebuiltMappings.map(item => [item.siyuanCardId, item]))

  if (preview.deleted.length > 0) {
    const deleteIds = preview.deleted.map(item => item.ankiNoteId)
    await client.deleteNotes(deleteIds)
    for (const item of preview.deleted) {
      nextMappings.delete(item.siyuanCardId)
    }
  }

  if (preview.updated.length > 0) {
    const recreateItems: FlashcardCandidate[] = []

    await Promise.all(preview.updated.map(async (item) => {
      const mapping = mappingByCardId.get(item.cardId)
      if (!mapping) {
        recreateItems.push(item)
        return
      }

      try {
        await client.updateNoteFields({
          id: mapping.ankiNoteId,
          fields: buildAnkiFields(item, settings),
        })
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
        nextMappings.delete(item.cardId)
        recreateItems.push(item)
      }
    }))

    if (recreateItems.length > 0) {
      const recreatedNoteIds = await client.addNotes(recreateItems.map(item => ({
        deckName: item.targetDeckName || settings.deckName,
        modelName: item.noteType,
        fields: buildAnkiFields(item, settings),
        tags: ['siyuan', 'ankilinker', getCandidateTag(item.cardId)],
      })))

      recreateItems.forEach((item, index) => {
        const noteId = recreatedNoteIds[index]
        if (!noteId) {
          throw new Error(`重建 Anki 笔记失败，card ID: ${item.cardId}`)
        }
        const previousMapping = mappingByCardId.get(item.cardId)
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
      tags: ['siyuan', 'ankilinker', getCandidateTag(item.cardId)],
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
  }

  return {
    mappings: [...nextMappings.values()],
    preview,
  }
}
