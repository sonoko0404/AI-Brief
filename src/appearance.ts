const DEFAULT_OPACITY = 0.96
const MIN_EFFECTIVE_OPACITY = 0.1
const POINTER_AWAY_DELTA = 0.2

export function effectiveOpacity(userOpacity: number, pointerInside: boolean): number {
  const normalized = Number.isFinite(userOpacity)
    ? Math.min(1, Math.max(0, userOpacity))
    : DEFAULT_OPACITY

  const effective = pointerInside
    ? normalized
    : Math.max(MIN_EFFECTIVE_OPACITY, normalized - POINTER_AWAY_DELTA)

  return Math.round(effective * 100) / 100
}
