# Quick Start Guide: Deployment

This guide walks you through deploying GitHubCrazy.com to production with the new GitHub onboarding, user tracking, and follow system.

## Step 1: Provision a PostgreSQL Database

### Option A: Neon (Recommended for Vercel)
1. Go to https://neon.tech
2. Sign up with GitHub
3. Create a new project
4. Copy the PostgreSQL connection string
5. Should look like: `postgresql://user:password@host.neon.tech/database`

### Option B: Vercel Postgres
1. In Vercel dashboard, connect to your repo
2. Add Postgres storage
3. Get connection string from environment variables

### Option C: Other Providers
- Amazon RDS
- Azure Database for PostgreSQL
- Railway.app
- Supabase (has PostgreSQL)

## Step 2: Set Environment Variables

In your deployment platform (Vercel, Netlify, etc.):

```
DATABASE_URL=postgresql://user:password@host/database
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=https://yourdomain.com/api/auth/github/callback
```

### How to Get GitHub Credentials

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: GitHubCrazy
   - **Homepage URL**: https://yourdomain.com
   - **Authorization callback URL**: https://yourdomain.com/api/auth/github/callback
4. Copy Client ID and generate Client Secret
5. Save to your deployment platform's environment variables

## Step 3: Deploy Code

### If using Vercel
```bash
git push origin main
# Vercel auto-deploys on push
```

### If using another platform
```bash
npm run build
# Deploy dist/ folder to your host
```

## Step 4: Run Database Migrations

After deployment is live:

```bash
npx prisma migrate deploy
```

Or if you prefer to create migrations:

```bash
npx prisma migrate dev --name init
```

## Step 5: Test the Deployment

1. Visit your production URL
2. Click "Get Started"
3. Click "Sign in with GitHub"
4. You should be redirected to GitHub OAuth
5. After authorization, you should see either:
   - Support page (if new user)
   - Features page (if returning user with requirements complete)
6. Click "Community" → Dashboard should show profiles

## Step 6: Troubleshooting

### "Cannot find module" errors
- Make sure all dependencies installed: `npm install`
- Make sure build succeeded: `npm run build`

### Database connection errors
- Verify DATABASE_URL is correct
- Check database is accessible from your host
- Make sure firewall allows connections

### GitHub OAuth errors
- Verify GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set
- Verify GITHUB_REDIRECT_URI matches your domain exactly
- Check OAuth app callback URL in GitHub settings

### "User not found" after login
- Make sure Prisma migrations ran successfully
- Check database schema exists with `psql` or database client

## Monitoring & Maintenance

### Check Database
```bash
npx prisma studio
```
This opens a web UI showing your database contents.

### View Logs
Check your deployment platform's logs for errors:
- Vercel: Vercel Dashboard → Functions tab
- Netlify: Netlify UI → Functions tab
- Self-hosted: Check server logs

### Monitor Rate Limits
- GitHub API: Check `/api/rate_limit` endpoint
- Daily follow limit: Check DailyFollowLimit table in database

## Rollback

If something goes wrong:

```bash
# Revert to previous version
git revert HEAD
git push origin main

# Or rollback database
npx prisma migrate resolve --rolled-back migration_name
```

## Next Steps

- Set up error tracking (Sentry, Rollbar, etc.)
- Set up analytics (Mixpanel, Amplitude, etc.)
- Configure CDN for static assets
- Set up database backups
- Monitor performance metrics

## Support

For issues:
1. Check [FINAL_REPORT.md](./FINAL_REPORT.md)
2. Check [IMPLEMENTATION.md](./IMPLEMENTATION.md)
3. Review error logs in deployment platform
4. Verify all environment variables are set correctly

Good luck! 🚀
