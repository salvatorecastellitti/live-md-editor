import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import 'live-md-editor/style.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'live-md-editor in Next.js',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>{children}</body>
    </html>
  )
}
