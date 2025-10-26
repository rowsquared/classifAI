import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Username or Email', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        console.log('[AUTH] Authorize attempt:', { identifier: credentials?.email })
        
        if (!credentials?.email || !credentials?.password) {
          console.log('[AUTH] Missing credentials')
          return null
        }

        const identifier = credentials.email as string

        // Try to find user by username or email
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { username: identifier },
              { email: identifier }
            ]
          }
        })

        if (!user) {
          console.log('[AUTH] User not found:', identifier)
          return null
        }

        if (!user.password) {
          console.log('[AUTH] User has no password')
          return null
        }

        console.log('[AUTH] User found, checking password...')
        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!passwordMatch) {
          console.log('[AUTH] Password mismatch')
          return null
        }

        console.log('[AUTH] Login successful for:', user.email)

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() }
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mustResetPassword: user.mustResetPassword
        }
      }
    })
  ],
  pages: {
    signIn: '/login'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.mustResetPassword = user.mustResetPassword
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.mustResetPassword = token.mustResetPassword as boolean
      }
      return session
    }
  },
  session: {
    strategy: 'jwt'
  }
}

