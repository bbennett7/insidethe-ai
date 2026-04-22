import LandingCard from '@/components/LandingCard'
import PortalAgentCanvas from '@/components/PortalAgentCanvas'
import PortalAlgoCanvas from '@/components/PortalAlgoCanvas'
import PortalChipCanvas from '@/components/PortalChipCanvas'
import PortalFrontierCanvas from '@/components/PortalFrontierCanvas'
import PortalMemoryCanvas from '@/components/PortalMemoryCanvas'
import PortalProcessCanvas from '@/components/PortalProcessCanvas'
import styles from './page.module.css'

const CARDS = [
  {
    num: '01',
    name: 'Processing',
    canvas: <PortalProcessCanvas />,
    href: '/processing',
  },
  { num: '02', name: 'Chip', canvas: <PortalChipCanvas /> },
  { num: '03', name: 'Algorithms', canvas: <PortalAlgoCanvas /> },
  { num: '04', name: 'Agent', canvas: <PortalAgentCanvas /> },
  { num: '05', name: 'Memory', canvas: <PortalMemoryCanvas /> },
  { num: '06', name: 'Frontier', canvas: <PortalFrontierCanvas /> },
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
