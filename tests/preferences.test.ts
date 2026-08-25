import { describe, expect, it } from 'vitest'
import { mergePreferences, sanitizePreferences } from '../electron/preferences'
import { DEFAULT_PREFERENCES } from '../shared/types'

describe('user preference validation', () => {
  it('accepts valid appearance and language choices', () => {
    expect(sanitizePreferences({
      languageMode: 'zh', backgroundColor: '#123ABC', accentColor: '#ff8800', opacity: 0.72,
    })).toEqual({ languageMode: 'zh', backgroundColor: '#123abc', accentColor: '#ff8800', opacity: 0.72 })
  })

  it('rejects invalid colors and clamps opacity to the readable range', () => {
    expect(sanitizePreferences({ languageMode: 'unknown', backgroundColor: 'red', accentColor: '#xyz', opacity: 0.2 }))
      .toEqual({ ...DEFAULT_PREFERENCES, opacity: 0.6 })
    expect(mergePreferences(DEFAULT_PREFERENCES, { opacity: 4 }).opacity).toBe(1)
  })
})
