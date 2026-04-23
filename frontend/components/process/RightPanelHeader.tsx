import styles from './RightPanelHeader.module.css'

interface RightPanelHeaderProps {
  tokenGenCount: number
  view: 'layers' | 'stream'
  zoom: number
  streamLive: boolean
  isRunning: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onViewChange: (v: 'layers' | 'stream') => void
}

export default function RightPanelHeader({
  tokenGenCount,
  view,
  zoom,
  streamLive,
  isRunning,
  onZoomIn,
  onZoomOut,
  onViewChange,
}: RightPanelHeaderProps) {
  return (
    <div className={styles.header}>
      <span className={styles.eyebrow}>
        12 layers · 12 heads · 768 dimensions · 3072 neurons
      </span>
      <div className={styles.right}>
        {tokenGenCount > 0 && (
          <span className={styles.tokenCounter}>
            token <span className={styles.acid}>{tokenGenCount}</span>
          </span>
        )}
        {view === 'layers' && (
          <div className={styles.zoomControls}>
            <button
              type="button"
              className={styles.zoomBtn}
              onClick={onZoomOut}
              aria-label="Zoom out"
            >
              −
            </button>
            <span className={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className={styles.zoomBtn}
              onClick={onZoomIn}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        )}
        <div className={styles.viewToggle}>
          <button
            type="button"
            className={`${styles.viewBtn}${view === 'layers' ? ` ${styles.viewBtnActive}` : ''}`}
            onClick={() => onViewChange('layers')}
            disabled={isRunning}
          >
            Heatmap
          </button>
          <button
            type="button"
            className={`${styles.viewBtn}${view === 'stream' ? ` ${styles.viewBtnActive}` : ''}`}
            onClick={() => onViewChange('stream')}
            disabled={isRunning}
          >
            Response
          </button>
        </div>
        <span
          className={`${styles.streamStatus}${streamLive ? ` ${styles.streamStatusLive}` : ''}`}
        >
          ● {streamLive ? 'live' : 'idle'}
        </span>
      </div>
    </div>
  )
}
