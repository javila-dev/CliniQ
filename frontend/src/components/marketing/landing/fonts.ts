import localFont from 'next/font/local'

export const display = localFont({
  src: './fonts/HedvigLettersSerif.woff2',
  weight: '400',
  variable: '--font-lv3-display',
  display: 'swap',
})

export const sans = localFont({
  src: './fonts/Geist.woff2',
  weight: '300 700',
  variable: '--font-lv3-sans',
  display: 'swap',
})

export const mono = localFont({
  src: './fonts/GeistMono.woff2',
  weight: '400 600',
  variable: '--font-lv3-mono',
  display: 'swap',
})
