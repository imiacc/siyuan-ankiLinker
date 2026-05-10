<template>
  <div class="siyuan-anki-linker-app-shell">
    <div class="siyuan-anki-linker-shell">
      <header class="hero hero--top-actions-right">
        <div>
          <p class="eyebrow">{{ locale.heroEyebrow }}</p>
          <h1>{{ locale.panelTitle }}</h1>
          <p class="desc">{{ locale.panelSubtitle }}</p>
        </div>
        <div class="hero-actions hero-actions--stacked">
          <div class="button-row hero-actions__row">
            <SyButton @click="detectConnection">{{ locale.detectConnection }}</SyButton>
            <SyButton @click="refreshRemoteMeta">{{ locale.refreshRemoteMeta }}</SyButton>
            <SyButton @click="exportSettings">{{ locale.exportSettings }}</SyButton>
            <SyButton @click="triggerImportSettings">{{ locale.importSettings }}</SyButton>
            <SyButton @click="saveSettings">{{ locale.saveSettings }}</SyButton>
            <SyButton @click="closePanel">{{ locale.closePanel }}</SyButton>
          </div>
          <input
            ref="importInputRef"
            class="fn__none"
            type="file"
            accept="application/json,.json"
            @change="importSettingsFromFile"
          >
        </div>
      </header>

      <section class="panel-grid panel-grid--two">
        <article class="panel">
          <div class="panel-header">
            <h2>{{ locale.localAnkiConnect }}</h2>
            <SyButton
              class="icon-button"
              :title="showAnkiConfig ? locale.collapse : locale.expand"
              @click="showAnkiConfig = !showAnkiConfig"
            >
              {{ showAnkiConfig ? '●' : '▸' }}
            </SyButton>
          </div>

          <div v-if="showAnkiConfig" class="compact-form">
            <label class="field-label">{{ locale.ankiConnectUrl }}</label>
            <SyInput v-model="settings.ankiUrl" placeholder="http://127.0.0.1:8765" />

            <label class="field-label">{{ locale.defaultDeck }}</label>
            <SySelect v-model="settings.deckName" :options="deckOptions" />

            <label class="field-label">{{ locale.qaNoteType }}</label>
            <SySelect v-model="settings.qaNoteType" :options="noteTypeOptions" />

            <label class="field-label">{{ locale.qaFrontField }}</label>
            <SySelect v-model="settings.qaFrontField" :options="qaFieldOptions" />

            <label class="field-label">{{ locale.qaBackField }}</label>
            <SySelect v-model="settings.qaBackField" :options="qaFieldOptions" />

            <label class="field-label">{{ locale.clozeNoteType }}</label>
            <SySelect v-model="settings.clozeNoteType" :options="noteTypeOptions" />

            <label class="field-label">{{ locale.clozeTextField }}</label>
            <SySelect v-model="settings.clozeTextField" :options="clozeFieldOptions" />

            <label class="field-label">{{ locale.clozeExtraField }}</label>
            <SySelect v-model="settings.clozeExtraField" :options="clozeFieldOptions" />
          </div>

          <p class="meta">{{ locale.connectionStatus }}：{{ connectionStatus }}</p>
          <p class="meta">{{ locale.fieldHint }}</p>
        </article>

        <article class="panel">
          <div class="panel-header">
            <h2>{{ locale.pathDeckRouting }}</h2>
            <div class="button-row button-row--compact">
              <SyButton
                class="icon-button"
                :title="showPathRules ? locale.collapse : locale.expand"
                @click="showPathRules = !showPathRules"
              >
                {{ showPathRules ? '●' : '▸' }}
              </SyButton>
              <SyButton class="icon-button" :title="locale.refreshPath" @click="refreshPathOptions">↻</SyButton>
            </div>
          </div>
          <p class="meta">{{ locale.pathRuleHint }}</p>
          <div v-if="showPathRules" class="path-rule-section">
            <div class="path-rule-list path-rule-list--scrollable">
              <div v-for="(rule, index) in settings.pathDeckRules" :key="`rule-${index}`" class="path-rule-item path-rule-item--column">
                <template v-if="!ruleEditStates[index]">
                  <div class="path-rule-summary-row">
                    <div class="path-rule-summary-cell path-rule-summary-cell--path" :title="rule.path || locale.notSelected">
                      {{ rule.path || locale.notSelected }}
                    </div>
                    <div class="path-rule-summary-arrow">-&gt;</div>
                    <div class="path-rule-summary-cell path-rule-summary-cell--deck" :title="rule.deckName || settings.deckName">
                      {{ rule.deckName || settings.deckName }}
                    </div>
                    <div class="path-rule-summary-actions">
                      <SyButton class="path-rule-action-button" type="button" @click="startEditPathRule(index)">{{ locale.edit }}</SyButton>
                      <SyButton class="path-rule-action-button" type="button" @click="removePathRule(index)">{{ locale.remove }}</SyButton>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="path-current-box">
                    <div class="path-current-label">{{ locale.currentPath }}</div>
                    <div class="path-current-value">{{ rule.path || locale.notSelected }}</div>
                  </div>
                  <div class="path-input-stack">
                    <SyInput
                      v-model="rulePathSearchStates[index].keyword"
                      :placeholder="locale.pathSearchPlaceholder"
                      @input="onRulePathInput(index)"
                    />
                    <SySelect
                      :model-value="rulePathSearchStates[index].selectedPath"
                      :options="getRuleSearchOptions(index)"
                      @update:model-value="onRuleSearchSelect(index, $event)"
                    />
                  </div>
                  <div class="path-rule-actions">
                    <div class="button-row button-row--compact button-row--nowrap">
                      <SyButton class="icon-button" :title="locale.stepBack" @click="stepBackRulePath(index)">↑</SyButton>
                      <SyButton class="icon-button" :title="locale.clearPath" @click="clearRulePath(index)">↺</SyButton>
                    </div>
                    <SySelect v-model="rule.deckName" :options="deckOptions" />
                    <div class="button-row button-row--compact button-row--nowrap button-row--align-end">
                      <SyButton class="icon-button" :title="locale.done" @click="finishEditPathRule(index)">✓</SyButton>
                      <SyButton class="icon-button" :title="locale.remove" @click="removePathRule(index)">🗑</SyButton>
                    </div>
                  </div>
                </template>
              </div>
            </div>
            <div class="button-row button-row--compact">
              <SyButton class="icon-button" :title="locale.addPathRule" @click="addPathRule">＋</SyButton>
            </div>
            <p class="meta">{{ locale.pathRuleFooter }}</p>
          </div>
        </article>
      </section>

      <section class="panel-grid panel-grid--two">
        <article class="panel">
          <div class="panel-header panel-header--section-actions">
            <h2>{{ locale.flashcardStatus }}</h2>
            <div class="button-row button-row--compact button-row--nowrap">
              <SyButton class="icon-button" :title="locale.refreshCardStats" @click="refreshCardStats">↻</SyButton>
              <SyButton class="icon-button" :title="locale.cleanupMappings" @click="cleanupMappings">⌫</SyButton>
              <SyButton class="icon-button" :title="showDiagnostics ? locale.hideDiagnostics : locale.showDiagnostics" @click="showDiagnostics = !showDiagnostics">{{ showDiagnostics ? '●' : '▸' }}</SyButton>
            </div>
          </div>
          <p class="meta">{{ locale.flashcardStatusHint }}</p>
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value">{{ cachedCardCount }}</span>
              <span class="stat-label">{{ locale.availableFlashcards }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ mappingCount }}</span>
              <span class="stat-label">{{ locale.existingMappings }}</span>
            </div>
          </div>
          <div v-if="showDiagnostics" class="diagnostic-box">
            <p class="meta">{{ locale.cachedEvents }}：{{ diagnostics.cachedCount }} {{ locale.cardUnit }}</p>
            <p class="meta">Riff API：{{ diagnostics.apiCount }} {{ locale.cardUnit }}</p>
            <p class="meta">{{ locale.blockScan }}：{{ diagnostics.blockScanCount }} {{ locale.cardUnit }}</p>
            <p class="meta">{{ locale.currentMappings }}：{{ diagnostics.recoveredMappings }} {{ locale.mappingUnit }}</p>
            <p class="meta">SQL {{ locale.fallback }}：{{ diagnostics.sqlCount }} {{ locale.cardUnit }}</p>
            <p class="meta">{{ locale.relatedTables }}：{{ diagnostics.tableNames.join(' / ') || locale.notFound }}</p>
            <p class="meta">cards {{ locale.tableColumns }}：{{ diagnostics.cardColumns.join(' / ') || locale.notFound }}</p>

            <div class="diagnostic-subsection">
              <div class="log-header">
                <h3>{{ locale.deletionDiagnostics }}</h3>
                <div class="button-row button-row--compact">
                  <SyButton class="icon-button" :title="locale.refreshDeletionDiagnostics" @click="refreshDeletionDiagnostics">↻</SyButton>
                </div>
              </div>
              <p class="meta">{{ locale.deletionAllowed }}：{{ deletionDiagnostics?.allowDeletion ? 'Yes' : 'No' }}</p>
              <p class="meta">{{ locale.matchedMappings }}：{{ deletionDiagnostics?.matchedCount ?? 0 }} {{ locale.mappingUnit }}</p>
              <p class="meta">{{ locale.orphanMappings }}：{{ deletionDiagnostics?.orphanCount ?? 0 }} {{ locale.mappingUnit }}</p>
              <div class="diagnostic-filter-row">
                <label class="diagnostic-toggle">
                  <input v-model="deletionDiagnosticsFilter.onlyOrphans" type="checkbox">
                  <span>{{ locale.onlyOrphans }}</span>
                </label>
                <div class="diagnostic-filter-inputs">
                  <SyInput v-model="deletionDiagnosticsFilter.blockIdKeyword" :placeholder="locale.blockIdFilterPlaceholder" />
                  <SyButton class="icon-button" type="button" :title="locale.clearFilter" @click="clearDeletionDiagnosticsFilter">⌫</SyButton>
                </div>
              </div>
              <ul class="diagnostic-list diagnostic-list--scrollable">
                <li v-for="item in deletionDiagnosticItems" :key="item.key" class="diagnostic-item" :class="{ 'diagnostic-item--orphan': !item.matched }">
                  <div class="diagnostic-item__main">
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.subtitle }}</span>
                  </div>
                  <div class="diagnostic-item__side">
                    <span>{{ locale.matchReason }}：{{ item.matchLabel }}</span>
                    <span>{{ locale.matchedCandidate }}：{{ item.matchedCandidate }}</span>
                  </div>
                </li>
                <li v-if="deletionDiagnosticItems.length === 0" class="meta">{{ locale.noDeletionDiagnostics }}</li>
              </ul>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-header panel-header--section-actions">
            <h2>{{ locale.syncPreview }}</h2>
            <div class="button-row button-row--compact button-row--nowrap">
              <SyButton class="icon-button" :title="locale.generatePreview" @click="previewSync">⌕</SyButton>
              <SyButton class="icon-button" :title="locale.runSync" @click="syncToAnki">⇄</SyButton>
            </div>
          </div>
          <div class="stats-grid stats-grid--compact">
            <div class="stat-card"><span class="stat-value">{{ previewSummary.added }}</span><span class="stat-label">{{ locale.added }}</span></div>
            <div class="stat-card"><span class="stat-value">{{ previewSummary.updated }}</span><span class="stat-label">{{ locale.updated }}</span></div>
            <div class="stat-card"><span class="stat-value">{{ previewSummary.deleted }}</span><span class="stat-label">{{ locale.deleted }}</span></div>
            <div class="stat-card"><span class="stat-value">{{ previewSummary.invalid }}</span><span class="stat-label">{{ locale.invalid }}</span></div>
          </div>
        </article>
      </section>

      <section class="panel-grid panel-grid--one">
        <article class="panel">
          <div class="log-header">
            <h2>{{ locale.previewDetails }}</h2>
            <div class="button-row button-row--compact">
              <SyButton class="icon-button" :title="showPreviewDetails ? locale.collapseDetails : locale.expandDetails" @click="showPreviewDetails = !showPreviewDetails">{{ showPreviewDetails ? '●' : '▸' }}</SyButton>
            </div>
          </div>
          <ul v-if="showPreviewDetails" class="preview-list preview-list--scrollable">
            <li v-for="item in previewItems" :key="item.key">
              <strong>{{ item.type }}</strong>
              <span>{{ item.title }}</span>
            </li>
            <li v-if="previewItems.length === 0" class="meta">{{ locale.noPreviewData }}</li>
          </ul>
        </article>
      </section>

      <section class="panel log-panel">
        <div class="log-header">
          <h2>{{ locale.syncLogs }}</h2>
          <div class="button-row button-row--compact">
            <SyButton class="icon-button" :title="showLogs ? locale.collapseLogs : locale.expandLogs" @click="showLogs = !showLogs">{{ showLogs ? '●' : '▸' }}</SyButton>
            <SyButton class="icon-button" :title="locale.clearLogs" @click="clearLogs">⌫</SyButton>
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
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { hidePanel, usePlugin } from '@/main'
import { createAnkiClient } from '@/utils/anki'
import { buildDeletionDiagnostics, buildSyncPreview, cleanupInvalidMappings, getAvailableCards, getCardDiagnostics, runSync } from '@/utils/sync'
import { getPluginI18n } from '@/index'
import type { AnkiLinkerMapping, AnkiLinkerSettings, DeletionDiagnosticsFilter, DeletionDiagnosticsResult, PathDeckRule, SyncLogItem, SyncPreviewResult } from '@/types/plugin'

type ExportedSettingsFile = {
  version: 1
  exportedAt: string
  plugin: string
  settings: AnkiLinkerSettings
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

const plugin = usePlugin()
const locale = reactive({
  ...getPluginI18n(plugin),
  heroEyebrow: plugin.i18n.heroEyebrow || 'SiYuan to Local Anki',
  detectConnection: plugin.i18n.detectConnection || 'Detect Local Connection',
  refreshRemoteMeta: plugin.i18n.refreshRemoteMeta || 'Refresh Decks/Models',
  exportSettings: plugin.i18n.exportSettings || 'Export Config',
  importSettings: plugin.i18n.importSettings || 'Import Config',
  saveSettings: plugin.i18n.saveSettings || 'Save Settings',
  closePanel: plugin.i18n.closePanel || 'Close Panel',
  localAnkiConnect: plugin.i18n.localAnkiConnect || 'Local AnkiConnect',
  collapse: plugin.i18n.collapse || 'Collapse',
  expand: plugin.i18n.expand || 'Expand',
  edit: plugin.i18n.edit || 'Edit',
  done: plugin.i18n.done || 'Done',
  ankiConnectUrl: plugin.i18n.ankiConnectUrl || 'AnkiConnect URL',
  defaultDeck: plugin.i18n.defaultDeck || 'Default Target Deck',
  qaNoteType: plugin.i18n.qaNoteType || 'QA Note Type',
  qaFrontField: plugin.i18n.qaFrontField || 'QA Front Field',
  qaBackField: plugin.i18n.qaBackField || 'QA Back Field',
  clozeNoteType: plugin.i18n.clozeNoteType || 'Cloze Note Type',
  clozeTextField: plugin.i18n.clozeTextField || 'Cloze Text Field',
  clozeExtraField: plugin.i18n.clozeExtraField || 'Cloze Extra Field',
  connectionStatus: plugin.i18n.connectionStatus || 'Connection Status',
  fieldHint: plugin.i18n.fieldHint || 'Field dropdowns are read from the selected Anki note type to avoid empty errors caused by manual field name input.',
  pathDeckRouting: plugin.i18n.pathDeckRouting || 'Assign Deck by Document Path',
  refreshPath: plugin.i18n.refreshPath || 'Refresh Paths',
  pathRuleHint: plugin.i18n.pathRuleHint || 'Flashcards under the same path prefix will be synced to the specified deck; unmatched rules use the default target deck.',
  currentPath: plugin.i18n.currentPath || 'Current Path',
  notSelected: plugin.i18n.notSelected || 'Not Selected',
  pathSearchPlaceholder: plugin.i18n.pathSearchPlaceholder || 'Filter by keyword, or type / to drill down path levels',
  stepBack: plugin.i18n.stepBack || 'Step Back',
  clearPath: plugin.i18n.clearPath || 'Clear Path',
  remove: plugin.i18n.remove || 'Remove',
  addPathRule: plugin.i18n.addPathRule || 'Add Path Rule',
  pathRuleFooter: plugin.i18n.pathRuleFooter || 'Supports path search and stepwise selection; rules are matched by path prefix.',
  flashcardStatus: plugin.i18n.flashcardStatus || 'SiYuan Flashcard Status',
  flashcardStatusHint: plugin.i18n.flashcardStatusHint || 'This version prefers the native SiYuan Riff API. If cardID is unavailable, it falls back to block-level incremental sync based on card-creation blocks, without relying on review progress.',
  availableFlashcards: plugin.i18n.availableFlashcards || 'Available Flashcards',
  existingMappings: plugin.i18n.existingMappings || 'Existing Mappings',
  refreshCardStats: plugin.i18n.refreshCardStats || 'Refresh Card Stats',
  cleanupMappings: plugin.i18n.cleanupMappings || 'Cleanup Invalid Mappings',
  hideDiagnostics: plugin.i18n.hideDiagnostics || 'Hide Diagnostics',
  showDiagnostics: plugin.i18n.showDiagnostics || 'Show Diagnostics',
  cachedEvents: plugin.i18n.cachedEvents || 'Event Cache',
  blockScan: plugin.i18n.blockScan || 'Block Scan',
  currentMappings: plugin.i18n.currentMappings || 'Current Mappings',
  fallback: plugin.i18n.fallback || 'Fallback',
  relatedTables: plugin.i18n.relatedTables || 'Related Tables',
  tableColumns: plugin.i18n.tableColumns || 'Table Columns',
  cardUnit: plugin.i18n.cardUnit || 'cards',
  mappingUnit: plugin.i18n.mappingUnit || 'items',
  notFound: plugin.i18n.notFound || 'Not Found',
  syncPreview: plugin.i18n.syncPreview || 'Sync Preview',
  generatePreview: plugin.i18n.generatePreview || 'Generate Preview',
  runSync: plugin.i18n.runSync || 'Run Sync',
  added: plugin.i18n.added || 'Added',
  updated: plugin.i18n.updated || 'Updated',
  deleted: plugin.i18n.deleted || 'Deleted',
  invalid: plugin.i18n.invalid || 'Invalid',
  previewDetails: plugin.i18n.previewDetails || 'Preview Details',
  collapseDetails: plugin.i18n.collapseDetails || 'Collapse Details',
  expandDetails: plugin.i18n.expandDetails || 'Expand Details',
  noPreviewData: plugin.i18n.noPreviewData || 'No preview data yet',
  syncLogs: plugin.i18n.syncLogs || 'Sync Logs',
  collapseLogs: plugin.i18n.collapseLogs || 'Collapse Logs',
  expandLogs: plugin.i18n.expandLogs || 'Expand Logs',
  clearLogs: plugin.i18n.clearLogs || 'Clear Logs',
  deletionDiagnostics: plugin.i18n.deletionDiagnostics || 'Deletion Diagnostics',
  refreshDeletionDiagnostics: plugin.i18n.refreshDeletionDiagnostics || 'Refresh Deletion Diagnostics',
  deletionAllowed: plugin.i18n.deletionAllowed || 'Deletion Allowed',
  orphanMappings: plugin.i18n.orphanMappings || 'Orphan Mappings',
  matchedMappings: plugin.i18n.matchedMappings || 'Matched Mappings',
  matchReason: plugin.i18n.matchReason || 'Match Reason',
  matchedCandidate: plugin.i18n.matchedCandidate || 'Matched Candidate',
  orphan: plugin.i18n.orphan || 'Orphan',
  matchedByCardId: plugin.i18n.matchedByCardId || 'Matched by cardId',
  matchedByBlockId: plugin.i18n.matchedByBlockId || 'Matched by blockId',
  noDeletionDiagnostics: plugin.i18n.noDeletionDiagnostics || 'No deletion diagnostics yet',
  onlyOrphans: plugin.i18n.onlyOrphans || 'Only Orphans',
  blockIdFilter: plugin.i18n.blockIdFilter || 'Filter by blockId',
  blockIdFilterPlaceholder: plugin.i18n.blockIdFilterPlaceholder || 'Filter blockId / cardId / path',
  clearFilter: plugin.i18n.clearFilter || 'Clear Filter',
  importConfigInvalid: plugin.i18n.importConfigInvalid || 'Invalid config file',
})
const connectionStatus = ref('未检测')
const deckOptions = ref<SelectOption[]>([{ value: 'Default', text: 'Default' }])
const noteTypeOptions = ref<SelectOption[]>([{ value: 'Basic', text: 'Basic' }])
const qaFieldOptions = ref<SelectOption[]>([{ value: 'Front', text: 'Front' }, { value: 'Back', text: 'Back' }])
const clozeFieldOptions = ref<SelectOption[]>([{ value: 'Text', text: 'Text' }, { value: 'Extra', text: 'Extra' }])
const pathSearchOptions = ref<SelectOption[]>([])
const pathTreeRoots = ref<PathTreeNode[]>([])
const rulePathSearchStates = ref<PathSearchState[]>([])
const ruleEditStates = ref<boolean[]>([])
const logs = ref<SyncLogItem[]>([])
const showLogs = ref(false)
const showDiagnostics = ref(false)
const showPreviewDetails = ref(false)
const showAnkiConfig = ref(true)
const showPathRules = ref(true)
const importInputRef = ref<HTMLInputElement | null>(null)
const mappings = ref<AnkiLinkerMapping[]>([])
const previewResult = ref<SyncPreviewResult | null>(null)
const deletionDiagnostics = ref<DeletionDiagnosticsResult | null>(null)
const deletionDiagnosticsFilter = reactive<DeletionDiagnosticsFilter>({
  onlyOrphans: false,
  blockIdKeyword: '',
})

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

const deletionDiagnosticItems = computed(() => {
  if (!deletionDiagnostics.value) {
    return []
  }

  const keyword = deletionDiagnosticsFilter.blockIdKeyword.trim().toLowerCase()

  return deletionDiagnostics.value.diagnostics
    .filter((item) => {
      if (deletionDiagnosticsFilter.onlyOrphans && item.matched) {
        return false
      }

      if (!keyword) {
        return true
      }

      return [
        item.siyuanCardId,
        item.siyuanBlockId,
        item.hPath || '',
        item.matchedCandidateCardId,
        item.matchedCandidateBlockId,
        item.matchedCandidatePath,
      ].some(value => String(value || '').toLowerCase().includes(keyword))
    })
    .map((item) => {
      const matchLabel = item.matchReason === 'cardId'
        ? locale.matchedByCardId
        : item.matchReason === 'blockId'
          ? locale.matchedByBlockId
          : locale.orphan

      const matchedCandidate = item.matched
        ? `${item.matchedCandidateCardId || locale.notFound} / ${item.matchedCandidateBlockId || locale.notFound}${item.matchedCandidatePath ? ` / ${item.matchedCandidatePath}` : ''}`
        : locale.notFound

      return {
        key: item.key,
        title: `${item.siyuanCardId} / ${item.siyuanBlockId}`,
        subtitle: `${item.hPath || item.deckName} / note:${item.ankiNoteId}`,
        matchLabel,
        matchedCandidate,
        matched: item.matched,
      }
    })
})

const clearDeletionDiagnosticsFilter = () => {
  deletionDiagnosticsFilter.onlyOrphans = false
  deletionDiagnosticsFilter.blockIdKeyword = ''
}

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
  ruleEditStates.value = settings.pathDeckRules.map((_, index) => ruleEditStates.value[index] ?? true)
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
  ruleEditStates.value.push(true)
  showPathRules.value = true
}

const startEditPathRule = (index: number) => {
  ruleEditStates.value[index] = true
}

const finishEditPathRule = (index: number) => {
  ruleEditStates.value[index] = false
}

const removePathRule = (index: number) => {
  settings.pathDeckRules.splice(index, 1)
  rulePathSearchStates.value.splice(index, 1)
  ruleEditStates.value.splice(index, 1)
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

const refreshDeletionDiagnostics = async () => {
  try {
    deletionDiagnostics.value = await buildDeletionDiagnostics(settings, mappings.value)
    const matchedCount = deletionDiagnostics.value.matchedCount
    const orphanCount = deletionDiagnostics.value.orphanCount
    addLog(`删除判定诊断完成：允许删除 ${deletionDiagnostics.value.allowDeletion ? '是' : '否'}；命中 ${matchedCount} 条；孤儿映射 ${orphanCount} 条`)
  } catch (error) {
    addLog(`删除判定诊断失败：${String(error)}`)
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

const buildSettingsExportPayload = (): ExportedSettingsFile => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  plugin: 'siyuan-ankiLinker',
  settings: {
    ...settings,
    pathDeckRules: settings.pathDeckRules.map(rule => ({ ...rule })),
  },
})

const applyImportedSettings = (settingsData: Partial<AnkiLinkerSettings> | null | undefined) => {
  if (!settingsData || typeof settingsData !== 'object') {
    throw new Error(locale.importConfigInvalid)
  }

  Object.assign(settings, {
    ...settings,
    ...settingsData,
    pathDeckRules: Array.isArray(settingsData.pathDeckRules) ? settingsData.pathDeckRules : [],
  })
  syncRuleSearchStates()
}

const exportSettings = async () => {
  try {
    const payload = buildSettingsExportPayload()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `siyuan-ankiLinker-settings-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    addLog('配置文件已导出')
  } catch (error) {
    addLog(`导出配置文件失败：${String(error)}`)
  }
}

const triggerImportSettings = () => {
  importInputRef.value?.click()
}

const importSettingsFromFile = async (event: Event) => {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) {
    return
  }

  try {
    const text = await file.text()
    const parsed = JSON.parse(text) as Partial<ExportedSettingsFile> | Partial<AnkiLinkerSettings>
    const settingsPayload = 'settings' in (parsed || {}) ? parsed.settings : parsed
    applyImportedSettings(settingsPayload as Partial<AnkiLinkerSettings>)
    await refreshRemoteMeta()
    await persistState()
    addLog(`已导入配置文件：${file.name}`)
  } catch (error) {
    addLog(`导入配置文件失败：${String(error)}`)
  } finally {
    if (input) {
      input.value = ''
    }
  }
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

    addLog('已加载本地配置与映射数据')
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

const handleEscapeKey = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') {
    return
  }

  const appShell = document.getElementById('siyuan-anki-linker-app')
  if (!appShell || appShell.classList.contains('fn__none')) {
    return
  }

  closePanel()
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
    await refreshDeletionDiagnostics()
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
    await refreshDeletionDiagnostics()
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
  window.addEventListener('keydown', handleEscapeKey)
  await loadState()
  await refreshCardStats()
  await refreshDeletionDiagnostics()
  await refreshRemoteMeta()
  await refreshPathOptions()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscapeKey)
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

.hero--top-actions-right .hero-actions {
  margin-left: auto;
  justify-content: flex-end;
}

.hero-actions--stacked {
  flex-direction: column;
  align-items: flex-end;
}

.hero-actions__row {
  justify-content: flex-end;
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
  line-height: 1.5;
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

.button-row--compact {
  gap: 8px;
}

.button-row--nowrap {
  flex-wrap: nowrap;
}

.button-row--align-end {
  justify-content: flex-end;
}

.panel-header {
  justify-content: space-between;
  align-items: center;
}

.panel-header--section-actions {
  gap: 12px;
}

.compact-form {
  display: grid;
  grid-template-columns: minmax(132px, max-content) minmax(0, 1fr);
  gap: 10px 12px;
  align-items: center;
}

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
  display: flex;
  flex-direction: column;
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

.path-rule-actions {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.path-rule-actions > :nth-child(2) {
  flex: 1;
  min-width: 180px;
}

.path-rule-summary-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20px minmax(0, 220px) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.path-rule-summary-cell {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  padding-bottom: 2px;
  scrollbar-width: thin;
}

.path-rule-summary-cell--path {
  text-align: left;
}

.path-rule-summary-cell--deck {
  text-align: left;
}

.path-rule-summary-arrow {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  width: 20px;
  text-align: center;
}

.path-rule-summary-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  min-width: max-content;
  margin-left: auto;
}

.path-rule-action-button {
  min-width: 56px;
}

.icon-button {
  min-width: 30px;
  width: 30px;
  height: 30px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  border-radius: 8px;
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

.diagnostic-subsection {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--b3-border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diagnostic-filter-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.diagnostic-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--b3-theme-on-surface-light);
  font-size: 13px;
}

.diagnostic-filter-inputs {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
  min-width: min(100%, 260px);
}

.diagnostic-filter-inputs > :first-child {
  flex: 1;
}

.diagnostic-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diagnostic-list--scrollable {
  max-height: 260px;
  overflow-y: auto;
}

.diagnostic-item {
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--b3-theme-background) 84%, var(--b3-theme-primary) 16%);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.diagnostic-item--orphan {
  background: color-mix(in srgb, var(--b3-theme-background) 82%, var(--b3-card-warning-color, #d97706) 18%);
}

.diagnostic-item__main,
.diagnostic-item__side {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.diagnostic-item__main span,
.diagnostic-item__side span,
.diagnostic-item__main strong {
  overflow-wrap: anywhere;
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

  .compact-form {
    grid-template-columns: 1fr;
  }

  .log-header,
  .hero,
  .preview-list li,
  .log-panel li,
  .panel-header,
  .path-rule-actions,
  .diagnostic-item,
  .diagnostic-filter-row {
    flex-direction: column;
    align-items: stretch;
  }

  .path-rule-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .path-rule-summary-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  .path-rule-summary-actions {
    justify-content: flex-start;
    width: 100%;
  }

  .path-rule-action-button {
    flex: 1;
  }
}
</style>
