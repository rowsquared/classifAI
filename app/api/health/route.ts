import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
	try {
		// Check database connection
		await prisma.$queryRaw`SELECT 1`

		return NextResponse.json({
			status: 'healthy',
			timestamp: new Date().toISOString(),
			database: 'connected',
		})
	} catch (error) {
		return NextResponse.json(
			{
				status: 'unhealthy',
				timestamp: new Date().toISOString(),
				database: 'disconnected',
				error: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 503 }
		)
	} finally {
		await prisma.$disconnect()
	}
}
