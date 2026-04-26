import styles from './page.module.css'

export default function FrontierPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>
        Inside the <em>Frontier</em>
      </h1>
      <p className={styles.note}>Coming soon.</p>
    </div>
  )
}
