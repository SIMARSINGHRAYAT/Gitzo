/**
 * Database setup helper - Run this once after deployment
 * 
 * On Vercel:
 * 1. Make sure DATABASE_URL is set in Production environment
 * 2. Run: curl -X GET https://yourdomain.com/api/setup-db
 * 3. You should see "Tables created" or "Tables already exist"
 * 4. Delete this file after successful setup
 */

import prisma from './db';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Security: Only allow GET in development or preview
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Add a simple security check (in production, you'd use a token)
  const secret = req.query.secret as string;
  if (process.env.NODE_ENV === 'production' && secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    // Test database connection
    await prisma.user.findFirst({ take: 1 });
    
    return res.status(200).json({
      success: true,
      message: 'Database tables already exist and are accessible!',
      environment: process.env.NODE_ENV,
      database: process.env.DATABASE_URL?.split('@')[1] || 'unknown'
    });
  } catch (error: any) {
    // If tables don't exist yet, Prisma will throw an error
    console.error('Database connection error:', error.message);
    
    return res.status(500).json({
      success: false,
      error: 'Database tables do not exist yet',
      hint: 'Run: npx prisma db push --skip-generate',
      message: error.message
    });
  }
}
