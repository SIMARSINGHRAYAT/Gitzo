import prisma from '../../db';
import type { NextApiRequest, NextApiResponse } from 'next';

interface UserProfileResponse {
  id: string;
  githubUsername: string;
  githubName: string | null;
  githubAvatar: string | null;
  githubBio: string | null;
  githubFollowersCount: number;
  githubFollowingCount: number;
  followersCount: number;
  followingCount: number;
  isFollowing?: boolean;
  createdAt: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UserProfileResponse | UserProfileResponse[] | { error: string }>
) {
  const { userId } = req.query;

  if (req.method === 'GET') {
    try {
      if (userId && typeof userId === 'string') {
        // Get specific user profile
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: {
            followers: { select: { followerId: true } },
            following: { select: { followingId: true } }
          }
        });

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Check if current user follows this user (if authenticated)
        let isFollowing = false;
        const authHeader = req.headers.authorization;
        if (authHeader) {
          const token = authHeader.split(' ')[1];
          try {
            const currentUserRes = await fetch('https://api.github.com/user', {
              headers: { 'Authorization': `token ${token}` }
            });
            if (currentUserRes.ok) {
              const currentGithubUser = await currentUserRes.json();
              const currentUser = await prisma.user.findUnique({
                where: { githubId: currentGithubUser.id }
              });
              if (currentUser) {
                isFollowing = user.followers.some(f => f.followerId === currentUser.id);
              }
            }
          } catch (e) {
            // Ignore auth errors
          }
        }

        return res.status(200).json({
          id: user.id,
          githubUsername: user.githubUsername,
          githubName: user.githubName,
          githubAvatar: user.githubAvatar,
          githubBio: user.githubBio,
          githubFollowersCount: user.githubFollowersCount,
          githubFollowingCount: user.githubFollowingCount,
          followersCount: user.followers.length,
          followingCount: user.following.length,
          isFollowing,
          createdAt: user.createdAt.toISOString()
        });
      } else {
        // Get all profiles
        const users = await prisma.user.findMany({
          include: {
            followers: { select: { followerId: true } },
            following: { select: { followingId: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 100
        });

        return res.status(200).json(
          users.map(user => ({
            id: user.id,
            githubUsername: user.githubUsername,
            githubName: user.githubName,
            githubAvatar: user.githubAvatar,
            githubBio: user.githubBio,
            githubFollowersCount: user.githubFollowersCount,
            githubFollowingCount: user.githubFollowingCount,
            followersCount: user.followers.length,
            followingCount: user.following.length,
            createdAt: user.createdAt.toISOString()
          }))
        );
      }
    } catch (error) {
      console.error('Profile fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
