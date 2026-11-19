import type { Metadata, Viewport } from 'next';
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument-serif', display: 'swap' });
// Sans and mono are variable fonts: one file each covers every weight. Mono is never the largest paint, so it is not preloaded.
const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap', preload: false });

export const metadata: Metadata = {
  metadataBase: new URL('https://harshdubey23.github.io/RepoTale/'),
  title: 'RepoTale: every claim about a codebase, traced to its line',
  description: 'Paste a repository or pull request. RepoTale maps its imports, shows where to start reading and what a change can break, and links every statement to the file and line behind it.',
  openGraph: { title: 'RepoTale', description: 'Architecture from real imports, a reading order and pull request impact. Every claim cites its file and line.', type: 'website' },
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
