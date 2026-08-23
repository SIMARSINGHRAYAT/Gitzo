import crypto from 'node:crypto';
import { getRedirectUri } from '../config';

export default function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return res.status(500).send('GITHUB_CLIENT_ID is not configured.');

  const state = crypto.randomBytes(24).toString('hex');
  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo read:user',
    state,
  });
  res.setHeader('Set-Cookie', `github_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  return res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}
