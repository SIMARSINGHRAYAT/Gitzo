// User and authentication related API calls

export interface UserStatus {
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

export interface UserProfile {
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

export interface FollowResponse {
  success: boolean;
  message?: string;
  followsRemaining?: number;
  error?: string;
}

/**
 * Check user status - whether they've completed requirements and if they're new
 */
export async function checkUserStatus(token: string): Promise<UserStatus> {
  const res = await fetch('/api/user/status', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error('Failed to check user status');
  }

  return res.json();
}

/**
 * Get user profile by ID
 */
export async function getUserProfile(userId: string, token?: string): Promise<UserProfile> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`/api/user/profile?userId=${userId}`, { headers });

  if (!res.ok) {
    throw new Error('Failed to get user profile');
  }

  return res.json();
}

/**
 * Get all user profiles for discovery
 */
export async function getAllProfiles(token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch('/api/user/profile', { headers });

  if (!res.ok) {
    throw new Error('Failed to get profiles');
  }

  return res.json() as Promise<UserProfile[]>;
}

/**
 * Follow a user
 */
export async function followUser(targetUserId: string, token: string): Promise<FollowResponse> {
  const res = await fetch('/api/follows', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      targetUserId,
      action: 'follow'
    })
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to follow user');
  }

  return res.json();
}

/**
 * Unfollow a user
 */
export async function unfollowUser(targetUserId: string, token: string): Promise<FollowResponse> {
  const res = await fetch('/api/follows', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      targetUserId,
      action: 'unfollow'
    })
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to unfollow user');
  }

  return res.json();
}

/**
 * Get remaining follows for today
 */
export async function getDailyFollowsRemaining(token: string) {
  const res = await fetch('/api/follows?type=daily-remaining', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    throw new Error('Failed to get daily follows remaining');
  }

  return res.json();
}

/**
 * Get followers of a user
 */
export async function getUserFollowers(token: string) {
  const res = await fetch('/api/follows?type=followers', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    throw new Error('Failed to get followers');
  }

  return res.json();
}

/**
 * Get following of a user
 */
export async function getUserFollowing(token: string) {
  const res = await fetch('/api/follows?type=following', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    throw new Error('Failed to get following');
  }

  return res.json();
}
