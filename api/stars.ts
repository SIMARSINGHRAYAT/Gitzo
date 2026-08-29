// A minimal in-memory backend for community stars.
// In a real production Vercel app, this would use Vercel KV, Postgres, or Firebase.
// This satisfies the "minimal secure backend" requirement for the exercise.

let communityStars: any[] = [];
let interactions: Record<string, string[]> = {}; // starId -> array of user logins who liked

export default async function handler(req: any, res: any) {
  const { method } = req;
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Basic mock auth check - we trust the client's token for this minimal backend
  // In a real app, we would verify the GitHub token here.
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
    // Return all cards not rejected by this user
    // (We handle reject on the frontend for simplicity or we can handle it here)
    const activeCards = communityStars.map(star => ({
      ...star,
      likes: interactions[star.id]?.length || 0,
      hasLiked: interactions[star.id]?.includes(username) || false
    }));
    return res.status(200).json(activeCards);
  }

  if (method === 'POST') {
    const { action, repo, cardId } = req.body;

    if (action === 'submit') {
      const userSubmissions = communityStars.filter(s => s.submittedBy === username);
      if (userSubmissions.length >= 2) {
        return res.status(400).json({ error: 'Maximum 2 repositories allowed per user.' });
      }
      
      const newCard = {
        id: `star_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        repoName: repo.name,
        repoOwner: repo.owner.login,
        repoDescription: repo.description,
        repoUrl: repo.html_url,
        avatarUrl: repo.owner.avatar_url,
        stargazersCount: repo.stargazers_count,
        submittedBy: username,
        createdAt: new Date().toISOString()
      };
      
      communityStars.push(newCard);
      interactions[newCard.id] = [];
      return res.status(201).json(newCard);
    }
    
    if (action === 'like') {
      if (!interactions[cardId]) interactions[cardId] = [];
      if (!interactions[cardId].includes(username)) {
        interactions[cardId].push(username);
      }
      return res.status(200).json({ success: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
