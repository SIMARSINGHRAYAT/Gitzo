# Implementation Guide: GitHub Onboarding & Follow System

## Overview

This implementation adds a comprehensive GitHub onboarding flow, user tracking system, and social follow functionality to GitHubCrazy.com.

## Key Features Implemented

### 1. Server-Side User Status Tracking
- **File**: `/api/user/status.ts`
- Verifies GitHub authentication on the backend
- Tracks whether a user is new or returning
- Checks if repository was starred
- Checks if maintainer is followed
- Stores user data in database with Prisma

### 2. Intelligent Onboarding Flow
- **New users** are shown the Support page to complete requirements
- **Returning users** with completed requirements skip directly to features
- **Smart detection** via server-side verification prevents re-asking

### 3. User Profile System
- **File**: `/api/user/profile.ts`
- Stores GitHub profile data (username, avatar, bio, etc.)
- Tracks follower/following counts
- Provides profile discovery for community

### 4. Community Follow System
- **File**: `/api/follows.ts`
- Follow/unfollow any community member
- Prevents duplicate follows
- Prevents self-follows
- Enforces daily 10-follow limit (per-user, server-side)
- Returns daily follows remaining

### 5. Frontend Dashboard
- **File**: `/src/components/Dashboard.tsx`
- Displays community member profiles
- Shows follow/unfollow buttons
- Displays daily follow limit status
- Updates follower counts in real-time
- Responsive mobile-friendly design

### 6. Updated Support Component
- **File**: `/src/components/SupportProject.tsx`
- Uses server-side verification instead of client-only checks
- Re-verifies after user completes actions
- Shows real current state of requirements

## Database Schema

### User Table
```
- id (UUID, primary key)
- githubId (Int, unique)
- githubUsername (String, unique)
- githubName (String)
- githubAvatar (String)
- githubBio (String)
- githubFollowersCount (Int)
- githubFollowingCount (Int)
- repositoryStarred (Boolean)
- maintainerFollowed (Boolean)
- lastRequirementCheck (DateTime)
- createdAt (DateTime)
- updatedAt (DateTime)
```

### Follows Table
```
- id (UUID, primary key)
- followerId (String, foreign key to User)
- followingId (String, foreign key to User)
- createdAt (DateTime)
- UNIQUE(followerId, followingId)
```

### DailyFollowLimit Table
```
- id (UUID, primary key)
- userId (String, foreign key to User)
- date (Date)
- count (Int)
- UNIQUE(userId, date)
```

## API Endpoints

### POST /api/user/status
Check user status and verify requirements
- **Input**: Authorization header with GitHub token
- **Output**: `{ isNew, repositoryStarred, maintainerFollowed, requirementsComplete, user }`
- **Side Effect**: Creates/updates user record in database

### GET /api/user/profile
Get user profile by ID or list all profiles
- **Query**: `userId` (optional)
- **Output**: User profile with follower counts
- **Auth**: Optional (shows isFollowing if authenticated)

### POST /api/follows
Follow or unfollow a user
- **Body**: `{ targetUserId, action: 'follow' | 'unfollow' }`
- **Output**: `{ success, message, followsRemaining }`
- **Rate Limit**: Max 10 follows per day per user

### GET /api/follows
Get follower/following data or daily limit status
- **Query**: `type: 'followers' | 'following' | 'daily-remaining'`
- **Output**: Followers/following lists or daily limit stats

### GET /api/profiles
Get all community profiles with follow status
- **Output**: Array of profile cards with follower counts

## Environment Variables

Required in `.env.local` or `.env`:

```
# Database
DATABASE_URL="postgresql://user:password@host/dbname"

# GitHub OAuth
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_REDIRECT_URI=https://yourdomain.com/api/auth/github/callback

# Optional: Override support repository/maintainer
SUPPORT_REPO_OWNER=SIMARSINGHRAYAT
SUPPORT_REPO_NAME=GitHubCrazy.com
SUPPORT_MAINTAINER=SIMARSINGHRAYAT
```

## User Flow

### New User
```
1. Click "Get Started"
2. Sign in with GitHub
3. Backend creates new User record
4. Verify status: requirements NOT complete
5. Show Support page
6. User completes requirements (star + follow)
7. After each action, re-verify status
8. Once complete, Continue button enabled
9. Navigate to Features page
10. Choose feature (Badges, Stars, Followers, Community)
```

### Returning User (Requirements Complete)
```
1. Click "Get Started"
2. Sign in with GitHub
3. Backend finds existing User record
4. Verify status: requirements COMPLETE
5. Skip Support page, go directly to Features
6. Choose feature
```

### Returning User (Partial/Failed Requirements)
```
1. Click "Get Started"
2. Sign in with GitHub
3. Backend finds existing User record
4. Verify status: requirements INCOMPLETE
5. Show Support page with current state
6. User completes missing requirements
7. Continue when all complete
```

### Community/Follow Feature
```
1. In Features page, click "Community"
2. Dashboard loads all profiles
3. User sees their daily follow limit
4. Browse community members
5. Click "Follow" to add someone
6. Button changes to "Following"
7. Follower counts update in real-time
8. If limit reached (10/10), follow button disabled
9. Can unfollow to free up a spot (doesn't reset limit)
```

## Testing Checklist

### Authentication & Onboarding
- [ ] Brand new user flow
- [ ] Existing user with both requirements complete
- [ ] Existing user with star only
- [ ] Existing user with follow only
- [ ] User who unstars and signs in again
- [ ] User who unfollows and signs in again
- [ ] Direct dashboard access when authenticated

### Follow System
- [ ] Follow a user successfully
- [ ] Cannot follow yourself
- [ ] Cannot follow same user twice (duplicate prevention)
- [ ] Unfollow works correctly
- [ ] Follow count updates accurately
- [ ] Can follow 10 users per day
- [ ] 11th follow is rejected
- [ ] Unfollowing doesn't reset daily limit
- [ ] Concurrent follow requests don't bypass limit
- [ ] Daily limit resets after midnight

### UI/UX
- [ ] Support page shows correct state
- [ ] Continue button disabled until both complete
- [ ] Loading states show during verification
- [ ] Error messages display clearly
- [ ] Dashboard responsive on mobile
- [ ] Profile cards display correctly
- [ ] Daily limit indicator is visible
- [ ] Follow buttons have appropriate states

### Database
- [ ] New user created with correct data
- [ ] User data updates on return visit
- [ ] Follow relationships created correctly
- [ ] Unique constraint prevents duplicates
- [ ] Daily limit tracks correctly per user per day
- [ ] Follower counts accurate

## Security Considerations

### Implemented
- ✅ Server-side authentication via GitHub OAuth
- ✅ Token validation on every API call
- ✅ Database-enforced unique constraints
- ✅ Daily limit enforced server-side, not client-side
- ✅ Self-follow prevention on backend
- ✅ Duplicate follow prevention on backend
- ✅ Authenticated user extracted from token, not trusting client
- ✅ Environment variables for secrets (not committed)

### Recommendations
- Add rate limiting on API endpoints
- Add logging for security events
- Add CORS configuration
- Consider adding IP-based rate limiting
- Monitor for suspicious patterns (many follows in short time)

## Deployment Checklist

- [ ] Database provisioned (Neon/Vercel Postgres/other)
- [ ] DATABASE_URL set in production environment
- [ ] GitHub OAuth app configured with production redirect URI
- [ ] GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET set
- [ ] Prisma migrations run: `prisma migrate deploy`
- [ ] Environment variables validated
- [ ] HTTPS configured
- [ ] CORS headers configured if needed
- [ ] Logging set up
- [ ] Error tracking configured (Sentry/etc)
- [ ] Database backups configured
- [ ] Build succeeds: `npm run build`
- [ ] No TypeScript errors
- [ ] Unit tests pass (if available)
- [ ] Smoke tests pass in staging

## Potential Issues & Solutions

### Issue: User created but requirements never verified
**Solution**: Ensure API endpoint is being called after OAuth flow

### Issue: Daily limit not working
**Solution**: Verify database queries for DailyFollowLimit, check timezone handling

### Issue: Profile avatars not loading
**Solution**: Check CORS configuration, verify GitHub URLs are accessible

### Issue: Concurrent follows bypassing limit
**Solution**: Use database transactions, add additional validation

## Future Enhancements

- [ ] Follower notifications
- [ ] Following/followers list views
- [ ] Search community members
- [ ] Filter by skill/language
- [ ] GitHub stats integration
- [ ] Messaging between users
- [ ] Profile customization
- [ ] Badge display on profile
- [ ] Integration with GitHub following
