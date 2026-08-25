import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { JsonStorage } from '../electron/storage'

describe('JSON storage', () => {
  it('round-trips data and returns defaults after quarantining corrupt JSON', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-news-widget-'))
    const storage = new JsonStorage(directory)
    const initial = await storage.load()
    expect(initial.expandedHeight).toBe(360)
    initial.lastSuccessAt = '2026-08-24T12:00:00.000Z'
    await storage.save(initial)
    expect((await storage.load()).lastSuccessAt).toBe(initial.lastSuccessAt)

    await writeFile(storage.filePath, '{bad json', 'utf8')
    expect((await storage.load()).lastSuccessAt).toBeNull()
    const directoryFiles = await readdir(directory)
    expect(directoryFiles.some((name) => name.startsWith(`${path.basename(storage.filePath)}.corrupt-`))).toBe(true)
  })

  it('migrates the v1 default window and mixed weekly digest without losing cached news', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-news-widget-migration-'))
    const storage = new JsonStorage(directory)
    await writeFile(storage.filePath, JSON.stringify({
      version: 1,
      allItems: [{
        id: 'legacy', title: '新华社发布人工智能治理新消息', publisher: '新华网',
        language: 'zh', url: 'https://news.cn/ai', publishedAt: '2026-08-20T00:00:00Z',
        fetchedAt: '2026-08-20T00:00:00Z', fingerprint: 'legacy',
      }],
      weeklyDigest: {
        weekStart: '2026-08-17T07:00:00Z', weekEnd: '2026-08-24T07:00:00Z',
        generatedAt: '2026-08-24T19:00:00Z', events: [],
      },
      windowPlacement: { x: 20, y: 30, width: 382, height: 522 },
      expandedHeight: 522,
      collapsed: false,
      autoStartInitialized: true,
    }), 'utf8')

    const migrated = await storage.load()
    expect(migrated.version).toBe(2)
    expect(migrated.windowPlacement).toMatchObject({ x: 122, y: 30, width: 280, height: 360 })
    expect(migrated.expandedHeight).toBe(360)
    expect(migrated.weeklyDigests.mixed?.events).toEqual([])
    expect(migrated.allItems[0].sourceAuthority).toBe('official-media')
    expect(migrated.preferences.languageMode).toBe('mixed')
  })

  it('preserves a window size that was clearly customized in v1', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-news-widget-custom-size-'))
    const storage = new JsonStorage(directory)
    await writeFile(storage.filePath, JSON.stringify({
      version: 1, allItems: [], windowPlacement: { x: 40, y: 50, width: 600, height: 430 }, expandedHeight: 430,
    }), 'utf8')
    expect((await storage.load()).windowPlacement).toEqual({ x: 40, y: 50, width: 600, height: 430 })
  })

  it('serializes rapid preference saves so the last slider value wins', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-news-widget-save-order-'))
    const storage = new JsonStorage(directory)
    const first = await storage.load()
    const second = structuredClone(first)
    first.preferences.opacity = 0.61
    second.preferences.opacity = 0.88
    await Promise.all([storage.save(first), storage.save(second)])
    expect((await storage.load()).preferences.opacity).toBe(0.88)
  })
})
