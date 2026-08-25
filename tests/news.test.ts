import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { NewsItem } from '../shared/types'
import {
  isRelevantTitle,
  isSameEvent,
  mergeNews,
  normalizeUrl,
  parseRss,
  selectLatest,
  selectWeeklyEvents,
} from '../electron/news'

const fixture = readFileSync(new URL('./fixtures/google-news.xml', import.meta.url), 'utf8')

describe('RSS parsing and filtering', () => {
  it('parses relevant Chinese and English entries and rejects unsafe or unrelated entries', () => {
    const items = parseRss(fixture, 'en', 'Fallback', new Date('2026-08-24T00:00:00Z'))
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      title: 'OpenAI announces a new artificial intelligence model',
      publisher: 'Example News',
      language: 'en',
      url: 'https://example.com/openai-model',
    })
    expect(items[1].language).toBe('zh')
  })

  it('requires an explicit AI subject instead of the letters appearing inside another word', () => {
    expect(isRelevantTitle('OpenAI releases a new model')).toBe(true)
    expect(isRelevantTitle('The chairperson announced quarterly results')).toBe(false)
  })

  it('removes common tracking parameters but keeps useful query values', () => {
    expect(normalizeUrl('https://news.example/x?id=3&utm_campaign=test#top')).toBe('https://news.example/x?id=3')
  })
})

describe('event deduplication and ranking', () => {
  it('groups similar coverage while keeping unrelated events apart', () => {
    const first = item('1', 'OpenAI launches new artificial intelligence reasoning model', 'Wire A', '2026-08-20T12:00:00Z')
    const duplicate = item('2', 'OpenAI launches its new AI reasoning model worldwide', 'Wire B', '2026-08-20T13:00:00Z')
    const other = item('3', 'Anthropic updates Claude safety policies', 'Wire C', '2026-08-20T14:00:00Z')
    expect(isSameEvent(first, duplicate)).toBe(true)
    expect(isSameEvent(first, other)).toBe(false)
    expect(selectLatest([first, duplicate, other])).toHaveLength(2)
  })

  it('ranks weekly events by unique publisher coverage before article count', () => {
    const start = new Date('2026-08-17T00:00:00Z')
    const end = new Date('2026-08-24T00:00:00Z')
    const items = [
      item('1', 'OpenAI launches new artificial intelligence reasoning model', 'A', '2026-08-20T10:00:00Z'),
      item('2', 'OpenAI launches its new AI reasoning model', 'B', '2026-08-20T11:00:00Z'),
      item('3', 'Anthropic updates Claude artificial intelligence safety policy', 'C', '2026-08-21T10:00:00Z'),
      item('4', 'Anthropic updates Claude AI safety policy for developers', 'C', '2026-08-21T11:00:00Z'),
      item('5', 'Anthropic updates its Claude AI safety policy', 'C', '2026-08-21T12:00:00Z'),
    ]
    const ranked = selectWeeklyEvents(items, start, end)
    expect(ranked).toHaveLength(2)
    expect(ranked[0].publisherCount).toBe(2)
    expect(ranked[0].title).toContain('OpenAI')
  })

  it('keeps only sixty days of cache and prefers the newest fetched duplicate', () => {
    const now = new Date('2026-08-24T00:00:00Z')
    const old = item('old', 'OpenAI artificial intelligence archive', 'A', '2026-05-01T00:00:00Z')
    const recent = item('recent', 'OpenAI artificial intelligence update', 'A', '2026-08-23T00:00:00Z')
    const updated = { ...recent, fetchedAt: '2026-08-24T00:00:00Z', publisher: 'Updated A' }
    expect(mergeNews([old, recent], [updated], now)).toEqual([updated])
  })

  it('puts recent official Chinese sources first and falls back to general sources', () => {
    const now = new Date('2026-08-24T20:00:00Z')
    const official = { ...item('official', '新华社发布人工智能治理新方案', '新华网', '2026-08-24T14:00:00Z'), language: 'zh' as const, sourceAuthority: 'official-media' as const }
    const account = { ...item('account', '工信微报介绍人工智能产业政策', '工信微报', '2026-08-24T13:00:00Z'), language: 'zh' as const, sourceAuthority: 'official-account' as const }
    const newestGeneral = { ...item('general', '商业媒体报道人工智能市场新变化', '商业媒体', '2026-08-24T19:00:00Z'), language: 'zh' as const, sourceAuthority: 'general' as const }
    const selected = selectLatest([newestGeneral, account, official], 3, 'zh', now)
    expect(selected.map((entry) => entry.id)).toEqual(['official', 'account', 'general'])
  })

  it('filters by selected language while mixed mode preserves time-first behavior', () => {
    const english = item('english', 'OpenAI artificial intelligence English update', 'A', '2026-08-24T19:00:00Z')
    const chinese = { ...item('chinese', '人工智能中文动态更新', 'B', '2026-08-24T18:00:00Z'), language: 'zh' as const }
    expect(selectLatest([chinese, english], 3, 'en').map((entry) => entry.id)).toEqual(['english'])
    expect(selectLatest([chinese, english], 3, 'mixed').map((entry) => entry.id)).toEqual(['english', 'chinese'])
  })

  it('uses an official Chinese article as the representative link for the same weekly event', () => {
    const start = new Date('2026-08-17T00:00:00Z')
    const end = new Date('2026-08-24T00:00:00Z')
    const general = { ...item('general-new', '中国发布全新人工智能产业发展行动方案', '商业媒体', '2026-08-20T14:00:00Z'), language: 'zh' as const, sourceAuthority: 'general' as const }
    const official = { ...item('official-old', '新华社：中国发布人工智能产业发展行动方案', '新华网', '2026-08-20T12:00:00Z'), language: 'zh' as const, sourceAuthority: 'official-media' as const }
    const second = { ...item('second', '工信微报公布生成式AI服务新进展', '工信微报', '2026-08-21T12:00:00Z'), language: 'zh' as const, sourceAuthority: 'official-account' as const }
    const events = selectWeeklyEvents([general, official, second], start, end, 2, 'zh')
    expect(events.find((event) => event.title.includes('行动方案'))?.id).toBe('official-old')
  })
})

function item(id: string, title: string, publisher: string, publishedAt: string): NewsItem {
  return {
    id,
    title,
    publisher,
    publishedAt,
    fetchedAt: publishedAt,
    language: 'en',
    url: `https://example.com/${id}`,
    fingerprint: id,
  }
}
