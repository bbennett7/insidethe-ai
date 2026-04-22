export const CANVAS_BG_DARK = '#0d0d0d'
export const CANVAS_BG_LIGHT = '#2a2a2a'

export const ACID_DARK = '196,255,61' as const
export const ACID_LIGHT = '143,220,0' as const

export function acidRgba(isDark: boolean, alpha: number): string {
  return `rgba(${isDark ? ACID_DARK : ACID_LIGHT},${alpha})`
}

export function canvasBg(isDark: boolean): string {
  return isDark ? CANVAS_BG_DARK : CANVAS_BG_LIGHT
}
