import { PrismaClient } from '../prisma/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

// Default DATABASE_URL for local development (relative to ui/prisma/)
if (!process.env.DATABASE_URL) {
  const dbPath = path.resolve(__dirname, '..', '..', 'aitk_db.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
}

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./dev.db',
});

const prisma = new PrismaClient({ adapter });

export default prisma;
