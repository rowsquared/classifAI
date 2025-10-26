import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const resetPasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8)
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { currentPassword, newPassword } = resetPasswordSchema.parse(body)

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!user || !user.password) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password)
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Update password and reset flag
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustResetPassword: false
      }
    })

    // Return success with user email for re-authentication
    return NextResponse.json({ ok: true, email: user.email })
  } catch (error) {
    console.error('Password reset error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

