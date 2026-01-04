import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

// Use 'pg' for standard Postgres or '@neondatabase/serverless' if explicitly needed (Prisma docs suggest pg for standard)
// The error message didn't imply Neon, but user had neonConfig import in my thought process? 
// No, I'll use `pg` package as requested.

import { Pool as PgPool } from 'pg'

const connectionString = process.env.DATABASE_URL

const pool = new PgPool({ connectionString })
const adapter = new PrismaPg(pool)

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
// Forced reload after schema update

