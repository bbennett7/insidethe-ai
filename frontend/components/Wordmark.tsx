import styles from './Wordmark.module.css'

type Size = 'sm' | 'md' | 'lg'

interface WordmarkProps {
  size?: Size
}

const TOKENS = [
  { text: 'in', id: '2294', accent: false },
  { text: 'side', id: '3349', accent: false },
  { text: 'the', id: '1820', accent: false },
  { text: '.ai', id: '13 / 1872', accent: true },
] as const

export default function Wordmark({ size = 'sm' }: WordmarkProps) {
  return (
    <div className={`${styles.tokRow} ${styles[size]}`}>
      {TOKENS.map((tok) => (
        <span
          key={tok.text}
          className={`${styles.tok}${tok.accent ? ` ${styles.tokAccent}` : ''}`}
        >
          <span className={styles.tokId}>{tok.id}</span>
          {tok.text}
        </span>
      ))}
    </div>
  )
}
