import LandingCard from '@/components/LandingCard'
import PreviewAgentCanvas from '@/components/PreviewAgentCanvas'
import PreviewAlgoCanvas from '@/components/PreviewAlgoCanvas'
import PreviewChipCanvas from '@/components/PreviewChipCanvas'
import PreviewFrontierCanvas from '@/components/PreviewFrontierCanvas'
import PreviewMemoryCanvas from '@/components/PreviewMemoryCanvas'
import PreviewProcessCanvas from '@/components/PreviewProcessCanvas'
import styles from './page.module.css'

const CARDS = [
  {
    num: '01',
    name: 'Processing',
    canvas: <PreviewProcessCanvas />,
    href: '/processing',
  },
  { num: '02', name: 'Chip', canvas: <PreviewChipCanvas /> },
  { num: '03', name: 'Algorithms', canvas: <PreviewAlgoCanvas /> },
  { num: '04', name: 'Agent', canvas: <PreviewAgentCanvas /> },
  { num: '05', name: 'Memory', canvas: <PreviewMemoryCanvas /> },
  { num: '06', name: 'Frontier', canvas: <PreviewFrontierCanvas /> },
]

export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.pageTitle}>
        Go <em>inside.</em>
      </h1>

      <div className={styles.portalGrid}>
        {CARDS.map((card) => (
          <LandingCard key={card.num} {...card} />
        ))}
      </div>

      <footer className={styles.footer}>
        <span>insidethe.ai · v01</span>
        <a
          href="mailto:bryn.bennett.eng@gmail.com"
          className={styles.footerContact}
        >
          contact
        </a>
      </footer>
    </main>
  )
}
