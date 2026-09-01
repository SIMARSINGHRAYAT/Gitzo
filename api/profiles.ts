import prisma from '../../db';
import type { NextApiRequest, NextApiResponse } from 'next';

interface ProfileCard {
  id: string;
  githubUsername: string;
  githubName: string | null;
  githubAvatar: string | null;
  githubBio: string | null;
  followersCount: number;
  isFollowing?: boolean;
  createdAt: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ profiles: ProfileCard[] } | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let currentUserId: string | null = null;

    // Get current user if authenticated
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token) {
        try {
          const userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
          });
          if (userRes.ok) {
            const githubUser = await userRes.json();
            const currentUser = await prisma.user.findUnique({
              where: { githubId: githubUser.id }
            });
            if (currentUser) {
              currentUserId = currentUser.id;
            }
          }
        } catch (e) {
          // Ignore auth errors
        }
      }
    }

    // Get all profiles with follower counts
    const profiles = await prisma.user.findMany({
      include: {
        followers: { select: { followerId: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    const profileCards: ProfileCard[] = profiles.map(profile => {
      const isFollowing = currentUserId
        ? profile.followers.some(f => f.followerId === currentUserId)
        : false;

      return {
        id: profile.id,
        githubUsername: profile.githubUsername,
        githubName: profile.githubName,
        githubAvatar: profile.githubAvatar,
        githubBio: profile.githubBio,
        followersCount: profile.followers.length,
        isFollowing,
        createdAt: profile.createdAt.toISOString()
      };
    });

    return res.status(200).json({ profiles: profileCards });
  } catch (error) {
    console.error('Profiles fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch profiles' });
  }
}
