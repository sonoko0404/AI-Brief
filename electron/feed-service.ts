import { DEFAULT_PREFERENCES, type FeedState, type LanguageMode, type StoredData, type UserPreferences, type WeeklyDigest } from '../shared/types'
import { buildLatestFeeds, buildWeeklyFeeds, fetchFeeds, mergeNews, selectLatest, selectWeeklyEvents } from './news'
import { mergePreferences } from './preferences'
import { isWeeklyDigestDue, nextMondayNoon, previousFullWeek } from './time'
import type { JsonStorage } from './storage'

const TWO_HOURS = 2 * 60 * 60 * 1000
const RETRY_DELAYS = [5, 15, 30].map((minutes) => minutes * 60 * 1000)
const LANGUAGE_MODES: LanguageMode[] = ['mixed', 'zh', 'en']

interface FeedServiceOptions {
  storage: JsonStorage
  data: StoredData
  getAutoStart: () => boolean
  onState: (state: FeedState) => void
}

export class FeedService {
  private readonly storage: JsonStorage
  private readonly getAutoStart: () => boolean
  private readonly onState: (state: FeedState) => void
  private refreshTimer: NodeJS.Timeout | null = null
  private weeklyTimer: NodeJS.Timeout | null = null
  private retryIndex = 0
  private refreshing = false
  private error: string | null = null
  data: StoredData

  constructor(options: FeedServiceOptions) {
    this.storage = options.storage
    this.data = options.data
    this.getAutoStart = options.getAutoStart
    this.onState = options.onState
  }

  start(): void {
    this.emit()
    void this.refreshNow()
    this.scheduleWeeklyCheck()
  }

  stop(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    if (this.weeklyTimer) clearTimeout(this.weeklyTimer)
  }

  getState(): FeedState {
    const languageMode = this.data.preferences.languageMode
    return {
      latest: selectLatest(this.data.allItems, 3, languageMode),
      weeklyDigest: this.data.weeklyDigests[languageMode] ?? null,
      lastSuccessAt: this.data.lastSuccessAt,
      nextRefreshAt: this.data.nextRefreshAt,
      loading: this.refreshing,
      error: this.error,
      autoStart: this.getAutoStart(),
      collapsed: this.data.collapsed,
      preferences: this.data.preferences,
    }
  }

  async refreshNow(): Promise<void> {
    if (this.refreshing) return
    this.refreshing = true
    this.error = null
    this.emit()

    try {
      const now = new Date()
      const feeds = buildLatestFeeds()
      const result = await fetchFeeds(feeds, now)
      if (result.successfulSources === 0) throw new Error(result.errors[0] || '所有新闻源均不可用')

      this.data.allItems = mergeNews(this.data.allItems, result.items, now)
      this.data.lastSuccessAt = now.toISOString()
      this.data.nextRefreshAt = new Date(now.getTime() + TWO_HOURS).toISOString()
      this.retryIndex = 0
      this.error = result.errors.length ? `部分新闻源暂时不可用（${result.errors.length}/${feeds.length}）` : null
      await this.storage.save(this.data)
      this.scheduleRefresh(TWO_HOURS)
    } catch (error) {
      const delay = RETRY_DELAYS[Math.min(this.retryIndex, RETRY_DELAYS.length - 1)]
      this.retryIndex += 1
      this.data.nextRefreshAt = new Date(Date.now() + delay).toISOString()
      this.error = `更新失败，将自动重试：${friendlyError(error)}`
      await this.storage.save(this.data).catch(() => undefined)
      this.scheduleRefresh(delay)
    } finally {
      this.refreshing = false
      this.emit()
    }

    await this.ensureWeeklyDigest().catch((error) => {
      this.error = `周报暂未更新：${friendlyError(error)}`
      this.emit()
    })
  }

  async ensureFreshAfterWake(): Promise<void> {
    const last = this.data.lastSuccessAt ? Date.parse(this.data.lastSuccessAt) : 0
    if (Date.now() - last >= TWO_HOURS) await this.refreshNow()
    else await this.ensureWeeklyDigest().catch(() => undefined)
  }

  async ensureWeeklyDigest(): Promise<void> {
    const now = new Date()
    const dueModes = LANGUAGE_MODES.filter((mode) => isWeeklyDigestDue(now, this.data.weeklyDigests[mode]?.weekStart))
    if (!dueModes.length) return

    const range = previousFullWeek(now)
    const result = await fetchFeeds(buildWeeklyFeeds(range.start, range.end), now)
    if (result.successfulSources === 0) throw new Error(result.errors[0] || '周报新闻源不可用')

    const merged = mergeNews(this.data.allItems, result.items, now)
    let updatedModes = 0
    for (const mode of dueModes) {
      const events = selectWeeklyEvents(merged, range.start, range.end, 2, mode)
      if (events.length < 2) continue
      const digest: WeeklyDigest = {
        weekStart: range.start.toISOString(),
        weekEnd: range.end.toISOString(),
        generatedAt: now.toISOString(),
        events,
      }
      this.data.weeklyDigests[mode] = digest
      updatedModes += 1
    }
    if (!updatedModes) throw new Error('本周可靠事件不足 2 条，已保留上一份周报')
    this.data.allItems = merged
    await this.storage.save(this.data)
    this.emit()
  }

  async setCollapsed(collapsed: boolean): Promise<void> {
    this.data.collapsed = collapsed
    await this.storage.save(this.data)
    this.emit()
  }

  async persist(): Promise<void> {
    await this.storage.save(this.data)
    this.emit()
  }

  async updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
    this.data.preferences = mergePreferences(this.data.preferences, patch)
    await this.storage.save(this.data)
    this.emit()
    if (!this.data.weeklyDigests[this.data.preferences.languageMode]) {
      void this.ensureWeeklyDigest().catch(() => undefined)
    }
    return this.data.preferences
  }

  async resetAppearance(): Promise<UserPreferences> {
    return this.updatePreferences({
      backgroundColor: DEFAULT_PREFERENCES.backgroundColor,
      accentColor: DEFAULT_PREFERENCES.accentColor,
      opacity: DEFAULT_PREFERENCES.opacity,
    })
  }

  notifySettingsChanged(): void {
    this.emit()
  }

  private scheduleRefresh(delay: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => void this.refreshNow(), Math.max(1_000, delay))
  }

  private scheduleWeeklyCheck(): void {
    if (this.weeklyTimer) clearTimeout(this.weeklyTimer)
    const delay = nextMondayNoon(new Date()).getTime() - Date.now()
    this.weeklyTimer = setTimeout(async () => {
      await this.ensureWeeklyDigest().catch((error) => {
        this.error = `周报暂未更新：${friendlyError(error)}`
        this.emit()
      })
      this.scheduleWeeklyCheck()
    }, Math.max(1_000, delay))
  }

  private emit(): void {
    this.onState(this.getState())
  }
}

function friendlyError(error: unknown): string {
  if (!(error instanceof Error)) return '未知错误'
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return '连接超时'
  if (/fetch failed/i.test(error.message)) return '无法连接新闻源'
  return error.message.slice(0, 120)
}
