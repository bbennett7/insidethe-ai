import { useCallback, useEffect, useRef, useState } from 'react';

const STEP = 0.1;
const MIN = 0.4;
const MAX = 2;

export function useZoom(initial = 1) {
  const [zoom, setZoom] = useState(initial);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(MAX, Math.round((z + STEP) * 10) / 10)),
    []
  );
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(MIN, Math.round((z - STEP) * 10) / 10)),
    []
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomIn, zoomOut]);

  return { zoom, zoomIn, zoomOut, containerRef };
}
