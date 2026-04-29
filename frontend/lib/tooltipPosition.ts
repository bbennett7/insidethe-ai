export const TOOLTIP_PAD = 14;
export const HOVER_DELAY_MS = 600;

export function positionTooltipEl(el: HTMLDivElement, cx: number, cy: number): void {
  const tw = el.offsetWidth || 240;
  const th = el.offsetHeight || 120;
  let x = cx + TOOLTIP_PAD;
  let y = cy - TOOLTIP_PAD;
  if (x + tw > window.innerWidth - TOOLTIP_PAD) x = cx - tw - TOOLTIP_PAD;
  if (y + th > window.innerHeight - TOOLTIP_PAD) y = cy - th - TOOLTIP_PAD;
  if (y < TOOLTIP_PAD) y = TOOLTIP_PAD;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
