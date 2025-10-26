import '../styles/globals.css'
import type { ReactNode } from 'react'
import Sidebar from '@/components/Sidebar'
import SessionProvider from '@/components/SessionProvider'
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata = {
  title: 'HitLann - Labeling Tool',
  description: 'Modern annotation tool for hierarchical taxonomies',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans bg-gray-50 text-gray-900 antialiased overflow-hidden`}>
        <SessionProvider>
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto bg-white">
              {children}
            </main>
          </div>
        </SessionProvider>
      </body>
    </html>
  )
}


