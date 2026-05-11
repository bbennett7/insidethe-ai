import type { Metadata } from 'next';
import './globals.css';
import BackgroundCanvas from '@/components/BackgroundCanvas';
import MobileGate from '@/components/MobileGate';
import Nav from '@/components/Nav';
import { PostHogProvider } from '@/components/PostHogProvider';
import { ThemeProvider } from '@/lib/ThemeContext';

export const metadata: Metadata = {
  metadataBase: new URL('https://insidethe.ai'),
  title: 'insidethe.ai',
  description: 'Visualize the real-time internal processing of GPT-2.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    title: 'insidethe.ai',
    description: 'Visualize the real-time internal processing of GPT-2.',
    url: 'https://insidethe.ai',
    siteName: 'insidethe.ai',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'insidethe.ai' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'insidethe.ai',
    description: 'Visualize the real-time internal processing of GPT-2.',
    images: ['/opengraph-image'],
  },
};

const themeScript = `(function(){try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light')}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: theme init must run inline before paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <PostHogProvider>
          <ThemeProvider>
            <BackgroundCanvas />
            <Nav />
            <MobileGate />
            <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
