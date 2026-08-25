import { DEFAULT_PREFERENCES, type LanguageMode, type UserPreferences } from '../shared/types'

const LANGUAGE_MODES = new Set<LanguageMode>(['mixed', 'zh', 'en'])
const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function sanitizePreferences(value: unknown): UserPreferences {
  const candidate = value && typeof value === 'object' ? value as Partial<UserPreferences> : {}
  return {
    languageMode: LANGUAGE_MODES.has(candidate.languageMode as LanguageMode)
      ? candidate.languageMode as LanguageMode
      : DEFAULT_PREFERENCES.languageMode,
    backgroundColor: candidate.backgroundColor === null || candidate.backgroundColor === undefined
      ? null
      : sanitizeColor(candidate.backgroundColor, null),
    accentColor: sanitizeColor(candidate.accentColor, DEFAULT_PREFERENCES.accentColor) ?? DEFAULT_PREFERENCES.accentColor,
    opacity: clampOpacity(candidate.opacity),
  }
}

export function mergePreferences(current: UserPreferences, patch: Partial<UserPreferences>): UserPreferences {
  return sanitizePreferences({ ...current, ...patch })
}

function sanitizeColor(value: unknown, fallback: string | null): string | null {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) return fallback
  return value.toLocaleLowerCase()
}

function clampOpacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PREFERENCES.opacity
  return Math.min(1, Math.max(0.6, Math.round(value * 100) / 100))
}
