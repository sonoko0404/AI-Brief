import { describe, expect, it } from 'vitest'
import type { ResizeDirection } from '../shared/types'
import { calculateResizeBounds } from '../electron/window-resize'

const initial = { x: 100, y: 80, width: 280, height: 360 }

function resize(direction: ResizeDirection, pointerX: number, pointerY: number) {
  return calculateResizeBounds({ direction, pointerX: 400, pointerY: 400, bounds: initial }, pointerX, pointerY, 260, 300)
}

describe('calculateResizeBounds', () => {
  it('resizes from the south-east corner', () => {
    expect(resize('se', 460, 450)).toEqual({ x: 100, y: 80, width: 340, height: 410 })
  })

  it('keeps the opposite edge fixed while resizing north-west', () => {
    expect(resize('nw', 360, 340)).toEqual({ x: 60, y: 20, width: 320, height: 420 })
  })

  it('enforces the minimum size on west and north edges', () => {
    expect(resize('nw', 500, 520)).toEqual({ x: 120, y: 140, width: 260, height: 300 })
  })

  it('changes only the requested axis', () => {
    expect(resize('e', 450, 900)).toEqual({ x: 100, y: 80, width: 330, height: 360 })
    expect(resize('s', 900, 440)).toEqual({ x: 100, y: 80, width: 280, height: 400 })
  })
})
