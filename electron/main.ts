import path from 'node:path'
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  shell,
  Tray,
} from 'electron'
import type { FeedState, UserPreferences, WindowPlacement } from '../shared/types'
import { FeedService } from './feed-service'
import { JsonStorage } from './storage'

const APP_ID = 'com.aikuaixun.widget'
const DEFAULT_WIDTH = 280
const DEFAULT_HEIGHT = 360
const MIN_WIDTH = 260
const MIN_HEIGHT = 300
const COLLAPSED_HEIGHT = 64

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let feedService: FeedService | null = null
let storage: JsonStorage | null = null
let quitting = false
let boundsSaveTimer: NodeJS.Timeout | null = null

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow(true))
  app.whenReady().then(initialize).catch((error) => {
    console.error('应用初始化失败', error)
    app.quit()
  })
}

app.on('before-quit', () => {
  quitting = true
  feedService?.stop()
})

app.on('window-all-closed', () => {
  // Windows 小组件通过托盘常驻；仅托盘“彻底退出”会关闭进程。
})

app.on('activate', () => showWindow(true))

async function initialize(): Promise<void> {
  app.setAppUserModelId(APP_ID)
  storage = new JsonStorage(app.getPath('userData'))
  const data = await storage.load()

  if (app.isPackaged && !data.autoStartInitialized) {
    setAutoStart(true)
    data.autoStartInitialized = true
    await storage.save(data)
  }

  createWindow(data.windowPlacement, data.collapsed, data.expandedHeight)
  createTray()
  registerIpc()

  feedService = new FeedService({
    storage,
    data,
    getAutoStart: getAutoStart,
    onState: broadcastState,
  })
  feedService.start()

  powerMonitor.on('resume', () => void feedService?.ensureFreshAfterWake())
  const startedAutomatically = process.argv.includes('--autostart')
  showWindow(!startedAutomatically)
}

function createWindow(placement: WindowPlacement | null, collapsed: boolean, expandedHeight: number): void {
  const defaultBounds = defaultWindowBounds()
  const initial = placement && isPlacementVisible(placement) ? placement : defaultBounds
  const height = collapsed ? COLLAPSED_HEIGHT : Math.max(expandedHeight, MIN_HEIGHT)

  mainWindow = new BrowserWindow({
    x: initial.x,
    y: initial.y,
    width: Math.max(initial.width, MIN_WIDTH),
    height,
    minWidth: MIN_WIDTH,
    minHeight: collapsed ? COLLAPSED_HEIGHT : MIN_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: !collapsed,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('move', scheduleBoundsSave)
  mainWindow.on('resize', scheduleBoundsSave)
  mainWindow.on('closed', () => { mainWindow = null })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) void mainWindow.loadURL(devUrl)
  else void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
}

function createTray(): void {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('AI 快讯')
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide()
    else showWindow(true)
  })
  rebuildTrayMenu()
}

function rebuildTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? '隐藏悬浮窗' : '显示悬浮窗',
      click: () => mainWindow?.isVisible() ? mainWindow.hide() : showWindow(true),
    },
    { label: '立即刷新', click: () => void feedService?.refreshNow() },
    { type: 'separator' },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: getAutoStart(),
      click: (item) => {
        setAutoStart(item.checked)
        feedService?.notifySettingsChanged()
        rebuildTrayMenu()
      },
    },
    { type: 'separator' },
    {
      label: '彻底退出',
      click: () => {
        quitting = true
        app.quit()
      },
    },
  ]))
}

function registerIpc(): void {
  ipcMain.handle('feed:get-state', () => feedService?.getState())
  ipcMain.handle('feed:refresh', () => feedService?.refreshNow())
  ipcMain.handle('article:open', async (_event, value: unknown) => {
    if (typeof value !== 'string' || !isSafeExternalUrl(value)) return false
    await shell.openExternal(value)
    return true
  })
  ipcMain.handle('window:toggle-collapsed', async () => toggleCollapsed())
  ipcMain.handle('window:hide', () => mainWindow?.hide())
  ipcMain.handle('settings:set-autostart', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return getAutoStart()
    setAutoStart(enabled)
    feedService?.notifySettingsChanged()
    rebuildTrayMenu()
    return getAutoStart()
  })
  ipcMain.handle('settings:update-preferences', (_event, patch: unknown) => {
    if (!patch || typeof patch !== 'object') return feedService?.getState().preferences
    return feedService?.updatePreferences(patch as Partial<UserPreferences>)
  })
  ipcMain.handle('settings:reset-appearance', () => feedService?.resetAppearance())
  ipcMain.handle('window:reset-size', () => resetWindowSize())
  ipcMain.on('network:online', () => void feedService?.ensureFreshAfterWake())
}

async function toggleCollapsed(): Promise<boolean> {
  if (!mainWindow || !feedService) return false
  const next = !feedService.data.collapsed
  const bounds = mainWindow.getBounds()
  if (next) {
    feedService.data.expandedHeight = Math.max(bounds.height, MIN_HEIGHT)
    mainWindow.setResizable(false)
    mainWindow.setBounds({ ...bounds, height: COLLAPSED_HEIGHT }, true)
    mainWindow.setMinimumSize(MIN_WIDTH, COLLAPSED_HEIGHT)
  } else {
    mainWindow.setMinimumSize(MIN_WIDTH, MIN_HEIGHT)
    mainWindow.setResizable(true)
    mainWindow.setBounds({ ...bounds, height: Math.max(feedService.data.expandedHeight, MIN_HEIGHT) }, true)
  }
  await feedService.setCollapsed(next)
  return next
}

async function resetWindowSize(): Promise<void> {
  if (!mainWindow || !feedService) return
  const target = defaultWindowBounds()
  feedService.data.windowPlacement = target
  feedService.data.expandedHeight = DEFAULT_HEIGHT
  if (feedService.data.collapsed) {
    mainWindow.setBounds({ ...target, height: COLLAPSED_HEIGHT }, true)
  } else {
    mainWindow.setMinimumSize(MIN_WIDTH, MIN_HEIGHT)
    mainWindow.setResizable(true)
    mainWindow.setBounds(target, true)
  }
  await feedService.persist()
}

function broadcastState(state: FeedState): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('feed:state', state)
  rebuildTrayMenu()
}

function showWindow(activate: boolean): void {
  if (!mainWindow) return
  if (activate) {
    mainWindow.show()
    mainWindow.focus()
  } else {
    mainWindow.showInactive()
  }
  rebuildTrayMenu()
}

function defaultWindowBounds(): WindowPlacement {
  const workArea = screen.getPrimaryDisplay().workArea
  return {
    x: workArea.x + workArea.width - DEFAULT_WIDTH - 20,
    y: workArea.y + 20,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  }
}

function isPlacementVisible(placement: WindowPlacement): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const horizontal = placement.x < workArea.x + workArea.width && placement.x + placement.width > workArea.x
    const vertical = placement.y < workArea.y + workArea.height && placement.y + 50 > workArea.y
    return horizontal && vertical
  })
}

function scheduleBoundsSave(): void {
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer)
  boundsSaveTimer = setTimeout(() => void persistBounds(), 350)
}

async function persistBounds(): Promise<void> {
  if (!mainWindow || !feedService || feedService.data.collapsed) return
  const bounds = mainWindow.getBounds()
  feedService.data.windowPlacement = bounds
  feedService.data.expandedHeight = bounds.height
  await feedService.persist()
}

function getAutoStart(): boolean {
  if (!app.isPackaged) return false
  return app.getLoginItemSettings({ path: process.execPath, args: ['--autostart'] }).openAtLogin
}

function setAutoStart(enabled: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: enabled,
    enabled,
    path: process.execPath,
    args: ['--autostart'],
    name: 'AI快讯',
  })
}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function createTrayIcon(): Electron.NativeImage {
  const size = 32
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const distance = Math.hypot(x - 15.5, y - 15.5)
      const inside = distance <= 14
      const isSpark = (Math.abs(x - 16) <= 1 && y >= 7 && y <= 24)
        || (Math.abs(y - 16) <= 1 && x >= 7 && x <= 24)
        || (Math.abs((x - 16) - (y - 16)) <= 1 && x >= 10 && x <= 22)
      pixels[index] = isSpark ? 255 : 210
      pixels[index + 1] = isSpark ? 255 : 105
      pixels[index + 2] = isSpark ? 255 : 61
      pixels[index + 3] = inside ? 255 : 0
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 1 }).resize({ width: 16, height: 16 })
}
