import { describe, expect, it } from 'vitest'
import { classifySource } from '../electron/sources'

describe('Chinese source authority classification', () => {
  it('recognizes official media by publisher name or domain', () => {
    expect(classifySource('新华网')).toBe('official-media')
    expect(classifySource('未知媒体', 'https://tech.people.com.cn/article')).toBe('official-media')
  })

  it('recognizes government, institution and official company sources', () => {
    expect(classifySource('工信微报')).toBe('official-account')
    expect(classifySource('某发布平台', 'https://www.miit.gov.cn/news')).toBe('official-account')
    expect(classifySource('OpenAI')).toBe('official-account')
  })

  it('does not label an unrelated publisher as official', () => {
    expect(classifySource('商业科技观察')).toBe('general')
  })
})
