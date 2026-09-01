import prisma from '../db';
import type { NextApiRequest, NextApiResponse } from 'next';

interface UserStatusResponse {
  isNew: boolean;
  repositoryStarred: boolean;
  maintainerFollowed: boolean;
  requirementsComplete: boolean;
  user?: {
    id: string;
    githubUsername: string;
    githubName: string | null;
    githubAvatar: string | null;
  };
}

async function checkGitHubStatus(token: string, repoOwner: string, repoName: string, targetUser: string) {
  try {
    // Check if repository is starred
    const starRes = await fetch(`https://api.github.com/user/starred/${repoOwner}/${repoName}`, {
      headers: { 'Authorization': `token ${token}` }
    });
    const starred = starRes.status === 204;

    // Check if user follows target user
    const followRes = await fetch(`https://api.github.com/user/following/${targetUser}`, {
      headers: { 'Authorization': `token ${token}` }
    });
    const followed = followRes.status === 204;

    return { starred, followed };
  } catch (error) {
    console.error('GitHub API error:', error);
    return { starred: false, followed: false };
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UserStatusResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  try {
    // Fetch current GitHub user
    const userRes = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `token ${token}` }
    });

    if (!userRes.ok) {
      return res.status(401).json({ error: 'Invalid GitHub token' });
    }

    const githubUser = await userRes.json();
    const githubId = githubUser.id;
    const githubUsername = githubUser.login;

    // Check GitHub requirements
    const repoOwner = process.env.SUPPORT_REPO_OWNER || 'SIMARSINGHRAYAT';
    const repoName = process.env.SUPPORT_REPO_NAME || 'GitHubCrazy.com';
    const maintainer = process.env.SUPPORT_MAINTAINER || 'SIMARSINGHRAYAT';

    const { starred, followed } = await checkGitHubStatus(token, repoOwner, repoName, maintainer);

    // Check if user exists in database
    let user = await prisma.user.findUnique({
      where: { githubId }
    });

    const isNew = !user;

    // Create or update user
    if (!user) {
      user = await prisma.user.create({
        data: {
          githubId,
          githubUsername,
          githubName: githubUser.name || null,
          githubAvatar: githubUser.avatar_url || null,
          githubBio: githubUser.bio || null,
          githubFollowersCount: githubUser.followers || 0,
          githubFollowingCount: githubUser.following || 0,
          repositoryStarred: starred,
          maintainerFollowed: followed,
          lastRequirementCheck: new Date()
        }
      });
    } else {
      // Update existing user with latest GitHub info and status
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubName: githubUser.name || null,
          githubAvatar: githubUser.avatar_url || null,
          githubBio: githubUser.bio || null,
          githubFollowersCount: githubUser.followers || 0,
          githubFollowingCount: githubUser.following || 0,
          repositoryStarred: starred,
          maintainerFollowed: followed,
          lastRequirementCheck: new Date()
        }
      });
    }

    return res.status(200).json({
      isNew,
      repositoryStarred: starred,
      maintainerFollowed: followed,
      requirementsComplete: starred && followed,
      user: {
        id: user.id,
        githubUsername: user.githubUsername,
        githubName: user.githubName,
        githubAvatar: user.githubAvatar
      }
    });
  } catch (error) {
    console.error('User status error:', error);
    return res.status(500).json({ error: 'Failed to check user status' });
  }
}
