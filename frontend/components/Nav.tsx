'use client'

import Link from 'next/link'
import { SiGithub, SiHuggingface } from 'react-icons/si'
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
          className={styles.navIconLink}
          aria-label="View source on GitHub"
        >
          <SiGithub size={16} aria-hidden="true" />
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <path d="M1.5 6.5L6.5 1.5M6.5 1.5H3M6.5 1.5V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <a
          href="https://huggingface.co/openai-community/gpt2"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.navIconLink}
          aria-label="View model on Hugging Face"
        >
          <SiHuggingface size={16} aria-hidden="true" />
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
