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
        <a
          href="https://github.com/bbennett7/insidethe-ai"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.githubLink}
          aria-label="View source on GitHub"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
          </svg>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <path d="M1.5 6.5L6.5 1.5M6.5 1.5H3M6.5 1.5V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <button
          type="button"
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? 'dark' : 'light'}
        </button>
      </div>
    </nav>
  )
}
