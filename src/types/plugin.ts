export type PathDeckRule = {
  path: string
  deckName: string
}

export type AnkiLinkerSettings = {
  ankiUrl: string
  deckName: string
  pathDeckRules: PathDeckRule[]
  qaNoteType: string
  qaFrontField: string
  qaBackField: string
  clozeNoteType: string
  clozeTextField: string
  clozeExtraField: string
}

export type SyncTaskPreview = {
  added: number
  updated: number
  deleted: number
}

export type SyncLogItem = {
  id: string
  time: string
  message: string
}

export type FlashcardKind = 'qa' | 'cloze'

export type FlashcardPreview = {
  front: string
  back: string
}

export type FlashcardCandidate = FlashcardPreview & {
  cardId: string
  deckId: string
  blockId: string
  rootId?: string
  hPath?: string
  targetDeckName?: string
  rawMarkdown: string
  attrs: Record<string, string>
  isValid: boolean
  hash: string
  identityKind?: 'card' | 'block'
  kind: FlashcardKind
  noteType: string
  clozeText?: string
  validationMessage?: string
}

export type AnkiLinkerMapping = {
  siyuanCardId: string
  siyuanDeckId: string
  siyuanBlockId: string
  hPath?: string
  ankiNoteId: number
  deckName: string
  noteType: string
  hash: string
  createdAt: string
  updatedAt: string
}

export type SyncPreviewResult = {
  added: FlashcardCandidate[]
  updated: FlashcardCandidate[]
  deleted: AnkiLinkerMapping[]
  unchanged: FlashcardCandidate[]
  invalid: FlashcardCandidate[]
  summary: {
    added: number
    updated: number
    deleted: number
    unchanged: number
    invalid: number
  }
}
