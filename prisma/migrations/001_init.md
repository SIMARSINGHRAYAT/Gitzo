# Migration: Add User & Follow System

This migration creates the database schema for user management and the social follow system.

## What it does

1. Creates `User` table with GitHub authentication data and requirement tracking
2. Creates `Follows` table for user-to-user relationships with unique constraint
3. Creates `DailyFollowLimit` table for tracking daily follow limits (max 10 per day)
4. Adds proper indexes for performance

## Running the migration

1. Ensure your `DATABASE_URL` environment variable is set in `.env.local` or `.env`
2. Run: `npx prisma migrate dev --name add_user_follow_system`
3. Or for production: `npx prisma migrate deploy`

## Database Schema

### User
- `id`: UUID primary key
- `githubId`: Unique GitHub user ID (indexed)
- `githubUsername`: Unique GitHub username (indexed)
- `githubName`, `githubAvatar`, `githubBio`: GitHub profile data
- `repositoryStarred`: Boolean flag for support requirement
- `maintainerFollowed`: Boolean flag for support requirement
- `lastRequirementCheck`: Timestamp of last verification
- `followers`: Relationship to Follows (users following this user)
- `following`: Relationship to Follows (users this user follows)
- `dailyFollows`: Relationship to DailyFollowLimit

### Follows
- `id`: UUID primary key
- `followerId`: Foreign key to User
- `followingId`: Foreign key to User
- `createdAt`: Timestamp
- Unique constraint on (`followerId`, `followingId`)

### DailyFollowLimit
- `id`: UUID primary key
- `userId`: Foreign key to User
- `date`: Date of the follow action
- `count`: Number of new follows this user made
- Unique constraint on (`userId`, `date`)
