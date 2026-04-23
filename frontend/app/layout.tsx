import type { Metadata } from 'next'
import './globals.css'
import BackgroundCanvas from '@/components/BackgroundCanvas'
import MobileGate from '@/components/MobileGate'
import Nav from '@/components/Nav'
import { ThemeProvider } from '@/lib/ThemeContext'

export const metadata: Metadata = {
  title: 'insidethe.ai',
  description: 'Visualize the real-time internal processing of GPT-2.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
}

const themeScript = `(function(){try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light')}catch(e){}})()`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: theme init must run inline before paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <BackgroundCanvas />
          <Nav />
          <MobileGate />
          <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  )
}
