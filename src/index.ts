import {
  Plugin,
  getFrontend,
} from "siyuan";
import "@/index.scss";
import PluginInfoString from '@/../plugin.json'
import { destroy, init, showPanel } from '@/main'

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

    init(this)

    this.addTopBar({
      icon: 'iconRiffCard',
      title: 'ankiLinker',
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

