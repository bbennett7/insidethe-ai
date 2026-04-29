import LandingCard from '@/components/LandingCard';
import PreviewProcessCanvas from '@/components/PreviewProcessCanvas';
import PreviewTransformerCanvas from '@/components/PreviewTransformerCanvas';
import styles from './page.module.css';

const CARDS = [
  {
    num: '01',
    name: 'Processing',
    canvas: <PreviewProcessCanvas />,
    href: '/processing',
  },
  { num: '02', name: 'Transformer', canvas: <PreviewTransformerCanvas /> },
];

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
        <a href="mailto:bryn.bennett.eng@gmail.com" className={styles.footerContact}>
          contact
        </a>
      </footer>
    </main>
  );
}
