import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  DEFAULT_PREFERENCES,
  type FeedState,
  type NewsItem,
  type ResizeDirection,
  type SourceAuthority,
  type UserPreferences,
  type WeeklyEvent,
} from '../shared/types'
import { effectiveOpacity } from './appearance'

const INITIAL_STATE: FeedState = {
  latest: [], weeklyDigest: null, lastSuccessAt: null, nextRefreshAt: null,
  loading: true, error: null, autoStart: false, collapsed: false,
  preferences: { ...DEFAULT_PREFERENCES },
}

export default function App() {
  const [state, setState] = useState(INITIAL_STATE)
  const [now, setNow] = useState(() => new Date())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pointerInside, setPointerInside] = useState(false)

  useEffect(() => {
    let mounted = true
    window.aiNews.getState().then((next) => { if (mounted && next) setState(next) })
    const unsubscribe = window.aiNews.onState(setState)
    const clock = window.setInterval(() => setNow(new Date()), 30_000)
    const onOnline = () => window.aiNews.notifyOnline()
    window.addEventListener('online', onOnline)
    return () => {
      mounted = false
      unsubscribe()
      window.clearInterval(clock)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) setPointerInside(false)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  const visibleOpacity = effectiveOpacity(state.preferences.opacity, pointerInside)
  const appearance = useMemo(
    () => appearanceFor(state.preferences, visibleOpacity),
    [state.preferences, visibleOpacity],
  )
  const lastUpdated = useMemo(() => relativeTime(state.lastSuccessAt, now), [state.lastSuccessAt, now])
  const weeklyLabel = useMemo(() => {
    if (!state.weeklyDigest) return '最近一个完整周'
    return `${shortDate(state.weeklyDigest.weekStart)}—${shortDate(new Date(Date.parse(state.weeklyDigest.weekEnd) - 1).toISOString())}`
  }, [state.weeklyDigest])

  const toggleCollapsed = useCallback(async () => {
    setSettingsOpen(false)
    const collapsed = await window.aiNews.toggleCollapsed()
    setState((current) => ({ ...current, collapsed }))
  }, [])

  const openArticle = useCallback((item: NewsItem | WeeklyEvent) => {
    void window.aiNews.openArticle(item.url)
  }, [])

  const updatePreferences = useCallback((patch: Partial<UserPreferences>) => {
    setState((current) => ({ ...current, preferences: { ...current.preferences, ...patch } }))
    void window.aiNews.updatePreferences(patch).then((preferences) => {
      setState((current) => ({ ...current, preferences }))
    })
  }, [])

  const hideWindow = useCallback(() => {
    setPointerInside(false)
    void window.aiNews.hideWindow()
  }, [])

  const widgetProps = {
    style: appearance.style,
    'data-custom-theme': appearance.theme,
    'data-pointer-inside': pointerInside,
    onPointerEnter: () => setPointerInside(true),
    onPointerLeave: () => setPointerInside(false),
  }

  if (state.collapsed) {
    return (
      <main className="widget collapsed" {...widgetProps}>
        <header className="titlebar compact-titlebar">
          <div className="brand"><span className="brand-mark">✦</span><span>AI 快讯</span></div>
          <span className={`status-dot ${state.error ? 'warning' : state.loading ? 'loading' : ''}`} />
          <span className="compact-status">{state.loading ? '更新中' : lastUpdated}</span>
          <div className="window-actions">
            <button type="button" title="展开" aria-label="展开" onClick={toggleCollapsed}>⌄</button>
            <button type="button" title="隐藏到托盘" aria-label="隐藏到托盘" onClick={hideWindow}>×</button>
          </div>
        </header>
      </main>
    )
  }

  return (
    <main className="widget" {...widgetProps}>
      <header className="titlebar">
        <div className="brand"><span className="brand-mark">✦</span><span>AI 快讯</span></div>
        <div className="window-actions">
          <button type="button" className={settingsOpen ? 'active' : ''} title="设置" aria-label="设置" aria-pressed={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>⚙</button>
          <button type="button" className={state.loading ? 'spinning' : ''} title="立即刷新" aria-label="立即刷新" disabled={state.loading} onClick={() => void window.aiNews.refreshNow()}>↻</button>
          <button type="button" title="折叠" aria-label="折叠" onClick={toggleCollapsed}>⌃</button>
          <button type="button" title="隐藏到托盘" aria-label="隐藏到托盘" onClick={hideWindow}>×</button>
        </div>
      </header>

      {settingsOpen ? (
        <SettingsPanel state={state} updatePreferences={updatePreferences} onClose={() => setSettingsOpen(false)} />
      ) : (
        <div className="content">
          <div className="update-line" role="status">
            <span className={`status-dot ${state.error ? 'warning' : state.loading ? 'loading' : ''}`} />
            <span>{state.loading ? '正在连接新闻源…' : `更新于 ${lastUpdated}`}</span>
            {state.nextRefreshAt && !state.loading && <span className="next-refresh">下次 {clockTime(state.nextRefreshAt)}</span>}
          </div>
          {state.error && <div className="error-banner">{state.error}</div>}

          <div className="sections-layout">
            <section aria-labelledby="weekly-heading">
              <div className="section-heading">
                <div><span className="eyebrow">WEEKLY SIGNAL</span><h1 id="weekly-heading">上周大事件</h1></div>
                <span className="date-range">{weeklyLabel}</span>
              </div>
              <div className="story-list weekly-list">
                {state.weeklyDigest?.events.length ? state.weeklyDigest.events.map((item, index) => (
                  <button className="story-card weekly-card" type="button" key={item.id} onClick={() => openArticle(item)}>
                    <span className="rank">0{index + 1}</span>
                    <span className="story-copy">
                      <span className="story-title">{item.title}</span>
                      <span className="story-meta"><span>{item.publisher}</span><AuthorityBadge authority={item.sourceAuthority} /><span className="coverage-meta">{item.publisherCount} 家媒体</span></span>
                    </span>
                    <span className="external" aria-hidden="true">↗</span>
                  </button>
                )) : <EmptyRows count={2} label={state.loading ? '正在整理上周事件' : '等待生成上周大事件'} />}
              </div>
            </section>

            <div className="divider" />

            <section aria-labelledby="latest-heading">
              <div className="section-heading latest-heading">
                <div><span className="eyebrow">LATEST PULSE</span><h2 id="latest-heading">最新动态</h2></div>
                <span className="live-label"><i /> 两小时刷新</span>
              </div>
              <div className="story-list latest-list">
                {state.latest.length ? state.latest.map((item) => (
                  <button className="story-card latest-card" type="button" key={item.id} onClick={() => openArticle(item)}>
                    <span className={`language-tag ${item.language}`}>{item.language === 'zh' ? '中' : item.language === 'en' ? 'EN' : '•'}</span>
                    <span className="story-copy">
                      <span className="story-title">{item.title}</span>
                      <span className="story-meta"><span>{item.publisher}</span><AuthorityBadge authority={item.sourceAuthority} /><span className="time-meta">{relativeTime(item.publishedAt, now)}</span></span>
                    </span>
                    <span className="external" aria-hidden="true">↗</span>
                  </button>
                )) : <EmptyRows count={3} label={state.loading ? '正在获取最新动态' : '暂时没有可显示的动态'} />}
              </div>
            </section>
          </div>

          <footer>
            <label className="autostart-toggle">
              <input type="checkbox" checked={state.autoStart} onChange={(event) => void window.aiNews.setAutoStart(event.target.checked)} />
              <span className="toggle-track"><span /></span>开机启动
            </label>
            <span className="footer-hint">点击标题查看原报道</span>
          </footer>
        </div>
      )}
      <ResizeHandles />
    </main>
  )
}

const RESIZE_DIRECTIONS: ResizeDirection[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

function ResizeHandles() {
  const startResize = useCallback((event: React.PointerEvent<HTMLSpanElement>, direction: ResizeDirection) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    window.aiNews.startResize(direction, event.screenX, event.screenY)
  }, [])

  const updateResize = useCallback((event: React.PointerEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    if ((event.buttons & 1) === 0) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      window.aiNews.endResize()
      return
    }
    window.aiNews.updateResize(event.screenX, event.screenY)
  }, [])

  const endResize = useCallback((event: React.PointerEvent<HTMLSpanElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    window.aiNews.endResize()
  }, [])

  return <div className="resize-handles" aria-hidden="true">
    {RESIZE_DIRECTIONS.map((direction) => (
      <span
        className={`resize-handle resize-${direction}`}
        key={direction}
        onPointerDown={(event) => startResize(event, direction)}
        onPointerMove={updateResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={() => window.aiNews.endResize()}
      />
    ))}
  </div>
}

function SettingsPanel({ state, updatePreferences, onClose }: {
  state: FeedState
  updatePreferences: (patch: Partial<UserPreferences>) => void
  onClose: () => void
}) {
  const preferences = state.preferences
  return (
    <div className="settings-panel">
      <div className="settings-heading">
        <div><span className="eyebrow">PERSONALIZE</span><h1>自定义设置</h1></div>
        <button type="button" onClick={onClose}>完成</button>
      </div>

      <fieldset>
        <legend>新闻语言</legend>
        <div className="segmented-control">
          {([['mixed', '中英混合'], ['zh', '中文'], ['en', '英文']] as const).map(([value, label]) => (
            <button type="button" key={value} className={preferences.languageMode === value ? 'selected' : ''} onClick={() => updatePreferences({ languageMode: value })}>{label}</button>
          ))}
        </div>
        {preferences.languageMode === 'zh' && <p className="setting-note">中文模式会优先选择官媒和官方发布来源。</p>}
      </fieldset>

      <fieldset>
        <legend>窗口颜色</legend>
        <div className="color-controls">
          <label><span>背景色</span><input type="color" value={preferences.backgroundColor ?? '#f7f9fd'} onChange={(event) => updatePreferences({ backgroundColor: event.target.value })} /></label>
          <label><span>强调色</span><input type="color" value={preferences.accentColor} onChange={(event) => updatePreferences({ accentColor: event.target.value })} /></label>
        </div>
        <button type="button" className={`system-theme-button ${preferences.backgroundColor === null ? 'selected' : ''}`} onClick={() => updatePreferences({ backgroundColor: null })}>
          {preferences.backgroundColor === null ? '✓ 正在跟随系统深浅色' : '改为跟随系统深浅色'}
        </button>
      </fieldset>

      <fieldset>
        <div className="range-heading"><legend>背景透明度</legend><strong>{Math.round(preferences.opacity * 100)}%</strong></div>
        <input className="opacity-range" type="range" min="60" max="100" step="1" value={Math.round(preferences.opacity * 100)} onChange={(event) => updatePreferences({ opacity: Number(event.target.value) / 100 })} />
        <div className="range-labels"><span>更透明</span><span>更清晰</span></div>
      </fieldset>

      <div className="settings-actions">
        <button type="button" onClick={() => void window.aiNews.resetAppearance()}>恢复默认外观</button>
        <button type="button" onClick={() => void window.aiNews.resetWindowSize()}>恢复默认大小</button>
      </div>
    </div>
  )
}

function AuthorityBadge({ authority }: { authority?: SourceAuthority }) {
  if (!authority || authority === 'general') return null
  return <span className={`authority-badge ${authority}`}>{authority === 'official-media' ? '官媒' : '官方'}</span>
}

function EmptyRows({ count, label }: { count: number; label: string }) {
  return <div className="empty-state">{Array.from({ length: count }, (_, index) => <div className="empty-row" key={index}><span /><div><i /><i /></div></div>)}<p>{label}</p></div>
}

type ThemeStyle = CSSProperties & Record<`--${string}`, string | number>

function appearanceFor(preferences: UserPreferences, opacity: number): { style: ThemeStyle; theme?: 'light' | 'dark' } {
  const style: ThemeStyle = { '--accent': preferences.accentColor, '--widget-opacity': opacity }
  if (!preferences.backgroundColor) return { style }
  const [red, green, blue] = hexToRgb(preferences.backgroundColor)
  const dark = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 < 0.53
  const card = dark ? [Math.min(red + 28, 255), Math.min(green + 28, 255), Math.min(blue + 28, 255)] : [255, 255, 255]
  Object.assign(style, {
    '--widget-rgb': `${red}, ${green}, ${blue}`,
    '--card-rgb': card.join(', '),
    '--text-strong': dark ? '#f4f6fb' : '#17233b',
    '--text-body': dark ? '#e1e5ef' : '#263149',
    '--text-muted': dark ? '#aab2c3' : '#778197',
    '--surface-border': dark ? 'rgba(255,255,255,.11)' : 'rgba(67,82,119,.1)',
  })
  return { style, theme: dark ? 'dark' : 'light' }
}

function hexToRgb(value: string): [number, number, number] {
  const normalized = value.replace('#', '')
  return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16)) as [number, number, number]
}

function relativeTime(value: string | null, now: Date): string {
  if (!value) return '尚未更新'
  const difference = now.getTime() - Date.parse(value)
  if (!Number.isFinite(difference)) return '时间未知'
  const minutes = Math.max(0, Math.floor(difference / 60_000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value))
}

function clockTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
