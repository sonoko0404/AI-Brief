import { describe, expect, it } from 'vitest'
import { effectiveOpacity } from '../src/appearance'

describe('effectiveOpacity', () => {
  it('uses the saved opacity while the pointer is inside', () => {
    expect(effectiveOpacity(0.96, true)).toBe(0.96)
    expect(effectiveOpacity(0.8, true)).toBe(0.8)
  })

  it('reduces opacity by 20 percentage points while the pointer is away', () => {
    expect(effectiveOpacity(0.96, false)).toBe(0.76)
    expect(effectiveOpacity(0.8, false)).toBe(0.6)
    expect(effectiveOpacity(0.6, false)).toBe(0.4)
  })

  it('never becomes more than 90 percent transparent', () => {
    expect(effectiveOpacity(0.2, false)).toBe(0.1)
    expect(effectiveOpacity(0.05, false)).toBe(0.1)
  })

  it('normalizes invalid values without changing persisted preferences', () => {
    expect(effectiveOpacity(Number.NaN, false)).toBe(0.76)
    expect(effectiveOpacity(1.4, true)).toBe(1)
  })
})
