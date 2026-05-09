export type AnkiNoteInfo = {
  noteId: number
  tags: string[]
}

export type AnkiNoteFields = Record<string, string>

export type AnkiNoteInput = {
  deckName: string
  modelName: string
  fields: AnkiNoteFields
  tags?: string[]
}

type AnkiConnectResponse<T> = {
  result: T
  error: string | null
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '')
}

export function createAnkiClient(baseUrl: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  const request = async <T>(action: string, params: Record<string, unknown> = {}) => {
    const response = await fetch(normalizedBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        version: 6,
        params,
      }),
    })

    if (!response.ok) {
      throw new Error(`AnkiConnect 请求失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as AnkiConnectResponse<T>
    if (data.error) {
      throw new Error(data.error)
    }
    return data.result
  }

  return {
    ping: () => request<number>('version'),
    getDeckNames: () => request<string[]>('deckNames'),
    getModelNames: () => request<string[]>('modelNames'),
    modelFieldNames: (modelName: string) => request<string[]>('modelFieldNames', { modelName }),
    findNotes: (query: string) => request<number[]>('findNotes', { query }),
    notesInfo: (notes: number[]) => request<AnkiNoteInfo[]>('notesInfo', { notes }),
    addNotes: (notes: AnkiNoteInput[]) => request<Array<number | null>>('addNotes', { notes }),
    updateNoteFields: (note: { id: number, fields: AnkiNoteFields }) => request<null>('updateNoteFields', { note }),
    deleteNotes: (notes: number[]) => request<null>('deleteNotes', { notes }),
  }
}
