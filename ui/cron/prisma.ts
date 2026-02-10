import { PrismaClient } from '@prisma/client';
import path from 'path';

// Default DATABASE_URL for local development (relative to ui/prisma/)
if (!process.env.DATABASE_URL) {
  const dbPath = path.resolve(__dirname, '..', '..', 'aitk_db.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
}

const prisma = new PrismaClient();

export default prisma;
