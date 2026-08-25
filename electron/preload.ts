import { contextBridge, ipcRenderer } from 'electron'
import type { AINewsAPI, FeedState } from '../shared/types'

const api: AINewsAPI = {
  getState: () => ipcRenderer.invoke('feed:get-state'),
  onState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: FeedState) => listener(state)
    ipcRenderer.on('feed:state', handler)
    return () => ipcRenderer.removeListener('feed:state', handler)
  },
  refreshNow: () => ipcRenderer.invoke('feed:refresh'),
  openArticle: (url) => ipcRenderer.invoke('article:open', url),
  toggleCollapsed: () => ipcRenderer.invoke('window:toggle-collapsed'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  setAutoStart: (enabled) => ipcRenderer.invoke('settings:set-autostart', enabled),
  updatePreferences: (patch) => ipcRenderer.invoke('settings:update-preferences', patch),
  resetAppearance: () => ipcRenderer.invoke('settings:reset-appearance'),
  resetWindowSize: () => ipcRenderer.invoke('window:reset-size'),
  notifyOnline: () => ipcRenderer.send('network:online'),
}

contextBridge.exposeInMainWorld('aiNews', api)
