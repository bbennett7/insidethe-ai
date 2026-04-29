import { SiHuggingface } from 'react-icons/si';
import InfoTooltip from './InfoTooltip';
import styles from './RightPanelHeader.module.css';
import { mechInterpTooltip } from './tooltipContent';

interface RightPanelHeaderProps {
  tokenGenCount: number;
  view: 'layers' | 'stream';
  zoom: number;
  streamLive: boolean;
  isRunning: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onViewChange: (v: 'layers' | 'stream') => void;
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
      <a
        href="https://huggingface.co/openai-community/gpt2"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.hfLink}
        aria-label="View model on Hugging Face"
      >
        <SiHuggingface size={12} aria-hidden="true" />
        <span>gpt-2 ↗</span>
      </a>
      <div className={styles.aboutRow}>
        <a
          href="https://nnsight.net"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.nnsightLink}
        >
          Built with NNsight ↗
        </a>
        <span className={styles.mechInterp}>
          <span className={styles.mechInterpLabel}>What is Mechanistic Interpretability?</span>
          <InfoTooltip content={mechInterpTooltip()}>
            <span className={styles.mechInterpIcon}>?</span>
          </InfoTooltip>
        </span>
      </div>
      <span className={styles.eyebrow}>12 layers · 12 heads · 768 dimensions · 3072 neurons</span>
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
  );
}
