import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import type { Language, LanguageMode, NewsItem, WeeklyEvent } from '../shared/types'
import { authorityRank, classifySource } from './sources'
import { localDateKey } from './time'

const EN_TERMS = '"artificial intelligence" OR "generative AI" OR "large language model" OR OpenAI OR Anthropic OR Claude OR Gemini OR "NVIDIA AI"'
const ZH_TERMS = '人工智能 OR 生成式AI OR 大模型 OR 机器学习 OR OpenAI OR Anthropic OR Claude OR Gemini OR 英伟达AI'
const ZH_OFFICIAL_TERMS = '(人工智能 OR 大模型 OR 生成式AI) (site:news.cn OR site:people.com.cn OR site:cctv.com OR site:gov.cn OR site:cas.cn OR site:miit.gov.cn OR site:most.gov.cn)'

const REQUIRED_PATTERNS = [
  /artificial intelligence/i,
  /generative ai/i,
  /large language model/i,
  /machine learning/i,
  /\b(OpenAI|Anthropic|ChatGPT|Claude|Gemini)\b/i,
  /NVIDIA.{0,12}\bAI\b|\bAI\b.{0,12}NVIDIA/i,
  /人工智能|生成式\s*AI|大模型|机器学习|神经网络|英伟达.{0,8}AI/i,
]

const ENTITY_PATTERNS = [
  'openai', 'anthropic', 'chatgpt', 'claude', 'gemini', 'nvidia', '英伟达',
  'microsoft', '微软', 'google', '谷歌', 'meta', 'apple', '苹果', 'deepseek', '深度求索',
]

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'into', 'from', 'have', 'this', 'that', 'with',
  'will', 'your', 'their', 'says', 'said', 'over', 'under', 'more', 'than', 'what', 'when',
  'the', 'and', 'for', 'are', 'its', 'new', 'why', 'how', 'who', '人工智能', '生成式', '大模型',
])

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
  processEntities: true,
})

export interface FetchResult {
  items: NewsItem[]
  successfulSources: number
  errors: string[]
}

interface FeedDefinition {
  name: string
  language: Language
  url: string
}

export function buildLatestFeeds(): FeedDefinition[] {
  return [
    googleFeed('Google News 中文官方', 'zh', `${ZH_OFFICIAL_TERMS} when:2d`, 'zh-CN', 'CN', 'CN:zh-Hans'),
    googleFeed('Google News 中文', 'zh', `${ZH_TERMS} when:2d`, 'zh-CN', 'CN', 'CN:zh-Hans'),
    googleFeed('Google News English', 'en', `${EN_TERMS} when:2d`, 'en-US', 'US', 'US:en'),
    bingFeed('Bing News 中文官方', 'zh', ZH_OFFICIAL_TERMS, 'zh-CN'),
    bingFeed('Bing News 中文', 'zh', ZH_TERMS, 'zh-CN'),
    bingFeed('Bing News English', 'en', EN_TERMS, 'en-US'),
  ]
}

export function buildWeeklyFeeds(start: Date, end: Date): FeedDefinition[] {
  const range = `after:${localDateKey(start)} before:${localDateKey(end)}`
  return [
    googleFeed('Google News 中文官方', 'zh', `${ZH_OFFICIAL_TERMS} ${range}`, 'zh-CN', 'CN', 'CN:zh-Hans'),
    googleFeed('Google News 中文', 'zh', `${ZH_TERMS} ${range}`, 'zh-CN', 'CN', 'CN:zh-Hans'),
    googleFeed('Google News English', 'en', `${EN_TERMS} ${range}`, 'en-US', 'US', 'US:en'),
    bingFeed('Bing News 中文官方', 'zh', ZH_OFFICIAL_TERMS, 'zh-CN'),
    bingFeed('Bing News 中文', 'zh', ZH_TERMS, 'zh-CN'),
    bingFeed('Bing News English', 'en', EN_TERMS, 'en-US'),
  ]
}

function googleFeed(name: string, language: Language, query: string, hl: string, gl: string, ceid: string): FeedDefinition {
  const url = new URL('https://news.google.com/rss/search')
  url.searchParams.set('q', query)
  url.searchParams.set('hl', hl)
  url.searchParams.set('gl', gl)
  url.searchParams.set('ceid', ceid)
  return { name, language, url: url.toString() }
}

function bingFeed(name: string, language: Language, query: string, market: string): FeedDefinition {
  const url = new URL('https://www.bing.com/news/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'rss')
  url.searchParams.set('mkt', market)
  return { name, language, url: url.toString() }
}

export async function fetchFeeds(feeds: FeedDefinition[], now = new Date()): Promise<FetchResult> {
  const settled = await Promise.allSettled(feeds.map(async (feed) => {
    const response = await fetch(feed.url, {
      headers: { 'User-Agent': 'AI-News-Widget/1.0 (+desktop RSS reader)' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`)
    const xml = await response.text()
    return parseRss(xml, feed.language, feed.name, now)
  }))

  const items: NewsItem[] = []
  const errors: string[] = []
  let successfulSources = 0
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulSources += 1
      items.push(...result.value)
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
      errors.push(message || `${feeds[index].name}: 未知错误`)
    }
  })

  return { items: deduplicateExact(items), successfulSources, errors }
}

export function parseRss(xml: string, fallbackLanguage: Language, fallbackPublisher: string, now = new Date()): NewsItem[] {
  const parsed = parser.parse(xml)
  const rawItems = toArray(parsed?.rss?.channel?.item ?? parsed?.feed?.entry)

  return rawItems.flatMap((raw: Record<string, unknown>) => {
    const rawTitle = textValue(raw.title)
    const rawLink = extractLink(raw.link)
    if (!rawTitle || !isSafeHttpUrl(rawLink)) return []

    const publisher = textValue(raw.source) || extractPublisherFromTitle(rawTitle) || fallbackPublisher
    const sourceUrl = sourceUrlValue(raw.source)
    const title = cleanTitle(rawTitle, publisher)
    if (!isRelevantTitle(title)) return []

    const dateText = textValue(raw.pubDate) || textValue(raw.published) || textValue(raw.updated)
    const parsedDate = new Date(dateText)
    const publishedAt = Number.isNaN(parsedDate.getTime()) ? now : parsedDate
    const language = detectLanguage(title, fallbackLanguage)
    const normalizedUrl = normalizeUrl(rawLink)
    const fingerprint = makeFingerprint(title)
    const id = createHash('sha256').update(`${normalizedUrl}|${title}`).digest('hex').slice(0, 20)

    return [{
      id,
      title,
      url: normalizedUrl,
      publisher,
      ...(sourceUrl ? { sourceUrl } : {}),
      sourceAuthority: classifySource(publisher, sourceUrl),
      language,
      publishedAt: publishedAt.toISOString(),
      fetchedAt: now.toISOString(),
      fingerprint,
    }]
  })
}

export function mergeNews(existing: NewsItem[], incoming: NewsItem[], now = new Date()): NewsItem[] {
  const cutoff = now.getTime() - 60 * 24 * 60 * 60 * 1000
  const map = new Map<string, NewsItem>()
  for (const item of [...existing, ...incoming]) {
    if (new Date(item.publishedAt).getTime() < cutoff) continue
    const key = `${normalizeUrl(item.url)}|${normalizeTitle(item.title)}`
    const current = map.get(key)
    if (!current || new Date(item.fetchedAt) > new Date(current.fetchedAt)) map.set(key, item)
  }
  return [...map.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}

export function selectLatest(items: NewsItem[], limit = 3, languageMode: LanguageMode = 'mixed', now = new Date()): NewsItem[] {
  const filtered = filterByLanguage(items, languageMode)
  const clusters = clusterNews(filtered, languageMode === 'zh')
    .sort((a, b) => Date.parse(b.representative.publishedAt) - Date.parse(a.representative.publishedAt))

  if (languageMode !== 'zh') return clusters.slice(0, limit).map((cluster) => cluster.representative)

  const cutoff = now.getTime() - 48 * 60 * 60 * 1000
  const recent = clusters.filter((cluster) => Date.parse(cluster.representative.publishedAt) >= cutoff)
  const recentOfficial = recent.filter((cluster) => authorityRank(cluster.representative.sourceAuthority) > 0)
  const recentGeneral = recent.filter((cluster) => authorityRank(cluster.representative.sourceAuthority) === 0)
  const recentIds = new Set(recent.map((cluster) => cluster.representative.id))
  const older = clusters.filter((cluster) => !recentIds.has(cluster.representative.id))

  return [...recentOfficial, ...recentGeneral, ...older]
    .slice(0, limit)
    .map((cluster) => cluster.representative)
}

export function selectWeeklyEvents(items: NewsItem[], start: Date, end: Date, limit = 2, languageMode: LanguageMode = 'mixed'): WeeklyEvent[] {
  const inRange = filterByLanguage(items, languageMode).filter((item) => {
    const time = Date.parse(item.publishedAt)
    return time >= start.getTime() && time < end.getTime()
  })

  return clusterNews(inRange, languageMode === 'zh')
    .map((cluster) => {
      const publishers = new Set(cluster.items.map((item) => item.publisher.toLocaleLowerCase()))
      return {
        ...cluster.representative,
        articleCount: cluster.items.length,
        publisherCount: publishers.size,
        officialCount: cluster.items.filter((item) => authorityRank(item.sourceAuthority) > 0).length,
      }
    })
    .sort((a, b) =>
      b.publisherCount - a.publisherCount
      || (languageMode === 'zh' ? b.officialCount - a.officialCount : 0)
      || b.articleCount - a.articleCount
      || Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    )
    .slice(0, limit)
    .map(({ officialCount: _officialCount, ...event }) => event)
}

interface NewsCluster {
  representative: NewsItem
  items: NewsItem[]
}

export function clusterNews(items: NewsItem[], preferOfficial = false): NewsCluster[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  const clusters: NewsCluster[] = []
  for (const item of sorted) {
    const match = clusters.find((cluster) => isSameEvent(item, cluster.representative))
    if (match) {
      match.items.push(item)
    } else {
      clusters.push({ representative: item, items: [item] })
    }
  }
  if (preferOfficial) {
    for (const cluster of clusters) cluster.representative = pickOfficialRepresentative(cluster.items)
  }
  return clusters
}

export function isSameEvent(a: NewsItem, b: NewsItem): boolean {
  if (a.id === b.id || normalizeUrl(a.url) === normalizeUrl(b.url)) return true
  const aTokens = eventTokens(a.title)
  const bTokens = eventTokens(b.title)
  const lexical = jaccard(aTokens, bTokens)
  const aEntities = entities(a.title)
  const bEntities = entities(b.title)
  const entityScore = aEntities.size && bEntities.size ? jaccard(aEntities, bEntities) : 0
  return lexical >= 0.48 || (lexical >= 0.28 && entityScore >= 0.5)
}

export function isRelevantTitle(title: string): boolean {
  return REQUIRED_PATTERNS.some((pattern) => pattern.test(title))
}

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value)
    ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach((key) => url.searchParams.delete(key))
    url.hash = ''
    return url.toString()
  } catch {
    return value.trim()
  }
}

export function makeFingerprint(title: string): string {
  return createHash('sha1').update([...eventTokens(title)].sort().join('|')).digest('hex').slice(0, 16)
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function cleanTitle(title: string, publisher: string): string {
  const compact = decodeEntities(title).replace(/\s+/g, ' ').trim()
  const suffix = ` - ${publisher}`.toLocaleLowerCase()
  return compact.toLocaleLowerCase().endsWith(suffix)
    ? compact.slice(0, compact.length - suffix.length).trim()
    : compact
}

function extractPublisherFromTitle(title: string): string {
  const parts = title.split(' - ')
  return parts.length > 1 ? parts.at(-1)?.trim() ?? '' : ''
}

function detectLanguage(title: string, fallback: Language): Language {
  const cjk = (title.match(/[\u3400-\u9fff]/g) ?? []).length
  if (cjk >= 2) return 'zh'
  const latin = (title.match(/[A-Za-z]/g) ?? []).length
  if (latin >= 3) return 'en'
  return fallback
}

function extractLink(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return textValue(record['@_href']) || textValue(record['#text'])
  }
  return ''
}

function sourceUrlValue(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  const candidate = record['@_url'] ?? record['@_href']
  return typeof candidate === 'string' && isSafeHttpUrl(candidate) ? normalizeUrl(candidate) : ''
}

function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const nested = record['#text'] ?? record['@_url']
    return typeof nested === 'string' || typeof nested === 'number' ? String(nested).trim() : ''
  }
  return ''
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function normalizeTitle(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '')
}

function eventTokens(title: string): Set<string> {
  const normalized = title.toLocaleLowerCase().normalize('NFKC')
  const result = new Set<string>()
  for (const word of normalized.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []) {
    if (!STOP_WORDS.has(word)) result.add(word)
  }
  const chunks = normalized.match(/[\u3400-\u9fff]{2,}/g) ?? []
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length - 1; index += 1) result.add(chunk.slice(index, index + 2))
  }
  return result
}

function entities(title: string): Set<string> {
  const normalized = title.toLocaleLowerCase()
  return new Set(ENTITY_PATTERNS.filter((entity) => normalized.includes(entity)))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const value of a) if (b.has(value)) intersection += 1
  return intersection / (a.size + b.size - intersection)
}

function deduplicateExact(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${normalizeUrl(item.url)}|${normalizeTitle(item.title)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function filterByLanguage(items: NewsItem[], languageMode: LanguageMode): NewsItem[] {
  if (languageMode === 'mixed') return items
  return items.filter((item) => item.language === languageMode)
}

function pickOfficialRepresentative(items: NewsItem[]): NewsItem {
  return [...items].sort((a, b) =>
    authorityRank(b.sourceAuthority) - authorityRank(a.sourceAuthority)
    || Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  )[0]
}
