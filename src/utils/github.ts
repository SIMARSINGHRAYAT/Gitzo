import type { GitHubRepo, GitHubCollaborator, MergeMethod, DiscussionCategory } from '../types';

const API_VERSION = '2022-11-28';

export function getGitHubOAuthUrl() {
  return '/api/auth/github';
}

export async function fetchGitHubUser(accessToken: string) {
  const res = await ghFetch('/user', accessToken);
  if (!res.ok) throw new Error('GitHub OAuth session could not be verified.');
  return res.json() as Promise<{ login: string; avatar_url: string }>;
}

export async function fetchPrimaryGitHubEmail(accessToken: string): Promise<string | null> {
  const res = await ghFetch('/user/emails', accessToken);
  if (!res.ok) return null;
  const emails = await res.json() as Array<{ email: string; primary?: boolean; verified?: boolean }>;
  return emails.find(email => email.primary && email.verified)?.email || emails.find(email => email.verified)?.email || null;
}

/**
 * Wrapper around fetch that adds GitHub auth headers and handles network errors.
 */
export async function ghFetch(path: string, token: string, options?: RequestInit) {
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': API_VERSION,
        ...(options?.headers || {}),
      },
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new Error(`NETWORK_ERROR: ${message}`);
  }
}

export async function fetchAllRepos(token: string): Promise<GitHubRepo[]> {
  const allRepos: GitHubRepo[] = [];
  let page = 1;
  while (page <= 10) {
    const res = await ghFetch(
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      token
    );
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    allRepos.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return allRepos;
}

export async function fetchRepoCollaborators(token: string, owner: string, repo: string): Promise<GitHubCollaborator[]> {
  const collaborators: GitHubCollaborator[] = [];
  let page = 1;
  while (page <= 5) {
    const res = await ghFetch(`/repos/${owner}/${repo}/collaborators?per_page=100&page=${page}`, token);
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) return []; // no permission or not found
      return collaborators; // Ignore other errors or handle them gracefully
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    collaborators.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return collaborators;
}

export async function createRepository(token: string, name: string): Promise<GitHubRepo> {
  const res = await ghFetch('/user/repos', token, {
    method: 'POST',
    body: JSON.stringify({ name, auto_init: true, private: false }),
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) await handleGitError(res, 'Failed to create repository');
  return res.json();
}

export async function getFileContent(token: string, owner: string, repo: string, path: string, ref?: string): Promise<string> {
  const url = `/repos/${owner}/${repo}/contents/${path}` + (ref ? `?ref=${ref}` : '');
  const res = await ghFetch(url, token);
  if (!res.ok) {
    if (res.status === 404) return ''; // file doesn't exist
    await handleGitError(res, `Failed to get file content for ${path}`);
  }
  const data = await res.json();
  if (data.encoding === 'base64') {
    return decodeURIComponent(escape(atob(data.content)));
  }
  return data.content || '';
}

export async function testRepoPermission(
  token: string,
  owner: string,
  repo: string
): Promise<{ canCreate: boolean; error?: string }> {
  const repoRes = await ghFetch(`/repos/${owner}/${repo}`, token);
  if (!repoRes.ok) {
    const err = await repoRes.json().catch(() => ({ message: repoRes.statusText }));
    return { canCreate: false, error: `Cannot access repo: ${err.message}` };
  }
  const repoData = await repoRes.json();
  if (repoData.permissions) {
    if (!repoData.permissions.push && !repoData.permissions.admin) {
      return {
        canCreate: false,
        error: "You don't have write (push) access to this repository.",
      };
    }
  }
  return { canCreate: true };
}

// ── Issue API ──

export async function createIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels: string[]
) {
  const payload: Record<string, unknown> = { title, body };
  if (labels.length > 0) payload.labels = labels;

  const res = await ghFetch(`/repos/${owner}/${repo}/issues`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    if (res.status === 403) {
      if (err.message?.includes('Resource not accessible'))
        throw new Error(`PERMISSION_DENIED: ${err.message}`);
      if (err.message?.includes('rate limit') || err.message?.includes('abuse'))
        throw new Error(`RATE_LIMITED: ${err.message}`);
    }
    if (res.status === 401) {
      throw new Error(`PERMISSION_DENIED: Token expired or invalid (401 Unauthorized)`);
    }
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function closeIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number
) {
  const res = await ghFetch(`/repos/${owner}/${repo}/issues/${issueNumber}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Failed to close issue: ${err.message || `HTTP ${res.status}`}`);
  }
  return res.json();
}

// ── PR / Branch / Commit APIs ──

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Encode a UTF-8 string to base64 safely (supports non-ASCII characters).
 */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Standard error handler for git operations */
async function handleGitError(res: Response, step: string) {
  const err = await res.json().catch(() => ({ message: res.statusText }));
  if (res.status === 403 && err.message?.includes('Resource not accessible'))
    throw new Error(`PERMISSION_DENIED: ${err.message}`);
  if (res.status === 403 && (err.message?.includes('rate limit') || err.message?.includes('abuse')))
    throw new Error(`RATE_LIMITED: ${err.message}`);
  if (res.status === 401)
    throw new Error(`PERMISSION_DENIED: Token expired or invalid (401 Unauthorized)`);
  throw new Error(`${step}: ${err.message || `HTTP ${res.status}`}`);
}

export async function getDefaultBranchSHA(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<string> {
  const res = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  if (!res.ok) {
    if (res.status === 409) {
      throw new Error('EMPTY_REPO: Repository is empty (no commits). Create at least one commit first.');
    }
    await handleGitError(res, 'Failed to get branch ref');
  }
  const data = await res.json();
  if (!data?.object?.sha) {
    throw new Error('Failed to get branch SHA: invalid response from GitHub API');
  }
  return data.object.sha as string;
}

/** Get latest SHA with retries (useful after a merge when GitHub is still processing) */
export async function getDefaultBranchSHAWithRetry(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  previousSHA?: string,
  retries = 5,
  delayMs = 1000
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const sha = await getDefaultBranchSHA(token, owner, repo, branch);
      if (previousSHA && sha === previousSHA && attempt < retries - 1) {
        await sleep(delayMs);
        continue;
      }
      return sha;
    } catch (err) {
      if (attempt < retries - 1) {
        await sleep(delayMs);
      } else {
        throw err;
      }
    }
  }
  return await getDefaultBranchSHA(token, owner, repo, branch);
}

export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  sha: string
) {
  // First, try to delete the branch if it already exists (from a previous run)
  try {
    const checkRes = await ghFetch(
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branchName)}`,
      token
    );
    if (checkRes.ok) {
      // Branch exists — delete it first
      await ghFetch(
        `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`,
        token,
        { method: 'DELETE' }
      );
      // Small delay to let GitHub process the deletion
      await sleep(500);
    }
  } catch {
    // Ignore errors during cleanup — branch might not exist
  }

  const res = await ghFetch(`/repos/${owner}/${repo}/git/refs`, token, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    if (res.status === 422 && err.message?.includes('Reference already exists'))
      throw new Error(`BRANCH_EXISTS: Branch '${branchName}' already exists. Could not auto-delete it — check permissions.`);
    if (res.status === 403 && err.message?.includes('Resource not accessible'))
      throw new Error(`PERMISSION_DENIED: ${err.message}`);
    if (res.status === 401)
      throw new Error(`PERMISSION_DENIED: Token expired or invalid (401 Unauthorized)`);
    throw new Error(`Failed to create branch: ${err.message || `HTTP ${res.status}`}`);
  }
  return res.json();
}

/**
 * Commit a single file to a branch using the low-level Git Data API.
 */
export async function createFileOnBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  content: string,
  message: string,
  author?: { name: string; email: string }
) {
  const base = `/repos/${owner}/${repo}`;
  const jsonHeaders = { 'Content-Type': 'application/json' };

  // Step 1: Get the current commit SHA
  const refRes = await ghFetch(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  if (!refRes.ok) await handleGitError(refRes, 'Failed to get branch ref');
  const refData = await refRes.json();
  const latestCommitSHA: string = refData.object.sha;

  // Step 2: Get the tree SHA
  const commitRes = await ghFetch(`${base}/git/commits/${latestCommitSHA}`, token);
  if (!commitRes.ok) await handleGitError(commitRes, 'Failed to get commit');
  const commitData = await commitRes.json();
  const baseTreeSHA: string = commitData.tree.sha;

  // Step 3: Create a blob
  const base64Content = utf8ToBase64(content);
  const blobRes = await ghFetch(`${base}/git/blobs`, token, {
    method: 'POST',
    body: JSON.stringify({ content: base64Content, encoding: 'base64' }),
    headers: jsonHeaders,
  });
  if (!blobRes.ok) await handleGitError(blobRes, 'Failed to create blob');
  const blobData = await blobRes.json();

  // Step 4: Create a new tree
  const treeRes = await ghFetch(`${base}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSHA,
      tree: [{ path: filePath, mode: '100644', type: 'blob', sha: blobData.sha }],
    }),
    headers: jsonHeaders,
  });
  if (!treeRes.ok) await handleGitError(treeRes, 'Failed to create tree');
  const treeData = await treeRes.json();

  // Step 5: Create a new commit
  const newCommitRes = await ghFetch(`${base}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({ message, tree: treeData.sha, parents: [latestCommitSHA], ...(author ? { author, committer: author } : {}) }),
    headers: jsonHeaders,
  });
  if (!newCommitRes.ok) await handleGitError(newCommitRes, 'Failed to create commit');
  const newCommitData = await newCommitRes.json();

  // Step 6: Update the branch ref (force: true to avoid "not a fast forward" errors)
  const updateRefRes = await ghFetch(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommitData.sha, force: true }),
    headers: jsonHeaders,
  });
  if (!updateRefRes.ok) await handleGitError(updateRefRes, 'Failed to update branch ref');
  return updateRefRes.json();
}

/**
 * Commit MULTIPLE files to a branch in a single commit, with Co-authored-by trailers.
 * Uses the Git Data API: create blobs → create tree → create commit → update ref.
 * This is the core function for Pair Extraordinaire badge.
 */
export async function createMultiFileCommitWithCoAuthors(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: { path: string; content: string }[],
  commitMessage: string,
  coAuthors: { name: string; email: string }[],
  author?: { name: string; email: string }
) {
  if (files.length === 0) throw new Error('No files to commit.');

  const base = `/repos/${owner}/${repo}`;
  const jsonHeaders = { 'Content-Type': 'application/json' };

  // Build commit message with Co-authored-by trailers
  let fullMessage = commitMessage;
  if (coAuthors.length > 0) {
    fullMessage += '\n\n';
    fullMessage += coAuthors
      .map(ca => `Co-authored-by: ${ca.name} <${ca.email}>`)
      .join('\n');
  }

  // Step 1: Get the current commit SHA that the branch points to
  const refRes = await ghFetch(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  if (!refRes.ok) await handleGitError(refRes, 'Failed to get branch ref');
  const refData = await refRes.json();
  const latestCommitSHA: string = refData.object.sha;

  // Step 2: Get the tree SHA of that commit
  const commitRes = await ghFetch(`${base}/git/commits/${latestCommitSHA}`, token);
  if (!commitRes.ok) await handleGitError(commitRes, 'Failed to get commit');
  const commitData = await commitRes.json();
  const baseTreeSHA: string = commitData.tree.sha;

  // Step 3: Create blobs for EACH file
  const treeEntries: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const file of files) {
    const base64Content = utf8ToBase64(file.content);
    const blobRes = await ghFetch(`${base}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({ content: base64Content, encoding: 'base64' }),
      headers: jsonHeaders,
    });
    if (!blobRes.ok) await handleGitError(blobRes, `Failed to create blob for ${file.path}`);
    const blobData = await blobRes.json();
    treeEntries.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha,
    });
  }

  // Step 4: Create a new tree with ALL file entries
  const treeRes = await ghFetch(`${base}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTreeSHA, tree: treeEntries }),
    headers: jsonHeaders,
  });
  if (!treeRes.ok) await handleGitError(treeRes, 'Failed to create tree');
  const treeData = await treeRes.json();
  const newTreeSHA: string = treeData.sha;

  // Step 5: Create a commit WITH Co-authored-by trailers in the message
  const newCommitRes = await ghFetch(`${base}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({
      message: fullMessage,
      tree: newTreeSHA,
      parents: [latestCommitSHA],
      ...(author ? { author, committer: author } : {}),
    }),
    headers: jsonHeaders,
  });
  if (!newCommitRes.ok) await handleGitError(newCommitRes, 'Failed to create commit');
  const newCommitData = await newCommitRes.json();
  const newCommitSHA: string = newCommitData.sha;

  // Step 6: Update the branch ref to point to the new commit (force: true to avoid "not a fast forward" errors)
  const updateRefRes = await ghFetch(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommitSHA, force: true }),
    headers: jsonHeaders,
  });
  if (!updateRefRes.ok) await handleGitError(updateRefRes, 'Failed to update branch ref');

  return updateRefRes.json();
}

export async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string
) {
  const res = await ghFetch(`/repos/${owner}/${repo}/pulls`, token, {
    method: 'POST',
    body: JSON.stringify({ title, body, head, base }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    if (res.status === 403) {
      if (err.message?.includes('Resource not accessible'))
        throw new Error(`PERMISSION_DENIED: ${err.message}`);
      if (err.message?.includes('rate limit') || err.message?.includes('abuse'))
        throw new Error(`RATE_LIMITED: ${err.message}`);
    }
    if (res.status === 401)
      throw new Error(`PERMISSION_DENIED: Token expired or invalid (401 Unauthorized)`);
    if (res.status === 422) {
      throw new Error(`PR_VALIDATION: ${err.message || 'Validation error. The branch may have no changes relative to base.'}`);
    }
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function requestPRReview(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  reviewers: string[]
) {
  if (reviewers.length === 0) return;
  const res = await ghFetch(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, token, {
    method: 'POST',
    body: JSON.stringify({ reviewers }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    if (res.status === 422) {
      throw new Error(`Failed to request review. Make sure ${reviewers.join(', ')} is a valid collaborator and not yourself.`);
    }
    throw new Error(`Failed to request review: ${err.message || `HTTP ${res.status}`}`);
  }
  return res.json();
}

export async function verifyMergedPullRequest(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  maxRetries = 25,
  delayMs = 3000
) {
  let lastData: any = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await ghFetch(`/repos/${owner}/${repo}/pulls/${pullNumber}`, token);
      if (!res.ok) await handleGitError(res, `Failed to verify PR #${pullNumber}`);
      const data = await res.json() as { merged?: boolean; merged_at?: string | null; merge_commit_sha?: string | null };
      lastData = data;
      
      // Success: merged is true and merged_at is populated
      if (data.merged && data.merged_at) {
        return data;
      }
      
      // Merged but timestamp not yet populated - GitHub is still updating metadata
      if (data.merged && !data.merged_at) {
        if (attempt < maxRetries - 1) {
          await sleep(delayMs);
          continue;
        }
        // On final attempt, if merged=true, accept it and return (GitHub might be slow)
        return data;
      }
      
      // Not merged at all - this is a real failure
      if (!data.merged) {
        throw new Error(`PR #${pullNumber} was not recorded as merged by GitHub.`);
      }
    } catch (err) {
      // Network/API errors - retry
      if (attempt < maxRetries - 1) {
        await sleep(delayMs);
      } else {
        throw err;
      }
    }
  }
  
  // Final fallback: if we have data showing merged=true, accept it
  if (lastData && lastData.merged) {
    return lastData;
  }
  
  throw new Error(`PR #${pullNumber} was not recorded as merged by GitHub after ${maxRetries * delayMs / 1000} seconds of retries.`);
}

export async function verifyCoAuthorTrailer(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  coAuthors: { name: string; email: string }[]
) {
  const res = await ghFetch(`/repos/${owner}/${repo}/pulls/${pullNumber}/commits?per_page=100`, token);
  if (!res.ok) await handleGitError(res, `Failed to verify commits for PR #${pullNumber}`);
  const commits = await res.json() as Array<{ commit?: { message?: string } }>;
  const messages = commits.map(commit => commit.commit?.message || '').join('\n');
  const missing = coAuthors.find(coAuthor => !messages.toLowerCase().includes(`co-authored-by: ${coAuthor.name} <${coAuthor.email}>`.toLowerCase()));
  if (missing) throw new Error(`GitHub did not record the co-author trailer for ${missing.name}. Check that the email belongs to that GitHub account.`);
  return true;
}

/**
 * Wait for a PR to become mergeable by polling its status.
 */
export async function waitForMergeable(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  maxAttempts = 15,
  pollInterval = 1000
): Promise<{ mergeable: boolean; mergeable_state: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await ghFetch(`/repos/${owner}/${repo}/pulls/${pullNumber}`, token);
    if (!res.ok) {
      if (attempt < maxAttempts - 1) { await sleep(pollInterval); continue; }
      throw new Error(`Failed to check PR #${pullNumber} status: HTTP ${res.status}`);
    }
    const data = await res.json();

    if (data.mergeable === null) { await sleep(pollInterval); continue; }
    if (data.mergeable === true) {
      return { mergeable: true, mergeable_state: data.mergeable_state || 'clean' };
    }
    return { mergeable: false, mergeable_state: data.mergeable_state || 'unknown' };
  }
  return { mergeable: false, mergeable_state: 'GitHub is still calculating mergeability after 45 seconds' };
}

/**
 * Merge a PR with retries.
 */
export async function mergePullRequest(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  mergeMethod: MergeMethod = 'merge',
  maxRetries = 10
): Promise<{ merged: boolean; sha?: string; message?: string }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await ghFetch(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, token, {
        method: 'PUT',
        body: JSON.stringify({ merge_method: mergeMethod }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        return { merged: true, sha: data.sha, message: data.message };
      }

      const err = await res.json().catch(() => ({ message: res.statusText }));

      if (res.status === 405) {
        if (attempt < maxRetries - 1) { await sleep(3000); continue; }
        throw new Error(`Cannot merge PR #${pullNumber}: ${err.message || 'Method not allowed. Check branch protection rules.'}`);
      }
      if (res.status === 409) {
        if (attempt < maxRetries - 1) { await sleep(1500); continue; }
        throw new Error(`Merge conflict on PR #${pullNumber}: ${err.message}`);
      }
      if (res.status === 403) {
        if (err.message?.includes('Resource not accessible'))
          throw new Error(`PERMISSION_DENIED: ${err.message}`);
        if (err.message?.includes('rate limit') || err.message?.includes('abuse'))
          throw new Error(`RATE_LIMITED: ${err.message}`);
        throw new Error(`Forbidden: ${err.message}`);
      }
      if (res.status === 401) {
        throw new Error(`PERMISSION_DENIED: Token expired or invalid (401 Unauthorized)`);
      }
      throw new Error(`Merge failed (HTTP ${res.status}): ${err.message || res.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message.includes('PERMISSION_DENIED') || lastError.message.includes('RATE_LIMITED')) {
        throw lastError;
      }
      if (attempt < maxRetries - 1) { await sleep(1500); }
    }
  }
  throw lastError || new Error(`Failed to merge PR #${pullNumber} after ${maxRetries} attempts`);
}

/**
 * Delete a branch after merge (cleanup).
 */
export async function deleteBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string
): Promise<boolean> {
  try {
    const res = await ghFetch(
      `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`,
      token,
      { method: 'DELETE' }
    );
    return res.ok || res.status === 422;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════
// ── Galaxy Brain (GitHub Discussions via GraphQL API) ──
// ══════════════════════════════════════════════════════════════════════

/**
 * Execute a GitHub GraphQL query/mutation.
 */
export async function ghGraphQL(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string; type?: string }> }> {
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': API_VERSION,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => res.statusText);
      if (res.status === 401)
        throw new Error('PERMISSION_DENIED: Token expired or invalid (401 Unauthorized)');
      if (res.status === 403)
        throw new Error(`PERMISSION_DENIED: ${errBody}`);
      throw new Error(`GraphQL request failed (HTTP ${res.status}): ${errBody}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof Error && (err.message.includes('PERMISSION_DENIED') || err.message.includes('RATE_LIMITED'))) throw err;
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new Error(`NETWORK_ERROR: ${message}`);
  }
}

/**
 * Get the repository's GraphQL node ID and its discussion categories.
 * Returns only answerable (Q&A) categories.
 */
export async function getRepoDiscussionCategories(
  token: string,
  owner: string,
  repo: string
): Promise<{ repoNodeId: string; categories: DiscussionCategory[]; hasDiscussions: boolean }> {
  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        id
        hasDiscussionsEnabled
        discussionCategories(first: 25) {
          nodes {
            id
            name
            isAnswerable
          }
        }
      }
    }
  `;
  const result = await ghGraphQL(token, query, { owner, repo });
  if (result.errors && result.errors.length > 0) {
    const msg = result.errors[0].message;
    if (msg.includes('Resource not accessible')) {
      throw new Error('PERMISSION_DENIED: Token cannot access discussions. Ensure the token has "Discussions" read/write permission.');
    }
    throw new Error(`GraphQL error: ${msg}`);
  }
  const repoData = result.data?.repository as {
    id: string;
    hasDiscussionsEnabled: boolean;
    discussionCategories: { nodes: Array<{ id: string; name: string; isAnswerable: boolean }> };
  } | null;
  if (!repoData) {
    throw new Error('Could not fetch repository data. Check that the repo exists and the token has access.');
  }
  return {
    repoNodeId: repoData.id,
    hasDiscussions: repoData.hasDiscussionsEnabled,
    categories: repoData.discussionCategories.nodes.map(c => ({
      id: c.id,
      name: c.name,
      isAnswerable: c.isAnswerable,
    })),
  };
}

/**
 * Create a discussion in a repo using GraphQL.
 * Returns { discussionId, discussionNumber, discussionUrl }.
 */
export async function createDiscussion(
  token: string,
  repoNodeId: string,
  categoryId: string,
  title: string,
  body: string
): Promise<{ discussionId: string; discussionNumber: number; discussionUrl: string }> {
  const mutation = `
    mutation($repoId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
      createDiscussion(input: {
        repositoryId: $repoId,
        categoryId: $categoryId,
        title: $title,
        body: $body
      }) {
        discussion {
          id
          number
          url
        }
      }
    }
  `;
  const result = await ghGraphQL(token, mutation, {
    repoId: repoNodeId,
    categoryId,
    title,
    body,
  });
  if (result.errors && result.errors.length > 0) {
    const msg = result.errors[0].message;
    if (msg.includes('Resource not accessible'))
      throw new Error(`PERMISSION_DENIED: ${msg}`);
    if (msg.includes('was submitted too quickly'))
      throw new Error(`RATE_LIMITED: ${msg}`);
    throw new Error(`Failed to create discussion: ${msg}`);
  }
  const disc = (result.data?.createDiscussion as { discussion: { id: string; number: number; url: string } })?.discussion;
  if (!disc) throw new Error('Failed to create discussion: no data returned.');
  return {
    discussionId: disc.id,
    discussionNumber: disc.number,
    discussionUrl: disc.url,
  };
}

/**
 * Add a comment to a discussion using GraphQL.
 * Returns { commentId }.
 */
export async function addDiscussionComment(
  token: string,
  discussionId: string,
  body: string
): Promise<{ commentId: string }> {
  const mutation = `
    mutation($discussionId: ID!, $body: String!) {
      addDiscussionComment(input: {
        discussionId: $discussionId,
        body: $body
      }) {
        comment {
          id
        }
      }
    }
  `;
  const result = await ghGraphQL(token, mutation, { discussionId, body });
  if (result.errors && result.errors.length > 0) {
    const msg = result.errors[0].message;
    if (msg.includes('Resource not accessible'))
      throw new Error(`PERMISSION_DENIED: ${msg}`);
    if (msg.includes('was submitted too quickly'))
      throw new Error(`RATE_LIMITED: ${msg}`);
    throw new Error(`Failed to add comment: ${msg}`);
  }
  const comment = (result.data?.addDiscussionComment as { comment: { id: string } })?.comment;
  if (!comment) throw new Error('Failed to add comment: no data returned.');
  return { commentId: comment.id };
}

/**
 * Mark a discussion comment as the accepted answer using GraphQL.
 */
export async function markDiscussionCommentAsAnswer(
  token: string,
  commentId: string
): Promise<void> {
  const mutation = `
    mutation($commentId: ID!) {
      markDiscussionCommentAsAnswer(input: {
        id: $commentId
      }) {
        discussion {
          id
          answer {
            id
          }
        }
      }
    }
  `;
  const result = await ghGraphQL(token, mutation, { commentId });
  if (result.errors && result.errors.length > 0) {
    const msg = result.errors[0].message;
    if (msg.includes('Resource not accessible'))
      throw new Error(`PERMISSION_DENIED: ${msg}`);
    if (msg.includes('is not answerable') || msg.includes('not in an answerable category'))
      throw new Error(`CATEGORY_ERROR: Discussion is not in a Q&A (answerable) category. ${msg}`);
    throw new Error(`Failed to mark answer: ${msg}`);
  }
}

/**
 * Validate that a second token belongs to a different user.
 */
export async function validateSecondToken(
  token: string,
  primaryLogin: string
): Promise<{ login: string; avatar_url: string } | null> {
  const res = await ghFetch('/user', token);
  if (!res.ok) return null;
  const user = await res.json();
  if (user.login === primaryLogin) {
    throw new Error('SAME_USER: The answerer token belongs to the same user as the main token. You need TWO different GitHub accounts.');
  }
  return { login: user.login, avatar_url: user.avatar_url };
}

export async function checkRepoStarred(token: string, owner: string, repo: string): Promise<boolean> {
  const res = await ghFetch(`/user/starred/${owner}/${repo}`, token);
  return res.status === 204;
}

export async function starRepo(token: string, owner: string, repo: string): Promise<void> {
  const res = await ghFetch(`/user/starred/${owner}/${repo}`, token, {
    method: 'PUT',
    headers: { 'Content-Length': '0' }
  });
  if (res.status !== 204) throw new Error('Failed to star repository');
}

export async function checkUserFollowed(token: string, targetUser: string): Promise<boolean> {
  const res = await ghFetch(`/user/following/${targetUser}`, token);
  return res.status === 204;
}

export async function followUser(token: string, targetUser: string): Promise<void> {
  const res = await ghFetch(`/user/following/${targetUser}`, token, {
    method: 'PUT',
    headers: { 'Content-Length': '0' }
  });
  if (res.status !== 204) throw new Error('Failed to follow user');
}

/**
 * Fetch user data including public achievements/badges
 * This checks what GitHub itself recognizes about the user's activities
 */
export async function fetchUserWithAchievements(token: string, username: string): Promise<{
  login: string;
  name: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
}> {
  const res = await ghFetch(`/users/${username}`, token);
  if (!res.ok) throw new Error(`Failed to fetch user ${username}`);
  return res.json();
}

/**
 * Get statistics about user's pull requests across all repositories
 * This helps verify Pull Shark badge eligibility
 */
export async function fetchUserPRStatistics(token: string, username: string): Promise<{
  total_merged_prs: number;
  repositories_with_merged_prs: string[];
}> {
  // Fetch all repos the user has contributed to
  const reposRes = await ghFetch(`/users/${username}/repos?per_page=100&type=all&sort=updated`, token);
  if (!reposRes.ok) throw new Error('Failed to fetch repositories');
  const repos = await reposRes.json() as Array<{ full_name: string; owner: { login: string }; name: string }>;
  
  let total_merged = 0;
  const repos_with_merges: Set<string> = new Set();
  
  // For each repo, check for merged PRs by this user
  for (const repo of repos.slice(0, 10)) { // Check first 10 repos to avoid rate limits
    const prsRes = await ghFetch(
      `/search/issues?q=type:pr+author:${username}+repo:${repo.owner.login}/${repo.name}+is:merged&per_page=1`,
      token
    );
    if (prsRes.ok) {
      const data = await prsRes.json() as { total_count: number };
      if (data.total_count > 0) {
        total_merged += data.total_count;
        repos_with_merges.add(repo.full_name);
      }
    }
  }
  
  return {
    total_merged_prs: total_merged,
    repositories_with_merged_prs: Array.from(repos_with_merges)
  };
}

/**
 * Verify co-authored commits for a specific user across repositories
 * This helps verify Pair Extraordinaire badge eligibility
 */
export async function fetchUserCoAuthoredCommits(token: string, username: string): Promise<{
  total_co_authored: number;
  commits_with_trailers: Array<{ repo: string; message: string; co_authors: string[] }>;
}> {
  // Search for commits with co-authored-by trailers by this user
  const searchRes = await ghFetch(
    `/search/commits?q=author:${username}+"Co-authored-by"&per_page=10`,
    token
  );
  
  if (!searchRes.ok) {
    return { total_co_authored: 0, commits_with_trailers: [] };
  }
  
  const searchData = await searchRes.json() as { total_count: number; items?: Array<any> };
  
  const commits_with_trailers = (searchData.items || [])
    .map(item => {
      const message = item.commit?.message || '';
      const coAuthorMatches = message.match(/Co-authored-by: ([^<]+) <([^>]+)>/g) || [];
      return {
        repo: item.repository?.full_name || 'unknown',
        message: message.substring(0, 100),
        co_authors: coAuthorMatches.map((m: string) => m.replace(/Co-authored-by: /, ''))
      };
    });
  
  return {
    total_co_authored: searchData.total_count,
    commits_with_trailers
  };
}

/**
 * Verify that a specific email is registered with a GitHub user account
 * This is CRITICAL for Pair Extraordinaire badge - the co-author email MUST be registered
 */
export async function verifyCoAuthorEmail(token: string, targetUsername: string): Promise<{
  verified: boolean;
  emails: string[];
  message: string;
}> {
  try {
    // Fetch the target user's public profile
    const userRes = await ghFetch(`/users/${targetUsername}`, token);
    if (!userRes.ok) {
      return {
        verified: false,
        emails: [],
        message: `User ${targetUsername} not found`
      };
    }
    
    // Note: GitHub's public API doesn't directly expose user emails for privacy reasons
    // We can only check if a user exists and has a public email
    const userData = await userRes.json() as any;
    const publicEmail = userData.email || null;
    
    return {
      verified: !!publicEmail,
      emails: publicEmail ? [publicEmail] : [],
      message: publicEmail 
        ? `User has public email: ${publicEmail}` 
        : 'User does not have a public email. You may need to add their verified GitHub email manually.'
    };
  } catch (err) {
    return {
      verified: false,
      emails: [],
      message: `Error verifying user: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

export async function diagnoseAchievementEligibility(token: string, username: string): Promise<{
  pull_shark_eligible: boolean;
  pull_shark_details: { merged_prs: number; min_required: number; repos_contributed: number };
  pair_extraordinaire_eligible: boolean;
  pair_extraordinaire_details: { co_authored_commits: number; min_required: number };
  recommendations: string[];
}> {
  const prStats = await fetchUserPRStatistics(token, username);
  const coAuthorStats = await fetchUserCoAuthoredCommits(token, username);
  
  const recommendations: string[] = [];
  
  // Pull Shark: Needs 2+ merged PRs
  const pull_shark_eligible = prStats.total_merged_prs >= 2;
  if (!pull_shark_eligible) {
    recommendations.push(`Pull Shark: Need ${2 - prStats.total_merged_prs} more merged PRs`);
  }
  
  // Pair Extraordinaire: Needs co-authored commits
  const pair_extraordinaire_eligible = coAuthorStats.total_co_authored >= 1;
  if (!pair_extraordinaire_eligible) {
    recommendations.push('Pair Extraordinaire: Need at least 1 co-authored commit');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✓ All badges should be eligible - check GitHub profile settings or wait for badge sync');
  }
  
  return {
    pull_shark_eligible,
    pull_shark_details: {
      merged_prs: prStats.total_merged_prs,
      min_required: 2,
      repos_contributed: prStats.repositories_with_merged_prs.length
    },
    pair_extraordinaire_eligible,
    pair_extraordinaire_details: {
      co_authored_commits: coAuthorStats.total_co_authored,
      min_required: 1
    },
    recommendations
  };
}
