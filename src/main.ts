import {
  Plugin,
} from 'siyuan'
import { createApp } from 'vue'
import App from './App.vue'

let plugin: Plugin | null = null
export function usePlugin(pluginProps?: Plugin): Plugin {
  if (pluginProps) {
    plugin = pluginProps
  }
  if (!plugin && !pluginProps) {
    throw new Error('need bind plugin')
  }
  return plugin as Plugin
}

let app: ReturnType<typeof createApp> | null = null
let rootElement: HTMLDivElement | null = null

export function init(pluginProps: Plugin) {
  usePlugin(pluginProps)

  const div = document.createElement('div')
  div.classList.add('anki-linker-app', 'fn__none')
  div.id = 'anki-linker-app'
  app = createApp(App)
  app.mount(div)
  document.body.appendChild(div)
  rootElement = div
}

export function showPanel() {
  rootElement?.classList.remove('fn__none')
}

export function hidePanel() {
  rootElement?.classList.add('fn__none')
}

export function destroy() {
  if (app) {
    app.unmount()
    app = null
  }
  if (rootElement?.parentNode) {
    rootElement.parentNode.removeChild(rootElement)
  }
  rootElement = null
}
