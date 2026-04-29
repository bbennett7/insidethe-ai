import Link from 'next/link'
import styles from './LandingCard.module.css'

interface LandingCardProps {
  num: string
  name: string
  canvas: React.ReactNode
  href?: string
}

export default function LandingCard({ num, name, canvas, href }: LandingCardProps) {
  const footer = (
    <>
      <div className={styles.preview}>{canvas}</div>
      <div className={styles.footer}>
        <span className={styles.eyebrow}>inside the</span>
        <span className={styles.name}>{name}</span>
        <div className={styles.row}>
          <span className={styles.num}>{num}</span>
          {href ? (
            <span className={styles.statusLive}>
              <span className={styles.liveDot} />
              Live
            </span>
          ) : (
            <span className={styles.badgeSoon}>Coming Soon</span>
          )}
        </div>
      </div>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={`${styles.card} ${styles.cardActive}`}>
        {footer}
      </Link>
    )
  }

  return <div className={`${styles.card} ${styles.cardDisabled}`}>{footer}</div>
}
