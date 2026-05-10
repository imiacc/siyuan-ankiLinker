import {
  Plugin,
  getFrontend,
} from "siyuan";
import "@/index.scss";
import PluginInfoString from '@/../plugin.json'
import { destroy, init, showPanel } from '@/main'
import { getFile, removeFile } from '@/api'
import topbarIcon from '@/../asset/topbar-icon.svg?raw'

const TOPBAR_ICON_NAME = 'iconSiyuanAnkiLinker'
const LEGACY_PLUGIN_ID = 'ankiLinker'
const PLUGIN_RUNTIME_KEY = '_sy_siyuan_ankiLinker'
const SETTINGS_STORAGE_KEY = 'settings.json'
const MAPPINGS_STORAGE_KEY = 'mappings.json'
const LEGACY_STORAGE_KEY = 'ankilinker-state.json'
const STORAGE_KEYS = [SETTINGS_STORAGE_KEY, MAPPINGS_STORAGE_KEY, LEGACY_STORAGE_KEY] as const

type CardUpdateOptions = {

  cards?: unknown[]
}

let PluginInfo = {
  version: '',
}
try {
  PluginInfo = PluginInfoString
} catch {
  // ignore plugin info parse fallback
}

const {
  version,
} = PluginInfo

export default class SiyuanAnkiLinkerPlugin extends Plugin {
  public isMobile: boolean
  public isBrowser: boolean
  public isLocal: boolean
  public isElectron: boolean
  public isInWindow: boolean
  public platform: SyFrontendTypes
  public readonly version = version

  async onload() {
    const frontEnd = getFrontend()
    this.platform = frontEnd as SyFrontendTypes
    this.isMobile = frontEnd === 'mobile' || frontEnd === 'browser-mobile'
    this.isBrowser = frontEnd.includes('browser')
    this.isLocal = location.href.includes('127.0.0.1') || location.href.includes('localhost')
    this.isInWindow = location.href.includes('window.html')

    try {
      require('@electron/remote')
        .require('@electron/remote/main')
      this.isElectron = true
    } catch {
      this.isElectron = false
    }

    this.addIcons(`<symbol id="${TOPBAR_ICON_NAME}" viewBox="0 0 16 16">${extractSvgBody(topbarIcon)}</symbol>`)

    init(this)

    this.addTopBar({
      icon: TOPBAR_ICON_NAME,
      title: 'siyuan-ankiLinker',
      position: 'right',
      callback: () => {
        showPanel()
      },
    })

    await migrateLegacyStorageIfNeeded(this)
  }

  updateCards(options: CardUpdateOptions) {
    window[PLUGIN_RUNTIME_KEY] = {
      ...(window[PLUGIN_RUNTIME_KEY] || {}),
      cards: options.cards,
    }

    return options
  }

  onunload() {
    destroy()
    cleanupRuntimeState()
  }

  async uninstall() {
    await Promise.allSettled([
      ...STORAGE_KEYS.map(key => this.removeData(key)),
      ...STORAGE_KEYS.map(key => removeFile(buildLegacyStoragePath(key))),
    ])
    cleanupRuntimeState()
  }

  openSetting() {
    showPanel()
  }
}

function cleanupRuntimeState() {

  if (window[PLUGIN_RUNTIME_KEY]) {
    delete window[PLUGIN_RUNTIME_KEY]
  }
}

function buildLegacyStoragePath(filename: string) {
  return `/data/storage/petal/${LEGACY_PLUGIN_ID}/${filename}`
}

async function migrateLegacyStorageIfNeeded(plugin: Plugin) {
  try {
    const existingSettings = await plugin.loadData(SETTINGS_STORAGE_KEY)
    const existingMappings = await plugin.loadData(MAPPINGS_STORAGE_KEY)
    const existingLegacyState = await plugin.loadData(LEGACY_STORAGE_KEY)
    if (existingSettings || existingMappings || existingLegacyState) {
      return
    }

    const [legacySettingsRaw, legacyMappingsRaw, legacyStateRaw] = await Promise.all([
      getFile(buildLegacyStoragePath(SETTINGS_STORAGE_KEY)),
      getFile(buildLegacyStoragePath(MAPPINGS_STORAGE_KEY)),
      getFile(buildLegacyStoragePath(LEGACY_STORAGE_KEY)),
    ])

    const legacySettings = parseLegacyStorageContent(legacySettingsRaw)
    const legacyMappings = parseLegacyStorageContent(legacyMappingsRaw)
    const legacyState = parseLegacyStorageContent(legacyStateRaw)

    const writeTasks: Promise<void>[] = []
    if (legacySettings) {
      writeTasks.push(plugin.saveData(SETTINGS_STORAGE_KEY, legacySettings))
    }
    if (legacyMappings) {
      writeTasks.push(plugin.saveData(MAPPINGS_STORAGE_KEY, legacyMappings))
    }
    if (legacyState) {
      writeTasks.push(plugin.saveData(LEGACY_STORAGE_KEY, legacyState))
    }

    if (writeTasks.length === 0) {
      return
    }

        await Promise.all(writeTasks)

  } catch {
    // ignore legacy migration failures
  }
}

function parseLegacyStorageContent(raw: unknown) {

  if (raw == null) {
    return null
  }
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) {
      return null
    }
    try {
      return JSON.parse(text)
    } catch {
      return raw
    }
  }
  return raw
}

function extractSvgBody(svg: string) {
  return svg

    .replace(/^[\s\S]*?<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
}



