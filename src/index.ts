import {
  Plugin,
  getFrontend,
} from "siyuan";
import "@/index.scss";
import PluginInfoString from "@/../plugin.json"
import { destroy, init, showPanel } from "@/main"
import topbarIcon from "@/../asset/topbar-icon.svg?raw"

const TOPBAR_ICON_NAME = "iconSiyuanAnkiLinker"
const PLUGIN_RUNTIME_KEY = "_sy_siyuan_ankiLinker"
const SETTINGS_STORAGE_KEY = "settings.json"
const MAPPINGS_STORAGE_KEY = "mappings.json"
const LEGACY_STORAGE_KEY = "ankilinker-state.json"
const STORAGE_KEYS = [SETTINGS_STORAGE_KEY, MAPPINGS_STORAGE_KEY, LEGACY_STORAGE_KEY] as const
const DEFAULT_TOPBAR_TITLE = "Anki Linker"
const DEFAULT_PANEL_TITLE = "Anki Linker"
const DEFAULT_PANEL_SUBTITLE = "Sync SiYuan flashcards to local Anki via AnkiConnect"

type CardUpdateOptions = {
  cards?: unknown[]
}

type PluginLocaleStrings = {
  topbarTitle: string
  panelTitle: string
  panelSubtitle: string
}

let PluginInfo = {
  version: "",
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
    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile"
    this.isBrowser = frontEnd.includes("browser")
    this.isLocal = location.href.includes("127.0.0.1") || location.href.includes("localhost")
    this.isInWindow = location.href.includes("window.html")

    try {
      require("@electron/remote")
        .require("@electron/remote/main")
      this.isElectron = true
    } catch {
      this.isElectron = false
    }

    this.addIcons(`<symbol id="${TOPBAR_ICON_NAME}" viewBox="0 0 16 16">${extractSvgBody(topbarIcon)}</symbol>`)

    init(this)

    this.addTopBar({
      icon: TOPBAR_ICON_NAME,
      title: this.i18n.topbarTitle || DEFAULT_TOPBAR_TITLE,
      position: "right",
      callback: () => {
        showPanel()
      },
    })
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
    ])
    cleanupRuntimeState()
  }

  openSetting() {
    showPanel()
  }
}

export function getPluginI18n(plugin: Plugin): PluginLocaleStrings {
  return {
    topbarTitle: plugin.i18n.topbarTitle || DEFAULT_TOPBAR_TITLE,
    panelTitle: plugin.i18n.panelTitle || DEFAULT_PANEL_TITLE,
    panelSubtitle: plugin.i18n.panelSubtitle || DEFAULT_PANEL_SUBTITLE,
  }
}

function cleanupRuntimeState() {
  if (window[PLUGIN_RUNTIME_KEY]) {
    delete window[PLUGIN_RUNTIME_KEY]
  }
}

function extractSvgBody(svg: string) {
  return svg
    .replace(/^[\s\S]*?<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
}

