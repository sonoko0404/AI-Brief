import type { SourceAuthority } from '../shared/types'

const OFFICIAL_MEDIA_NAMES = [
  '新华社', '新华网', '人民日报', '人民网', '中央广播电视总台', '央视新闻', '央视网',
  '央广网', '中国国际广播电台', '中国日报', '中国日报网', '中国新闻网', '中新网',
  '光明日报', '光明网', '经济日报', '中国经济网', '科技日报', '中国网', '中国青年报',
  '中国青年网', '法治日报', '工人日报', '农民日报', '参考消息', '环球时报',
]

const OFFICIAL_ACCOUNT_NAMES = [
  '中国政府网', '国务院客户端', '网信中国', '国家网信办', '科技部', '锐科技',
  '工业和信息化部', '工信微报', '国家发展改革委', '国家数据局', '教育部', '微言教育',
  '国务院国资委', '国资小新', '中国科学院', '中科院之声', '中国工程院',
  '中国信通院', '中国信息通信研究院', 'caict', '国家自然科学基金委员会',
  'openai', 'anthropic', 'google deepmind', 'google ai', 'meta ai', 'nvidia', '英伟达',
  'deepseek', '深度求索',
]

const OFFICIAL_MEDIA_DOMAINS = [
  'news.cn', 'xinhuanet.com', 'people.com.cn', 'cctv.com', 'cntv.cn', 'cnr.cn',
  'chinadaily.com.cn', 'chinanews.com.cn', 'chinanews.com', 'gmw.cn', 'ce.cn',
  'china.com.cn', 'youth.cn', 'cyol.com',
]

const OFFICIAL_ACCOUNT_DOMAINS = [
  'gov.cn', 'cac.gov.cn', 'most.gov.cn', 'miit.gov.cn', 'ndrc.gov.cn', 'nda.gov.cn',
  'moe.gov.cn', 'sasac.gov.cn', 'cas.cn', 'cae.cn', 'caict.ac.cn', 'nsfc.gov.cn',
  'openai.com', 'anthropic.com', 'deepmind.google', 'ai.google', 'ai.meta.com',
  'nvidia.com', 'deepseek.com',
]

export function classifySource(publisher: string, sourceUrl?: string): SourceAuthority {
  const normalizedName = normalize(publisher)
  const hostname = hostnameOf(sourceUrl)

  if (matchesName(normalizedName, OFFICIAL_MEDIA_NAMES) || matchesDomain(hostname, OFFICIAL_MEDIA_DOMAINS)) {
    return 'official-media'
  }
  if (matchesName(normalizedName, OFFICIAL_ACCOUNT_NAMES) || matchesDomain(hostname, OFFICIAL_ACCOUNT_DOMAINS)) {
    return 'official-account'
  }
  return 'general'
}

export function authorityRank(authority?: SourceAuthority): number {
  if (authority === 'official-media') return 2
  if (authority === 'official-account') return 1
  return 0
}

export function authorityLabel(authority?: SourceAuthority): string | null {
  if (authority === 'official-media') return '官媒'
  if (authority === 'official-account') return '官方'
  return null
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKC').replace(/[\s·•_\-—]+/g, '')
}

function matchesName(normalizedName: string, names: string[]): boolean {
  return names.some((name) => normalizedName.includes(normalize(name)))
}

function hostnameOf(value?: string): string {
  if (!value) return ''
  try {
    return new URL(value).hostname.toLocaleLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function matchesDomain(hostname: string, domains: string[]): boolean {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
}
