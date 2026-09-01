import prisma from '../../db';
import type { NextApiRequest, NextApiResponse } from 'next';

const MAX_FOLLOWS_PER_DAY = 10;

interface FollowResponse {
  success: boolean;
  message?: string;
  followsRemaining?: number;
  error?: string;
}

async function getUserFromToken(token: string) {
  const res = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `token ${token}` }
  });
  if (!res.ok) return null;
  const githubUser = await res.json();
  return prisma.user.findUnique({
    where: { githubId: githubUser.id }
  });
}

function getToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FollowResponse | { error: string }>
) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  try {
    const currentUser = await getUserFromToken(token);
    if (!currentUser) {
      return res.status(401).json({ error: 'Invalid GitHub token' });
    }

    if (req.method === 'POST') {
      const { targetUserId, action } = req.body;

      if (!targetUserId || !action) {
        return res.status(400).json({ error: 'Missing targetUserId or action' });
      }

      if (action === 'follow') {
        // Prevent self-follow
        if (currentUser.id === targetUserId) {
          return res.status(400).json({ error: 'Cannot follow yourself' });
        }

        // Check if target user exists
        const targetUser = await prisma.user.findUnique({
          where: { id: targetUserId }
        });
        if (!targetUser) {
          return res.status(404).json({ error: 'Target user not found' });
        }

        // Check if already following
        const existingFollow = await prisma.follows.findUnique({
          where: {
            followerId_followingId: {
              followerId: currentUser.id,
              followingId: targetUserId
            }
          }
        });

        if (existingFollow) {
          return res.status(400).json({ error: 'Already following this user' });
        }

        // Check daily follow limit
        const today = getToday();
        const todayFollow = await prisma.dailyFollowLimit.findUnique({
          where: {
            userId_date: {
              userId: currentUser.id,
              date: today
            }
          }
        });

        const followsUsedToday = todayFollow?.count || 0;
        if (followsUsedToday >= MAX_FOLLOWS_PER_DAY) {
          return res.status(429).json({
            error: `Daily follow limit reached. You can follow up to ${MAX_FOLLOWS_PER_DAY} users per day.`
          });
        }

        // Create follow relationship
        await prisma.follows.create({
          data: {
            followerId: currentUser.id,
            followingId: targetUserId
          }
        });

        // Update or create daily follow limit
        if (todayFollow) {
          await prisma.dailyFollowLimit.update({
            where: {
              userId_date: {
                userId: currentUser.id,
                date: today
              }
            },
            data: { count: todayFollow.count + 1 }
          });
        } else {
          await prisma.dailyFollowLimit.create({
            data: {
              userId: currentUser.id,
              date: today,
              count: 1
            }
          });
        }

        const followsRemaining = MAX_FOLLOWS_PER_DAY - (followsUsedToday + 1);

        return res.status(200).json({
          success: true,
          message: 'Successfully followed user',
          followsRemaining
        });
      } else if (action === 'unfollow') {
        const follow = await prisma.follows.findUnique({
          where: {
            followerId_followingId: {
              followerId: currentUser.id,
              followingId: targetUserId
            }
          }
        });

        if (!follow) {
          return res.status(400).json({ error: 'Not following this user' });
        }

        await prisma.follows.delete({
          where: { id: follow.id }
        });

        // Get remaining follows for today
        const today = getToday();
        const todayFollow = await prisma.dailyFollowLimit.findUnique({
          where: {
            userId_date: {
              userId: currentUser.id,
              date: today
            }
          }
        });

        return res.status(200).json({
          success: true,
          message: 'Successfully unfollowed user',
          followsRemaining: MAX_FOLLOWS_PER_DAY - (todayFollow?.count || 0)
        });
      } else {
        return res.status(400).json({ error: 'Invalid action. Use "follow" or "unfollow"' });
      }
    } else if (req.method === 'GET') {
      // Get current user's followers and following
      const { type } = req.query;

      if (type === 'followers') {
        const followers = await prisma.follows.findMany({
          where: { followingId: currentUser.id },
          include: { follower: true },
          orderBy: { createdAt: 'desc' }
        });

        return res.status(200).json({
          success: true,
          message: `Retrieved ${followers.length} followers`,
          followers
        } as any);
      } else if (type === 'following') {
        const following = await prisma.follows.findMany({
          where: { followerId: currentUser.id },
          include: { following: true },
          orderBy: { createdAt: 'desc' }
        });

        return res.status(200).json({
          success: true,
          message: `Retrieved ${following.length} following`,
          following
        } as any);
      } else if (type === 'daily-remaining') {
        const today = getToday();
        const todayFollow = await prisma.dailyFollowLimit.findUnique({
          where: {
            userId_date: {
              userId: currentUser.id,
              date: today
            }
          }
        });

        const followsUsedToday = todayFollow?.count || 0;
        const followsRemaining = MAX_FOLLOWS_PER_DAY - followsUsedToday;

        return res.status(200).json({
          success: true,
          followsUsedToday,
          followsRemaining,
          maxFollowsPerDay: MAX_FOLLOWS_PER_DAY
        } as any);
      }

      return res.status(400).json({ error: 'Missing or invalid type parameter' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Follow error:', error);
    return res.status(500).json({ error: 'Failed to process follow request' });
  }
}
