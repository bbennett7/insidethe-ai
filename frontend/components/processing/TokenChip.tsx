import styles from './TokenChip.module.css'

interface TokenChipProps {
  text: string
  id: string | number
  accent?: boolean
  style?: React.CSSProperties
}

export default function TokenChip({ text, id, accent, style }: TokenChipProps) {
  return (
    <span className={`${styles.tok}${accent ? ` ${styles.tokAccent}` : ''}`} style={style}>
      <span className={styles.tokId}>{String(id)}</span>
      {text}
    </span>
  )
}
