export interface WeekRange {
  start: Date
  end: Date
  key: string
}

export function startOfLocalWeek(date: Date): Date {
  const result = new Date(date)
  const day = result.getDay()
  const daysSinceMonday = (day + 6) % 7
  result.setDate(result.getDate() - daysSinceMonday)
  result.setHours(0, 0, 0, 0)
  return result
}

export function previousFullWeek(now: Date): WeekRange {
  const end = startOfLocalWeek(now)
  const start = new Date(end)
  start.setDate(start.getDate() - 7)
  return { start, end, key: localDateKey(start) }
}

export function isWeeklyDigestDue(now: Date, existingWeekStart?: string | null): boolean {
  const target = previousFullWeek(now)
  if (!existingWeekStart) return true

  const currentMonday = startOfLocalWeek(now)
  const mondayNoon = new Date(currentMonday)
  mondayNoon.setHours(12, 0, 0, 0)
  if (now.getTime() < mondayNoon.getTime() && now.getDay() === 1) return false

  return localDateKey(new Date(existingWeekStart)) !== target.key
}

export function nextMondayNoon(now: Date): Date {
  const monday = startOfLocalWeek(now)
  const noon = new Date(monday)
  noon.setHours(12, 0, 0, 0)
  if (noon.getTime() > now.getTime()) return noon
  noon.setDate(noon.getDate() + 7)
  return noon
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
