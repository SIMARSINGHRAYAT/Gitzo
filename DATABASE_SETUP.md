# Database Setup Guide for Vercel

After your Vercel deployment completes, you need to create the database tables. Follow these steps:

## Option 1: Use Vercel CLI (Recommended)

```bash
# Install Vercel CLI if you don't have it
npm i -g vercel

# Login to Vercel
vercel login

# Run Prisma from your project directory
vercel env pull  # Download environment variables
npx prisma db push --skip-generate
```

## Option 2: Use Node.js directly

```bash
# Make sure you have NODE_ENV set
$env:NODE_ENV="production"
$env:DATABASE_URL="your_neon_connection_string"

npx prisma db push --skip-generate
```

## Option 3: Use Prisma Studio

```bash
# This opens an interactive UI to manage your database
npx prisma studio
```

## What gets created?

The `db push` command creates three tables:
- **User** - Stores GitHub user info and requirement tracking
- **Follows** - Stores follow relationships between users
- **DailyFollowLimit** - Tracks daily follow limits per user

## Verify it worked

After running the command, you should see:
```
✓ Database connected and tables created
✓ 0 tables created
✓ 0 indexes created
```

## Test the app

1. Go to your Vercel deployment URL
2. Click "Get Started"
3. Sign in with GitHub
4. You should see either:
   - "Support Project" page (new users)
   - "Features" page (returning users with requirements complete)

If you still see "Failed to verify GitHub status", the database setup may have failed. Check the Vercel function logs at: https://vercel.com/dashboard → Your Project → Functions
