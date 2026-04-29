import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <span className={styles.eyebrow}>Not Found</span>
        <p className={styles.code}>404</p>
        <h1 className={styles.headline}>
          This token has <em>no embedding.</em>
        </h1>
        <p className={styles.body}>Unable to complete the forward pass.</p>
        <Link href="/" className={styles.back}>
          ← back to the grid
        </Link>
      </div>
    </div>
  );
}
