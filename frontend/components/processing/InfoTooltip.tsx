'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HOVER_DELAY_MS, positionTooltipEl } from '@/lib/tooltipPosition';
import styles from './InfoTooltip.module.css';

interface InfoTooltipProps {
  /** The element the user hovers over */
  children: ReactNode;
  /** The tooltip body — can be JSX */
  content: ReactNode;
  /** If true, wraps children in a dotted-underline hint style */
  labelHint?: boolean;
}

export default function InfoTooltip({ children, content, labelHint = false }: InfoTooltipProps) {
  const [isMounted, setIsMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(false);
  // Updated on every mousemove so the timer fires at the latest cursor position.
  const cursorRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const showPanel = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    positionTooltipEl(el, cursorRef.current.x, cursorRef.current.y);
    el.classList.add(styles.panelVisible);
    visibleRef.current = true;
  }, []);

  const hidePanel = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    el.classList.remove(styles.panelVisible);
    visibleRef.current = false;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(showPanel, HOVER_DELAY_MS);
    },
    [showPanel]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    cursorRef.current = { x: e.clientX, y: e.clientY };
    if (visibleRef.current) {
      const el = panelRef.current;
      if (el) positionTooltipEl(el, e.clientX, e.clientY);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    hidePanel();
  }, [hidePanel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') hidePanel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hidePanel]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const triggerClass = [styles.trigger, labelHint ? styles.triggerLabel : '']
    .filter(Boolean)
    .join(' ');

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover-only educational tooltip — no interactive role needed
    <span
      className={triggerClass}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isMounted &&
        createPortal(
          <div ref={panelRef} className={styles.panel}>
            {content}
          </div>,
          document.body
        )}
    </span>
  );
}
