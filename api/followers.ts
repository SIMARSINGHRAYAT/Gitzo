// A minimal in-memory backend for community followers.

let communityFollowers: any[] = [];
let interactions: Record<string, string[]> = {}; // profileId -> array of user logins who followed

export default async function handler(req: any, res: any) {
  const { method } = req;
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `token ${token}` }
  });
  
  if (!userRes.ok) {
    return res.status(401).json({ error: 'Invalid GitHub token' });
  }
  
  const user = await userRes.json();
  const username = user.login;

  if (method === 'GET') {
    const activeCards = communityFollowers.map(profile => ({
      ...profile,
      hasFollowed: interactions[profile.id]?.includes(username) || false
    }));
    return res.status(200).json(activeCards);
  }

  if (method === 'POST') {
    const { action, profile, cardId } = req.body;

    if (action === 'submit') {
      const existing = communityFollowers.find(p => p.username === username);
      if (existing) {
        return res.status(200).json(existing);
      }
      
      const newCard = {
        id: `profile_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        username: user.login,
        avatarUrl: user.avatar_url,
        name: user.name,
        bio: user.bio,
        profileUrl: user.html_url,
        publicRepos: user.public_repos,
        followersCount: user.followers,
        followingCount: user.following,
        createdAt: new Date().toISOString()
      };
      
      communityFollowers.push(newCard);
      interactions[newCard.id] = [];
      return res.status(201).json(newCard);
    }
    
    if (action === 'follow') {
      if (!interactions[cardId]) interactions[cardId] = [];
      if (!interactions[cardId].includes(username)) {
        interactions[cardId].push(username);
      }
      return res.status(200).json({ success: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
