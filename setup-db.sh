#!/bin/bash
# This script sets up the Prisma database tables
# Run this once after deploying to Vercel

# Make sure DATABASE_URL is set in your Vercel environment
npx prisma db push --skip-generate

echo "✓ Database setup complete!"
echo "✓ User, Follows, and DailyFollowLimit tables created"
