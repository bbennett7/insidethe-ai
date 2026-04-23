import { memo } from 'react'
import type { LayerData, LayerState } from '@/lib/processingTypes'
import LayerCanvas from './LayerCanvas'
import styles from './LayerCard.module.css'

interface LayerCardProps {
  layerIndex: number
  state: LayerState
  data: LayerData
  tokens?: string[]
  isDecoding?: boolean
}

export default memo(function LayerCard({
  layerIndex,
  state,
  data,
  tokens,
  isDecoding,
}: LayerCardProps) {
  const num = String(layerIndex).padStart(2, '0')

  const cardClass = [
    styles.card,
    state === 'processing' ? styles.stateProcessing : '',
    state === 'done' ? styles.stateDone : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cardClass}>
      <div className={styles.header}>
        <span className={styles.label}>LAYER {num}</span>
        <span className={styles.dot} />
      </div>
      <LayerCanvas layerIndex={layerIndex} state={state} data={data} tokens={tokens} isDecoding={isDecoding} />
    </div>
  )
})
