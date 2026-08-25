import type { ResizeDirection, WindowPlacement } from '../shared/types'

export interface ResizeStart {
  direction: ResizeDirection
  pointerX: number
  pointerY: number
  bounds: WindowPlacement
}

export function calculateResizeBounds(
  start: ResizeStart,
  pointerX: number,
  pointerY: number,
  minimumWidth: number,
  minimumHeight: number,
): WindowPlacement {
  const deltaX = pointerX - start.pointerX
  const deltaY = pointerY - start.pointerY
  const right = start.bounds.x + start.bounds.width
  const bottom = start.bounds.y + start.bounds.height
  const resizingWest = start.direction.includes('w')
  const resizingEast = start.direction.includes('e')
  const resizingNorth = start.direction.includes('n')
  const resizingSouth = start.direction.includes('s')

  let { x, y, width, height } = start.bounds

  if (resizingWest) {
    width = Math.max(minimumWidth, start.bounds.width - deltaX)
    x = right - width
  } else if (resizingEast) {
    width = Math.max(minimumWidth, start.bounds.width + deltaX)
  }

  if (resizingNorth) {
    height = Math.max(minimumHeight, start.bounds.height - deltaY)
    y = bottom - height
  } else if (resizingSouth) {
    height = Math.max(minimumHeight, start.bounds.height + deltaY)
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}
