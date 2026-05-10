<template>
  <div class="siyuan-anki-linker-app-shell">
    <div class="siyuan-anki-linker-shell">
      <header class="hero">
        <div>
          <p class="eyebrow">SiYuan to Local Anki</p>
          <h1>siyuan-ankiLinker</h1>
          <p class="desc">绑定思源原生闪卡 cardID，通过本地 AnkiConnect 同步到已登录你服务器的 Anki 桌面端。</p>
        </div>
        <div class="hero-actions">
          <SyButton @click="detectConnection">检测本地连接</SyButton>
          <SyButton @click="refreshRemoteMeta">刷新卡组/模型</SyButton>
          <SyButton @click="saveSettings">保存配置</SyButton>
          <SyButton @click="closePanel">关闭面板</SyButton>
        </div>
      </header>

      <section class="panel-grid panel-grid--two">
        <article class="panel">
          <div class="panel-header">
            <h2>本地 AnkiConnect</h2>
            <SyButton @click="showAnkiConfig = !showAnkiConfig">{{ showAnkiConfig ? '收起' : '展开' }}</SyButton>
          </div>

          <div v-if="showAnkiConfig" class="compact-form">
            <label class="field-label">AnkiConnect 地址</label>
            <SyInput v-model="settings.ankiUrl" placeholder="http://127.0.0.1:8765" />

            <label class="field-label">默认目标卡组</label>
            <SySelect v-model="settings.deckName" :options="deckOptions" />

            <label class="field-label">问答卡模板</label>
            <SySelect v-model="settings.qaNoteType" :options="noteTypeOptions" />

            <label class="field-label">问答正面字段</label>
            <SySelect v-model="settings.qaFrontField" :options="qaFieldOptions" />

            <label class="field-label">问答背面字段</label>
            <SySelect v-model="settings.qaBackField" :options="qaFieldOptions" />

            <label class="field-label">填空卡模板</label>
            <SySelect v-model="settings.clozeNoteType" :options="noteTypeOptions" />

            <label class="field-label">填空正文字段</label>
            <SySelect v-model="settings.clozeTextField" :options="clozeFieldOptions" />

            <label class="field-label">填空补充字段</label>
            <SySelect v-model="settings.clozeExtraField" :options="clozeFieldOptions" />
          </div>

          <p class="meta">连接状态：{{ connectionStatus }}</p>
          <p class="meta">字段下拉读取自所选 Anki 模板，可避免手填字段名导致的 empty 错误。</p>
        </article>

        <article class="panel">
          <div class="panel-header">
            <h2>按文档路径分配卡组</h2>
            <div class="button-row">
              <SyButton @click="showPathRules = !showPathRules">{{ showPathRules ? '收起' : '展开' }}</SyButton>
              <SyButton @click="refreshPathOptions">刷新路径</SyButton>
            </div>
          </div>
          <p class="meta">同一路径前缀下的闪卡会自动同步到指定卡组；未匹配规则时使用“默认目标卡组”。</p>
          <div v-if="showPathRules" class="path-rule-section">
            <div class="path-rule-list path-rule-list--scrollable">
              <div v-for="(rule, index) in settings.pathDeckRules" :key="`rule-${index}`" class="path-rule-item path-rule-item--column">
                <div class="path-current-box">
                  <div class="path-current-label">当前路径</div>
                  <div class="path-current-value">{{ rule.path || '未选择' }}</div>
                </div>
                <div class="path-input-stack">
                  <SyInput
                    v-model="rulePathSearchStates[index].keyword"
                    placeholder="输入关键词过滤，或输入 / 逐级推进路径"
                    @input="onRulePathInput(index)"
                  />
                  <SySelect
                    :model-value="rulePathSearchStates[index].selectedPath"
                    :options="getRuleSearchOptions(index)"
                    @update:model-value="onRuleSearchSelect(index, $event)"
                  />
                </div>
                <div class="path-rule-actions">
                  <div class="button-row">
                    <SyButton @click="stepBackRulePath(index)">退一级</SyButton>
                    <SyButton @click="clearRulePath(index)">清空路径</SyButton>
                  </div>
                  <SySelect v-model="rule.deckName" :options="deckOptions" />
                  <SyButton @click="removePathRule(index)">删除</SyButton>
                </div>
              </div>
            </div>
            <div class="button-row">
              <SyButton @click="addPathRule">新增路径规则</SyButton>
            </div>
            <p class="meta">支持路径搜索与逐级选择，匹配规则按路径前缀生效。</p>
          </div>
        </article>
      </section>

      <section class="panel-grid panel-grid--two">
        <article class="panel">
          <h2>思源闪卡状态</h2>
          <p class="meta">当前版本优先读取思源原生 Riff API；若拿不到 cardID，则回退为基于制卡块的 block 级增量同步，不依赖复习进度。</p>
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value">{{ cachedCardCount }}</span>
              <span class="stat-label">可用闪卡</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ mappingCount }}</span>
              <span class="stat-label">已建立映射</span>
            </div>
          </div>
          <div class="button-row">
            <SyButton @click="refreshCardStats">刷新闪卡统计</SyButton>
            <SyButton @click="cleanupMappings">清理失效映射</SyButton>
            <SyButton @click="showDiagnostics = !showDiagnostics">{{ showDiagnostics ? '隐藏诊断' : '显示诊断' }}</SyButton>
          </div>
          <div v-if="showDiagnostics" class="diagnostic-box">
            <p class="meta">事件缓存：{{ diagnostics.cachedCount }} 张</p>
            <p class="meta">Riff API：{{ diagnostics.apiCount }} 张</p>
            <p class="meta">制卡块扫描：{{ diagnostics.blockScanCount }} 张</p>
            <p class="meta">当前映射：{{ diagnostics.recoveredMappings }} 条</p>
            <p class="meta">SQL 兜底：{{ diagnostics.sqlCount }} 张</p>
            <p class="meta">相关表：{{ diagnostics.tableNames.join(' / ') || '未发现' }}</p>
            <p class="meta">cards 表字段：{{ diagnostics.cardColumns.join(' / ') || '未发现' }}</p>
          </div>
        </article>

        <article class="panel">
          <h2>同步预览</h2>
          <div class="button-row">
            <SyButton @click="previewSync">生成同步预览</SyButton>
            <SyButton @click="syncToAnki">执行同步</SyButton>
          </div>
          <div class="stats-grid stats-grid--compact">
            <div class="stat-card"><span class="stat-value">{{ previewSummary.added }}</span><span class="stat-label">新增</span></div>
            <div class="stat-card"><span class="stat-value">{{ previewSummary.updated }}</span><span class="stat-label">更新</span></div>
            <div class="stat-card"><span class="stat-value">{{ previewSummary.deleted }}</span><span class="stat-label">删除</span></div>
            <div class="stat-card"><span class="stat-value">{{ previewSummary.invalid }}</span><span class="stat-label">无效</span></div>
          </div>
        </article>
      </section>

      <section class="panel-grid panel-grid--one">
        <article class="panel">
          <div class="log-header">
            <h2>预览详情</h2>
            <div class="button-row">
              <SyButton @click="showPreviewDetails = !showPreviewDetails">{{ showPreviewDetails ? '收起详情' : '展开详情' }}</SyButton>
            </div>
          </div>
          <ul v-if="showPreviewDetails" class="preview-list preview-list--scrollable">
            <li v-for="item in previewItems" :key="item.key">
              <strong>{{ item.type }}</strong>
              <span>{{ item.title }}</span>
            </li>
            <li v-if="previewItems.length === 0" class="meta">暂无预览数据</li>
          </ul>
        </article>
      </section>

      <section class="panel log-panel">
        <div class="log-header">
          <h2>同步日志</h2>
          <div class="button-row">
            <SyButton @click="showLogs = !showLogs">{{ showLogs ? '收起日志' : '展开日志' }}</SyButton>
            <SyButton @click="clearLogs">清空日志</SyButton>
          </div>
        </div>
        <ul v-if="showLogs" class="log-list">
          <li v-for="item in logs" :key="item.id">
            <span>{{ item.time }}</span>
            <span>{{ item.message }}</span>
          </li>
        </ul>
    </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import SyButton from '@/components/SiyuanTheme/SyButton.vue'
import SyInput from '@/components/SiyuanTheme/SyInput.vue'
import SySelect from '@/components/SiyuanTheme/SySelect.vue'
import { getHPathByPath, lsNotebooks, listDocsByPath } from '@/api'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { hidePanel, usePlugin } from '@/main'
import { createAnkiClient } from '@/utils/anki'
import { buildSyncPreview, cleanupInvalidMappings, getAvailableCards, getCardDiagnostics, runSync } from '@/utils/sync'
import type { AnkiLinkerMapping, AnkiLinkerSettings, PathDeckRule, SyncLogItem, SyncPreviewResult } from '@/types/plugin'

type LegacyPersistedState = {
  settings: AnkiLinkerSettings
  mappings: AnkiLinkerMapping[]
}

type SelectOption = {
  value: string
  text: string
}

type PathTreeNode = {
  name: string
  path: string
  children: PathTreeNode[]
}

type PathSearchState = {
  keyword: string
  selectedPath: string
  basePath: string
}

const PLUGIN_RUNTIME_KEY = '_sy_siyuan_ankiLinker'
const SETTINGS_STORAGE_KEY = 'settings.json'
const MAPPINGS_STORAGE_KEY = 'mappings.json'
const LEGACY_STORAGE_KEY = 'ankilinker-state.json'

const plugin = usePlugin()
const connectionStatus = ref('未检测')
const deckOptions = ref<SelectOption[]>([{ value: 'Default', text: 'Default' }])
const noteTypeOptions = ref<SelectOption[]>([{ value: 'Basic', text: 'Basic' }])
const qaFieldOptions = ref<SelectOption[]>([{ value: 'Front', text: 'Front' }, { value: 'Back', text: 'Back' }])
const clozeFieldOptions = ref<SelectOption[]>([{ value: 'Text', text: 'Text' }, { value: 'Extra', text: 'Extra' }])
const pathSearchOptions = ref<SelectOption[]>([])
const pathTreeRoots = ref<PathTreeNode[]>([])
const rulePathSearchStates = ref<PathSearchState[]>([])
const logs = ref<SyncLogItem[]>([])
const showLogs = ref(false)
const showDiagnostics = ref(false)
const showPreviewDetails = ref(false)
const showAnkiConfig = ref(true)
const showPathRules = ref(true)
const mappings = ref<AnkiLinkerMapping[]>([])
const previewResult = ref<SyncPreviewResult | null>(null)

const settings = reactive<AnkiLinkerSettings>({
  ankiUrl: 'http://127.0.0.1:8765',
  deckName: 'Default',
  pathDeckRules: [],
  qaNoteType: 'Basic',
  qaFrontField: 'Front',
  qaBackField: 'Back',
  clozeNoteType: 'Cloze',
  clozeTextField: 'Text',
  clozeExtraField: 'Extra',
})

const previewSummary = computed(() => previewResult.value?.summary || {
  added: 0,
  updated: 0,
  deleted: 0,
  unchanged: 0,
  invalid: 0,
})

const cachedCardCount = ref(0)
const diagnostics = reactive({
  cachedCount: 0,
  sqlCount: 0,
  apiCount: 0,
  recoveredMappings: 0,
  dueCount: 0,
  blockScanCount: 0,
  tableNames: [] as string[],
  cardColumns: [] as string[],
})
const mappingCount = computed(() => mappings.value.length)

const previewItems = computed(() => {
  if (!previewResult.value) {
    return []
  }

  return [
    ...previewResult.value.added.map(item => ({ key: `add-${item.cardId}`, type: item.kind === 'cloze' ? '新增填空' : '新增问答', title: `${item.cardId} -> ${item.hPath || item.blockId} -> ${item.targetDeckName || settings.deckName}` })),
    ...previewResult.value.updated.map(item => ({ key: `update-${item.cardId}`, type: item.kind === 'cloze' ? '更新填空' : '更新问答', title: `${item.cardId} -> ${item.hPath || item.blockId} -> ${item.targetDeckName || settings.deckName}` })),
    ...previewResult.value.deleted.map(item => ({ key: `delete-${item.siyuanCardId}`, type: '删除', title: `${item.siyuanCardId} -> ${item.hPath || item.siyuanBlockId} -> ${item.deckName}` })),
    ...previewResult.value.invalid.map(item => ({ key: `invalid-${item.cardId}`, type: '无效', title: `${item.cardId} -> ${item.hPath || item.blockId}（${item.validationMessage || '未识别为问答块、超级块问答或 ==填空=='}）` })),
  ]
})

const addLog = (message: string) => {
  logs.value.unshift({
    id: `${Date.now()}-${Math.random()}`,
    time: new Date().toLocaleString(),
    message,
  })
  if (logs.value.length > 100) {
    logs.value = logs.value.slice(0, 100)
  }
}

const clearLogs = () => {
  logs.value = []
}

function insertPathIntoTree(nodes: PathTreeNode[], path: string) {
  const parts = String(path || '').split('/').filter(Boolean)
  let currentNodes = nodes
  let currentPath = ''

  for (const part of parts) {
    currentPath += `/${part}`
    let node = currentNodes.find(item => item.name === part)
    if (!node) {
      node = { name: part, path: currentPath, children: [] }
      currentNodes.push(node)
      currentNodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    }
    currentNodes = node.children
  }
}

function syncRuleSearchStates() {
  rulePathSearchStates.value = settings.pathDeckRules.map((rule, index) => ({
    keyword: rulePathSearchStates.value[index]?.keyword || '',
    selectedPath: String(rule.path || ''),
    basePath: rulePathSearchStates.value[index]?.basePath || String(rule.path || ''),
  }))
}

function getChildOptionsByBasePath(basePath: string) {
  const normalizedBasePath = String(basePath || '').trim()
  const segments = normalizedBasePath.split('/').filter(Boolean)
  let currentNodes = pathTreeRoots.value

  for (const segment of segments) {
    const nextPath = `/${segments.slice(0, segments.indexOf(segment) + 1).join('/')}`
    const currentNode = currentNodes.find(node => node.path === nextPath)
    if (!currentNode) {
      return []
    }
    currentNodes = currentNode.children
  }

  return currentNodes
}

function getRuleSearchOptions(index: number) {
  const state = rulePathSearchStates.value[index]
  const keyword = String(state?.keyword || '').trim().toLowerCase()
  const basePath = String(state?.basePath || settings.pathDeckRules[index]?.path || '').trim()
  const currentLevelOptions = getChildOptionsByBasePath(basePath)

  const options = keyword
    ? currentLevelOptions.filter(item => item.name.toLowerCase().includes(keyword)).map(item => ({ value: item.path, text: `${item.name} · ${item.path}` }))
    : currentLevelOptions.map(item => ({ value: item.path, text: `${item.name} · ${item.path}` }))

  return [
    { value: '', text: options.length > 0 ? '请选择当前层级的下一级' : '当前层级没有更多子项' },
    ...options,
  ]
}

function onRulePathInput(index: number) {
  if (!rulePathSearchStates.value[index]) {
    rulePathSearchStates.value[index] = { keyword: '', selectedPath: '', basePath: '' }
  }

  const state = rulePathSearchStates.value[index]
  const rawInput = String(state.keyword || '')
  const pathParts = rawInput.split('/').map(item => item.trim())

  if (pathParts.length > 1) {
    const typedSegments = pathParts.slice(0, -1).filter(Boolean)
    for (const segment of typedSegments) {
      const currentOptions = getChildOptionsByBasePath(state.basePath)
      const matched = currentOptions.find(item => item.name === segment || item.name.includes(segment))
      if (!matched) {
        break
      }
      state.basePath = matched.path
      settings.pathDeckRules[index].path = matched.path
      state.selectedPath = matched.path
    }
    state.keyword = pathParts[pathParts.length - 1] || ''
    return
  }

  state.selectedPath = ''
}

function onRuleSearchSelect(index: number, selectedPath: string) {
  if (!rulePathSearchStates.value[index]) {
    rulePathSearchStates.value[index] = { keyword: '', selectedPath: '', basePath: '' }
  }
  rulePathSearchStates.value[index].selectedPath = selectedPath
  if (!selectedPath) {
    return
  }
  settings.pathDeckRules[index].path = selectedPath
  rulePathSearchStates.value[index].basePath = selectedPath
  rulePathSearchStates.value[index].keyword = ''
}

function stepBackRulePath(index: number) {
  const currentPath = String(settings.pathDeckRules[index]?.path || '').trim()
  const parts = currentPath.split('/').filter(Boolean)
  const nextPath = parts.length > 1 ? `/${parts.slice(0, -1).join('/')}` : ''
  settings.pathDeckRules[index].path = nextPath
  if (!rulePathSearchStates.value[index]) {
    rulePathSearchStates.value[index] = { keyword: '', selectedPath: '', basePath: '' }
  }
  rulePathSearchStates.value[index].basePath = nextPath
  rulePathSearchStates.value[index].selectedPath = ''
  rulePathSearchStates.value[index].keyword = ''
}

function clearRulePath(index: number) {
  settings.pathDeckRules[index].path = ''
  if (!rulePathSearchStates.value[index]) {
    rulePathSearchStates.value[index] = { keyword: '', selectedPath: '', basePath: '' }
  }
  rulePathSearchStates.value[index].basePath = ''
  rulePathSearchStates.value[index].selectedPath = ''
  rulePathSearchStates.value[index].keyword = ''
}

async function collectNotebookPaths(notebookId: string, currentPath: string, result: Set<string>) {
  const docs = await listDocsByPath(notebookId, currentPath)
  for (const doc of docs) {
    const docPath = String(doc.path || '').trim()
    const isDir = Boolean(doc.subFileCount && Number(doc.subFileCount) > 0)

    let hPath = String(doc.hPath || '').trim()
    if (!hPath && docPath) {
      hPath = String(await getHPathByPath(notebookId, docPath).catch(() => '') || '').trim()
    }
    if (!hPath && docPath.endsWith('.sy')) {
      hPath = `/${docPath.split('/').pop()?.replace(/\.sy$/i, '') || docPath}`
    }

    if (hPath) {
      result.add(hPath)
    }

    if (isDir && docPath) {
      await collectNotebookPaths(notebookId, docPath, result)
    }
  }
}

const refreshPathOptions = async () => {
  try {
    const notebooksPayload = await lsNotebooks()
    const notebooks = Array.isArray((notebooksPayload as any)?.notebooks) ? (notebooksPayload as any).notebooks : []
    const pathSet = new Set<string>()
    const nextTreeRoots: PathTreeNode[] = []

    for (const notebook of notebooks) {
      const notebookId = String(notebook.id || '').trim()
      if (!notebookId) {
        continue
      }
      await collectNotebookPaths(notebookId, '/', pathSet)
    }

    const sortedPaths = [...pathSet].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    pathSearchOptions.value = sortedPaths.map(path => ({ value: path, text: path }))

    for (const path of sortedPaths) {
      insertPathIntoTree(nextTreeRoots, path)
    }

    pathTreeRoots.value = nextTreeRoots

    settings.pathDeckRules.forEach(rule => {
      if (rule.path && !sortedPaths.includes(rule.path)) {
        rule.path = ''
      }
    })
    syncRuleSearchStates()

    addLog(`已读取思源文档路径：${sortedPaths.length} 项`)
  } catch (error) {
    addLog(`读取思源文档树失败：${String(error)}`)
  }
}

const addPathRule = () => {
  settings.pathDeckRules.push({ path: '', deckName: settings.deckName } satisfies PathDeckRule)
  rulePathSearchStates.value.push({ keyword: '', selectedPath: '', basePath: '' })
  showPathRules.value = true
}

const removePathRule = (index: number) => {
  settings.pathDeckRules.splice(index, 1)
  rulePathSearchStates.value.splice(index, 1)
}

const cleanupMappings = async () => {
  try {
    const result = await cleanupInvalidMappings(settings, mappings.value)
    mappings.value = result.mappings
    await persistState()
    addLog(`映射清理完成：移除 ${result.removedCount} 条，修复 ${result.repairedCount} 条，保留 ${result.mappings.length} 条`)
    await refreshCardStats()
  } catch (error) {
    addLog(`清理失效映射失败：${String(error)}`)
  }
}

const refreshCardStats = async () => {
  const available = await getAvailableCards()
  const detail = await getCardDiagnostics()
  cachedCardCount.value = available.length
  diagnostics.cachedCount = detail.cachedCount
  diagnostics.sqlCount = detail.sqlCount
  diagnostics.apiCount = detail.apiCount
  diagnostics.recoveredMappings = mappings.value.length
  diagnostics.dueCount = detail.dueCount
  diagnostics.blockScanCount = detail.blockScanCount
  diagnostics.tableNames = detail.tableNames
  diagnostics.cardColumns = detail.cardColumns
  addLog(`闪卡来源统计：Riff API ${detail.apiCount} 张，事件缓存 ${detail.cachedCount} 张，制卡块扫描 ${detail.blockScanCount} 张，可用闪卡 ${available.length} 张，当前映射 ${mappings.value.length} 条，SQL 兜底 ${detail.sqlCount} 张`)
}

const persistState = async () => {
  const settingsPayload: AnkiLinkerSettings = {
    ...settings,
    pathDeckRules: [...settings.pathDeckRules],
  }
  const mappingsPayload: AnkiLinkerMapping[] = [...mappings.value]

  await Promise.all([
    plugin.saveData(SETTINGS_STORAGE_KEY, settingsPayload),
    plugin.saveData(MAPPINGS_STORAGE_KEY, mappingsPayload),
  ])
}

const applyFieldOptions = (target: 'qa' | 'cloze', fields: string[]) => {
  const options = (fields.length > 0 ? fields : target === 'qa' ? ['Front', 'Back'] : ['Text', 'Extra']).map(item => ({ value: item, text: item }))
  if (target === 'qa') {
    qaFieldOptions.value = options
    if (!options.some(item => item.value === settings.qaFrontField)) {
      settings.qaFrontField = options[0].value
    }
    if (!options.some(item => item.value === settings.qaBackField)) {
      settings.qaBackField = options[Math.min(1, options.length - 1)].value
    }
    return
  }
  clozeFieldOptions.value = options
  if (!options.some(item => item.value === settings.clozeTextField)) {
    settings.clozeTextField = options[0].value
  }
  if (!options.some(item => item.value === settings.clozeExtraField)) {
    settings.clozeExtraField = options[Math.min(1, options.length - 1)].value
  }
}

const refreshModelFields = async () => {
  try {
    const client = createAnkiClient(settings.ankiUrl)
    const [qaFields, clozeFields] = await Promise.all([
      client.modelFieldNames(settings.qaNoteType),
      client.modelFieldNames(settings.clozeNoteType),
    ])
    applyFieldOptions('qa', qaFields)
    applyFieldOptions('cloze', clozeFields)
    addLog(`已读取模板字段：问答 ${settings.qaNoteType}(${qaFields.length})，填空 ${settings.clozeNoteType}(${clozeFields.length})`)
  } catch (error) {
    addLog(`读取模板字段失败：${String(error)}`)
  }
}

const loadState = async () => {
  try {
    const [settingsData, mappingsData] = await Promise.all([
      plugin.loadData(SETTINGS_STORAGE_KEY) as Promise<AnkiLinkerSettings | null>,
      plugin.loadData(MAPPINGS_STORAGE_KEY) as Promise<AnkiLinkerMapping[] | null>,
    ])

    if (settingsData) {
      Object.assign(settings, {
        ...settings,
        ...settingsData,
        pathDeckRules: settingsData.pathDeckRules || [],
      })
    }

    if (Array.isArray(mappingsData)) {
      mappings.value = mappingsData
    }

    if (!settingsData && !mappingsData) {
      const legacyData = await plugin.loadData(LEGACY_STORAGE_KEY) as LegacyPersistedState | null
      if (!legacyData) {
        return
      }

      Object.assign(settings, {
        ...settings,
        ...(legacyData.settings || {}),
        pathDeckRules: legacyData.settings?.pathDeckRules || [],
      })
      mappings.value = legacyData.mappings || []
      await persistState()
      addLog('已从旧版单文件存储迁移配置与映射数据')
    } else {
      addLog('已加载本地配置与映射数据')
    }

    syncRuleSearchStates()
  } catch (error) {
    addLog(`加载本地数据失败：${String(error)}`)
  }
}

const saveSettings = async () => {
  await persistState()
  addLog(`配置已保存：默认卡组 ${settings.deckName}；问答 ${settings.qaNoteType}[${settings.qaFrontField},${settings.qaBackField}]；填空 ${settings.clozeNoteType}[${settings.clozeTextField},${settings.clozeExtraField}]；路径规则 ${settings.pathDeckRules.length} 条`)
}

const closePanel = () => {
  hidePanel()
}

const detectConnection = async () => {
  try {
    const client = createAnkiClient(settings.ankiUrl)
    const version = await client.ping()
    connectionStatus.value = `AnkiConnect 可用（API v${version}）`
    addLog(`本地 AnkiConnect 连接成功，API 版本：${version}`)
  } catch (error) {
    connectionStatus.value = '连接失败'
    addLog(`本地连接失败：${String(error)}`)
  }
}

const refreshRemoteMeta = async () => {
  try {
    const client = createAnkiClient(settings.ankiUrl)
    const [decks, models] = await Promise.all([
      client.getDeckNames(),
      client.getModelNames(),
    ])

    deckOptions.value = decks.length > 0 ? decks.map(item => ({ value: item, text: item })) : [{ value: 'Default', text: 'Default' }]
    noteTypeOptions.value = models.length > 0 ? models.map(item => ({ value: item, text: item })) : [{ value: 'Basic', text: 'Basic' }]

    if (!decks.includes(settings.deckName)) {
      settings.deckName = deckOptions.value[0].value
    }
    settings.pathDeckRules.forEach(rule => {
      if (!decks.includes(rule.deckName)) {
        rule.deckName = settings.deckName
      }
    })
    if (!models.includes(settings.qaNoteType)) {
      settings.qaNoteType = noteTypeOptions.value[0].value
    }
    if (!models.includes(settings.clozeNoteType)) {
      settings.clozeNoteType = models.includes('Cloze') ? 'Cloze' : noteTypeOptions.value[0].value
    }

    await refreshModelFields()
    await persistState()
    addLog(`已读取本地 Anki 元数据：${decks.length} 个卡组，${models.length} 个笔记类型`)
  } catch (error) {
    addLog(`刷新卡组/模型失败：${String(error)}`)
  }
}

const previewSync = async () => {
  try {
    await refreshCardStats()
    previewResult.value = await buildSyncPreview(settings, mappings.value)
    showPreviewDetails.value = true
    addLog(`同步预览完成：新增 ${previewSummary.value.added}，更新 ${previewSummary.value.updated}，删除 ${previewSummary.value.deleted}，无效 ${previewSummary.value.invalid}`)
  } catch (error) {
    addLog(`生成同步预览失败：${String(error)}`)
  }
}

const syncToAnki = async () => {
  try {
    const result = await runSync(settings, mappings.value)
    mappings.value = result.mappings
    previewResult.value = result.preview
    showPreviewDetails.value = true
    await persistState()
    addLog(`同步完成：新增 ${result.preview.summary.added}，更新 ${result.preview.summary.updated}，删除 ${result.preview.summary.deleted}`)
    addLog('若需同步到你的远端服务器，请回到 Anki 桌面端执行正常同步。')
  } catch (error) {
    addLog(`执行同步失败：${String(error)}`)
  }
}

watch(() => settings.qaNoteType, async () => { await refreshModelFields() })
watch(() => settings.clozeNoteType, async () => { await refreshModelFields() })

onMounted(async () => {
  window[PLUGIN_RUNTIME_KEY] = { closePanel }
  await loadState()
  await refreshCardStats()
  await refreshRemoteMeta()
  await refreshPathOptions()
})
</script>

<style lang="scss">
.siyuan-anki-linker-app-shell {
  width: 100%;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  padding: 16px 0;
}

.siyuan-anki-linker-shell {
  width: min(1100px, calc(100vw - 32px));
  min-height: min-content;
  margin: 0 auto;
  pointer-events: auto;
  color: var(--b3-theme-on-surface);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero,
.panel {
  border: 1px solid var(--b3-border-color);
  background: color-mix(in srgb, var(--b3-theme-surface) 92%, var(--b3-theme-primary) 8%);
  border-radius: 16px;
  padding: 16px;
}

.hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.hero h1,
.panel h2,
.eyebrow,
.desc,
.meta,
.field-label {
  margin: 0;
}

.eyebrow {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--b3-theme-primary);
}

.desc,
.meta {
  color: var(--b3-theme-on-surface-light);
}

.field-label {
  font-size: 13px;
  color: var(--b3-theme-on-surface-light);
}

.hero-actions,
.button-row,
.path-rule-item,
.panel-header,
.path-rule-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.panel-header {
  justify-content: space-between;
  align-items: center;
}

.compact-form,
.panel,
.path-rule-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-grid {
  display: grid;
  gap: 16px;
}

.panel-grid--one {
  grid-template-columns: 1fr;
}

.panel-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.stats-grid--compact {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  background: var(--b3-theme-background);
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
}

.stat-label {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.preview-list,
.log-list,
.path-rule-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-list li,
.log-panel li,
.path-rule-item {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--b3-theme-background);
}

.path-rule-item--column {
  align-items: stretch;
}

.path-current-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--b3-theme-background) 88%, var(--b3-theme-primary) 12%);
}

.path-current-label {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.path-current-value {
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}

.path-input-stack {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.path-picker-grid {
  display: none;
}

.path-search-row {
  display: none;
}

.path-rule-actions {
  align-items: center;
  justify-content: space-between;
}

.preview-list li,
.log-panel li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.preview-list--scrollable,
.log-list {
  max-height: 320px;
  overflow-y: auto;
}

.path-rule-list--scrollable {
  max-height: 260px;
  overflow-y: auto;
  padding-right: 4px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.diagnostic-box {
  padding: 12px;
  border-radius: 12px;
  background: var(--b3-theme-background);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@media (max-width: 900px) {
  .panel-grid--two {
    grid-template-columns: 1fr;
  }

  .stats-grid,
  .stats-grid--compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .siyuan-anki-linker-shell {
    width: calc(100vw - 20px);
  }

  .log-header,
  .hero,
  .preview-list li,
  .log-panel li,
  .path-rule-item,
  .panel-header,
  .path-rule-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .path-rule-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
