'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LayerData, LayerState } from '@/lib/processingTypes';
import { HOVER_DELAY_MS, positionTooltipEl } from '@/lib/tooltipPosition';
import InfoTooltip from './InfoTooltip';
import tooltipStyles from './InfoTooltip.module.css';
import type { LayerRegion } from './LayerCanvas';
import LayerCanvas, { computeLayerHitRegions } from './LayerCanvas';
import styles from './LayerCard.module.css';
import {
  attnTooltip,
  layerHeaderTooltip,
  lnTooltip,
  mlpTooltip,
  residualTooltip,
} from './tooltipContent';

interface LayerCardProps {
  layerIndex: number;
  state: LayerState;
  data: LayerData;
  tokens?: string[];
  isDecoding?: boolean;
}

function regionContent(region: LayerRegion) {
  switch (region) {
    case 'ln1':
      return lnTooltip(1);
    case 'attn':
      return attnTooltip();
    case 'residual_mid':
      return residualTooltip('mid');
    case 'ln2':
      return lnTooltip(2);
    case 'mlp':
      return mlpTooltip();
    case 'residual_post':
      return residualTooltip('post');
  }
}

function CanvasTooltipPanel({
  panelRef,
  content,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  content: React.ReactNode;
}) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  if (!isMounted) return null;
  return createPortal(
    <div ref={panelRef} className={tooltipStyles.panel}>
      {content}
    </div>,
    document.body
  );
}

export default memo(function LayerCard({
  layerIndex,
  state,
  data,
  tokens = [],
  isDecoding = false,
}: LayerCardProps) {
  const num = String(layerIndex).padStart(2, '0');

  const cardClass = [
    styles.card,
    state === 'processing' ? styles.stateProcessing : '',
    state === 'done' ? styles.stateDone : '',
  ]
    .filter(Boolean)
    .join(' ');

  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(false);
  const cursorRef = useRef({ x: 0, y: 0 });
  // Incremented on every hide/region-change so stale timer callbacks self-cancel.
  const cancelTokenRef = useRef(0);
  const [activeRegion, setActiveRegion] = useState<LayerRegion | null>(null);
  const activeRegionRef = useRef<LayerRegion | null>(null);

  const hidePanel = useCallback(() => {
    cancelTokenRef.current++;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const el = panelRef.current;
    if (el) el.classList.remove(tooltipStyles.panelVisible);
    visibleRef.current = false;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };

      const overlay = overlayRef.current;
      if (!overlay) return;

      const rect = overlay.getBoundingClientRect();
      const localY = e.clientY - rect.top;
      const isActive = state === 'done' || state === 'processing';
      const regions = computeLayerHitRegions(tokens, isActive);

      let hit: LayerRegion | null = null;
      for (const r of regions) {
        if (localY >= r.yStart && localY < r.yEnd) {
          hit = r.region;
          break;
        }
      }

      if (hit === null) {
        hidePanel();
        return;
      }

      if (visibleRef.current && hit === activeRegionRef.current) {
        const el = panelRef.current;
        if (el) positionTooltipEl(el, e.clientX, e.clientY);
        return;
      }

      hidePanel();

      activeRegionRef.current = hit;
      setActiveRegion(hit);

      const cancelToken = cancelTokenRef.current;
      timerRef.current = setTimeout(() => {
        if (cancelTokenRef.current !== cancelToken) return;
        const el = panelRef.current;
        if (!el) return;
        positionTooltipEl(el, cursorRef.current.x, cursorRef.current.y);
        el.classList.add(tooltipStyles.panelVisible);
        visibleRef.current = true;
      }, HOVER_DELAY_MS);
    },
    [hidePanel, state, tokens]
  );

  const handleMouseLeave = useCallback(() => {
    hidePanel();
  }, [hidePanel]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className={cardClass}>
      <div className={styles.header}>
        <InfoTooltip content={layerHeaderTooltip(layerIndex)} labelHint>
          <span className={styles.label}>LAYER {num}</span>
        </InfoTooltip>
        <span className={styles.dot} />
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: canvas tooltip overlay — hover-only, no interactive role needed */}
      <div
        ref={overlayRef}
        className={styles.canvasOverlay}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <LayerCanvas
          layerIndex={layerIndex}
          state={state}
          data={data}
          tokens={tokens}
          isDecoding={isDecoding}
        />
        <CanvasTooltipPanel
          panelRef={panelRef}
          content={activeRegion ? regionContent(activeRegion) : null}
        />
      </div>
    </div>
  );
});
