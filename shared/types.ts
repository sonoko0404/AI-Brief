export type Language = 'zh' | 'en' | 'other'
export type LanguageMode = 'mixed' | 'zh' | 'en'
export type SourceAuthority = 'official-media' | 'official-account' | 'general'

export interface UserPreferences {
  languageMode: LanguageMode
  backgroundColor: string | null
  accentColor: string
  opacity: number
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  languageMode: 'mixed',
  backgroundColor: null,
  accentColor: '#6558ef',
  opacity: 0.96,
}

export interface NewsItem {
  id: string
  title: string
  url: string
  publisher: string
  sourceUrl?: string
  sourceAuthority?: SourceAuthority
  language: Language
  publishedAt: string
  fetchedAt: string
  fingerprint: string
}

export interface WeeklyEvent extends NewsItem {
  articleCount: number
  publisherCount: number
}

export interface WeeklyDigest {
  weekStart: string
  weekEnd: string
  generatedAt: string
  events: WeeklyEvent[]
}

export interface FeedState {
  latest: NewsItem[]
  weeklyDigest: WeeklyDigest | null
  lastSuccessAt: string | null
  nextRefreshAt: string | null
  loading: boolean
  error: string | null
  autoStart: boolean
  collapsed: boolean
  preferences: UserPreferences
}

export interface WindowPlacement {
  x: number
  y: number
  width: number
  height: number
}

export interface StoredData {
  version: 2
  allItems: NewsItem[]
  weeklyDigests: Partial<Record<LanguageMode, WeeklyDigest>>
  lastSuccessAt: string | null
  nextRefreshAt: string | null
  windowPlacement: WindowPlacement | null
  expandedHeight: number
  collapsed: boolean
  autoStartInitialized: boolean
  preferences: UserPreferences
}

export interface AINewsAPI {
  getState: () => Promise<FeedState>
  onState: (listener: (state: FeedState) => void) => () => void
  refreshNow: () => Promise<void>
  openArticle: (url: string) => Promise<boolean>
  toggleCollapsed: () => Promise<boolean>
  hideWindow: () => Promise<void>
  setAutoStart: (enabled: boolean) => Promise<boolean>
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<UserPreferences>
  resetAppearance: () => Promise<UserPreferences>
  resetWindowSize: () => Promise<void>
  notifyOnline: () => void
}
