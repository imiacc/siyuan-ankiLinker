import {
  Plugin,
  getFrontend,
} from "siyuan";
import "@/index.scss";
import PluginInfoString from '@/../plugin.json'
import { destroy, init, showPanel } from '@/main'
import topbarIcon from '@/../asset/topbar-icon.svg?raw'

const TOPBAR_ICON_NAME = 'iconAnkiLinker'

let PluginInfo = {
  version: '',
}
try {
  PluginInfo = PluginInfoString
} catch (err) {
  console.log('Plugin info parse error: ', err)
}
const {
  version,
} = PluginInfo

export default class AnkiLinkerPlugin extends Plugin {
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
    } catch (err) {
      this.isElectron = false
    }

    this.addIcons(`<symbol id="${TOPBAR_ICON_NAME}" viewBox="0 0 16 16">${extractSvgBody(topbarIcon)}</symbol>`)

    init(this)

    this.addTopBar({
      icon: TOPBAR_ICON_NAME,
      title: 'Anki Linker',
      position: 'right',
      callback: () => {
        showPanel()
      },
    })

    console.log('ankiLinker loaded, the plugin is ', this)
  }

  updateCards(options) {
    window._sy_ankilinker = {
      ...(window._sy_ankilinker || {}),
      cards: options.cards,
    }
    return options
  }

  onunload() {
    destroy()
  }

  openSetting() {
    showPanel()
  }
}

function extractSvgBody(svg: string) {
  return svg
    .replace(/^[\s\S]*?<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
}


