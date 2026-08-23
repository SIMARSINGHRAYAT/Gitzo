import { getOrigin, getRedirectUri } from '../config';

export default async function handler(req: any, res: any) {
  const { code, state, error } = req.query;
  const origin = getOrigin(req);
  if (error) return res.redirect(`${origin}/#oauth_error=${encodeURIComponent(error)}`);

  const cookies = parseCookies(req.headers.cookie || '');
  if (!state || state !== cookies.github_oauth_state) {
    return res.redirect(`${origin}/#oauth_error=OAuth%20state%20validation%20failed`);
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.redirect(`${origin}/#oauth_error=GitHub%20OAuth%20is%20not%20configured`);

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: getRedirectUri(req) }),
  });
  const token = await tokenResponse.json();
  res.setHeader('Set-Cookie', 'github_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  if (!token.access_token) return res.redirect(`${origin}/#oauth_error=${encodeURIComponent(token.error_description || 'GitHub OAuth exchange failed')}`);
  return res.redirect(`${origin}/#oauth_token=${encodeURIComponent(token.access_token)}`);
}

function parseCookies(value: string): Record<string, string> {
  return Object.fromEntries(value.split(';').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, decodeURIComponent(rest.join('='))];
  }).filter(([key]) => key));
}

