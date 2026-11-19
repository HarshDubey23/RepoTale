import type { Metadata, Viewport } from 'next';
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument-serif', display: 'swap' });
// Sans and mono are variable fonts: one file each covers every weight. Mono is never the largest paint, so it is not preloaded.
const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap', preload: false });

export const metadata: Metadata = {
  // Absolute links for share cards: SITE_URL if set, else the Vercel production domain, else local.
  metadataBase: new URL(process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3210')),
  title: 'RepoTale: every claim about a codebase, traced to its line',
  description: 'Paste a repository or pull request. RepoTale maps its imports, shows where to start reading and what a change can break, and links every statement to the file and line behind it.',
  openGraph: { title: 'RepoTale', description: 'Architecture from real imports, a reading order and pull request impact. Every claim cites its file and line.', type: 'website' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0a0a0d' }, { media: '(prefers-color-scheme: light)', color: '#fafafc' }],
};

// Runs before first paint: the saved choice, else the system's, so the page never flashes the other theme.
const theme = `try{var t=localStorage.getItem('rt-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: theme }} />
        {/* In the shell itself: streamed pages send their metadata late, and the browser would ask for /favicon.ico. */}
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body className="bg-bg text-text antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-m focus:bg-surface focus:px-4 focus:py-2 focus:text-small focus:text-text focus:shadow-rt">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
