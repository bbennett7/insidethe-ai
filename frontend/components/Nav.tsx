'use client'

import Link from 'next/link'
import { useTheme } from '@/lib/ThemeContext'
import styles from './Nav.module.css'
import Wordmark from './Wordmark'

export default function Nav() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.wordmarkLink}>
        <Wordmark size="sm" />
      </Link>
      <div className={styles.navRight}>
        <span className={styles.dot} />
        <span>gpt-2 · ready</span>
        <button
          type="button"
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? 'light' : 'dark'}
        </button>
      </div>
    </nav>
  )
}
