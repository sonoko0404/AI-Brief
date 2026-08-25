import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_PREFERENCES, type NewsItem, type StoredData, type WeeklyDigest, type WindowPlacement } from '../shared/types'
import { sanitizePreferences } from './preferences'
import { classifySource } from './sources'

export const DEFAULT_DATA: StoredData = {
  version: 2,
  allItems: [],
  weeklyDigests: {},
  lastSuccessAt: null,
  nextRefreshAt: null,
  windowPlacement: null,
  expandedHeight: 360,
  collapsed: false,
  autoStartInitialized: false,
  preferences: { ...DEFAULT_PREFERENCES },
}

interface LegacyStoredData {
  version: 1
  allItems?: NewsItem[]
  weeklyDigest?: WeeklyDigest | null
  lastSuccessAt?: string | null
  nextRefreshAt?: string | null
  windowPlacement?: WindowPlacement | null
  expandedHeight?: number
  collapsed?: boolean
  autoStartInitialized?: boolean
}

export class JsonStorage {
  readonly filePath: string
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'ai-news-cache.json')
  }

  async load(): Promise<StoredData> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoredData> | LegacyStoredData
      if (!Array.isArray(parsed.allItems)) throw new Error('缓存格式无效')
      if (parsed.version === 1) return migrateLegacyData(parsed)
      if (parsed.version !== 2) throw new Error('缓存版本无效')
      return normalizeCurrentData(parsed)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') await this.quarantine().catch(() => undefined)
      return structuredClone(DEFAULT_DATA)
    }
  }

  save(data: StoredData): Promise<void> {
    const serialized = JSON.stringify(data, null, 2)
    const operation = this.saveQueue.catch(() => undefined).then(() => this.writeAtomically(serialized))
    this.saveQueue = operation
    return operation
  }

  private async writeAtomically(serialized: string): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, serialized, 'utf8')
    try {
      await rename(temporary, this.filePath)
    } catch {
      await writeFile(this.filePath, serialized, 'utf8')
    }
  }

  private async quarantine(): Promise<void> {
    const target = `${this.filePath}.corrupt-${Date.now()}`
    await rename(this.filePath, target)
  }
}

function migrateLegacyData(legacy: LegacyStoredData): StoredData {
  const legacyPlacement = legacy.windowPlacement ?? null
  const wasOldDefault = legacyPlacement
    && Math.abs(legacyPlacement.width - 380) <= 8
    && Math.abs(legacyPlacement.height - 520) <= 8
  const windowPlacement = wasOldDefault && legacyPlacement
    ? {
        ...legacyPlacement,
        x: legacyPlacement.x + legacyPlacement.width - 280,
        width: 280,
        height: 360,
      }
    : legacyPlacement

  return {
    ...structuredClone(DEFAULT_DATA),
    allItems: annotateItems(legacy.allItems ?? []),
    weeklyDigests: legacy.weeklyDigest ? { mixed: annotateDigest(legacy.weeklyDigest) } : {},
    lastSuccessAt: legacy.lastSuccessAt ?? null,
    nextRefreshAt: legacy.nextRefreshAt ?? null,
    windowPlacement,
    expandedHeight: wasOldDefault ? 360 : Math.max(legacy.expandedHeight ?? windowPlacement?.height ?? 360, 300),
    collapsed: legacy.collapsed ?? false,
    autoStartInitialized: legacy.autoStartInitialized ?? false,
  }
}

function normalizeCurrentData(parsed: Partial<StoredData>): StoredData {
  const data: StoredData = {
    ...structuredClone(DEFAULT_DATA),
    ...parsed,
    version: 2,
    allItems: annotateItems(parsed.allItems ?? []),
    weeklyDigests: parsed.weeklyDigests ?? {},
    preferences: sanitizePreferences(parsed.preferences),
  }
  data.weeklyDigests = Object.fromEntries(
    Object.entries(data.weeklyDigests).map(([mode, digest]) => [mode, digest ? annotateDigest(digest) : digest]),
  )
  return data
}

function annotateItems(items: NewsItem[]): NewsItem[] {
  return items.map((item) => ({
    ...item,
    sourceAuthority: classifySource(item.publisher, item.sourceUrl),
  }))
}

function annotateDigest(digest: WeeklyDigest): WeeklyDigest {
  return {
    ...digest,
    events: digest.events.map((event) => ({
      ...event,
      sourceAuthority: classifySource(event.publisher, event.sourceUrl),
    })),
  }
}
