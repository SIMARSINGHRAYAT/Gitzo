import { useState, useRef, useEffect } from 'react';
import type {
  GitHubRepo, GitHubCollaborator, QuickdrawBadgeTemplate, YOLOBadgeTemplate, PRTemplate, PairTemplate, CoAuthor,
  CreatedItem, AppMode, MergeMethod,
} from './types';
import {
  fetchAllRepos, fetchRepoCollaborators, fetchPrimaryGitHubEmail, testRepoPermission, getGitHubOAuthUrl, fetchGitHubUser,
  getDefaultBranchSHA, getDefaultBranchSHAWithRetry,
  createBranch, createFileOnBranch, createPullRequest,
  createMultiFileCommitWithCoAuthors,
  waitForMergeable, mergePullRequest, verifyMergedPullRequest, verifyCoAuthorTrailer, deleteBranch,
  createIssue, closeIssue, requestPRReview
} from './utils/github';
import { cn } from './utils/cn';
import quickdrawBadge from '../logo/starstruck-default--light-a594e2a027e0.png';
import yoloBadge from '../logo/yolo-default-be0bbff04951.png';
import pullSharkBadge from '../logo/pull-shark-default-498c279a747d.png';
import pairExtraordinaireBadge from '../logo/pair-extraordinaire-default-579438a20e01.png';
import {
  Github, Key, ChevronDown, Play,
  CheckCircle2, XCircle, Loader2, AlertTriangle, Lock, Globe,
  Star, AlertCircle, RotateCcw, Sparkles, X,
  ChevronRight, Pause, ShieldCheck, ShieldAlert,
  GitPullRequest, GitMerge, GitBranch, Eye, EyeOff, Users, Award,
  Rocket, LogIn, ExternalLink,
} from 'lucide-react';
import { SupportProject } from './components/SupportProject';
import { FeatureSelection } from './components/FeatureSelection';
import { IncreaseStars } from './components/IncreaseStars';
import { IncreaseFollowers } from './components/IncreaseFollowers';

// ─── Constants ───────────────────────────────────────────────────────
const MAX_ITEMS = 300;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_CONSECUTIVE_ERRORS = 5;
const FLOATING_GITHUB_LOGOS = [
  { left: '4%', size: 'clamp(28px, 5vw, 72px)', delay: '-0.5s', duration: '4s' },
  { left: '18%', size: 'clamp(38px, 6vw, 90px)', delay: '-2s', duration: '5.5s' },
  { left: '32%', size: 'clamp(24px, 4vw, 58px)', delay: '-3.5s', duration: '4.5s' },
  { left: '48%', size: 'clamp(44px, 7vw, 100px)', delay: '-1s', duration: '6.5s' },
  { left: '64%', size: 'clamp(28px, 5vw, 70px)', delay: '-2.5s', duration: '5s' },
  { left: '80%', size: 'clamp(36px, 5vw, 76px)', delay: '-3s', duration: '6s' },
  { left: '93%', size: 'clamp(22px, 4vw, 54px)', delay: '-1.5s', duration: '4.5s' },
];

// ─── Utility ─────────────────────────────────────────────────────────
let idCounter = 0;
const uid = () => `item_${Date.now()}_${++idCounter}`;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Validation ──────────────────────────────────────────────────────
function validatePRConfig(templates: PRTemplate[]): string | null {
  if (templates.length === 0) return 'No pull requests to create. Generate them first.';
  if (templates.length > MAX_ITEMS) return `Maximum ${MAX_ITEMS} PRs allowed.`;
  const branchNames = new Set<string>();
  for (const pr of templates) {
    if (branchNames.has(pr.branchName)) return `Duplicate branch name: "${pr.branchName}".`;
    branchNames.add(pr.branchName);
  }
  return null;
}

function validatePairConfig(coAuthors: CoAuthor[], templates: PairTemplate[]): string | null {
  const validCoAuthors = coAuthors.filter(ca => ca.name.trim() && ca.email.trim());
  if (validCoAuthors.length === 0) return 'Add at least one co-author with both name and email.';
  if (templates.length === 0) return 'No pair PRs to create. Generate them first.';
  const branchNames = new Set<string>();
  for (const pt of templates) {
    if (branchNames.has(pt.branchName)) return `Duplicate branch name: "${pt.branchName}".`;
    branchNames.add(pt.branchName);
  }
  return null;
}

// ─── MAIN APP ────────────────────────────────────────────────────────
export default function App() {
  // Auth state
  const [token, setToken] = useState('');
  const [oauthError, setOauthError] = useState('');
  const [user, setUser] = useState<{ login: string; avatar_url: string } | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Repo state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
  const [permissionError, setPermissionError] = useState('');
  const [collaborators, setCollaborators] = useState<GitHubCollaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);

  // Template state
  const [quickdrawBadgeTemplates, setQuickdrawBadgeTemplates] = useState<QuickdrawBadgeTemplate[]>([]);
  const [yoloBadgeTemplates, setYOLOBadgeTemplates] = useState<YOLOBadgeTemplate[]>([]);
  const [prTemplates, setPRTemplates] = useState<PRTemplate[]>([]);
  const [pairTemplates, setPairTemplates] = useState<PairTemplate[]>([]);

  // Mode state
  const [appMode, setAppMode] = useState<AppMode>('quickdraw_badge');
  const [autoMerge, setAutoMerge] = useState(true);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('merge');
  const [deleteBranchAfterMerge, setDeleteBranchAfterMerge] = useState(true);
  const [coAuthors, setCoAuthors] = useState<CoAuthor[]>([{ name: '', email: '' }]);

  // Progress state
  const [createdItems, setCreatedItems] = useState<CreatedItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [appStep, setAppStep] = useState<'welcome' | 'support' | 'features' | 'badges' | 'stars' | 'followers'>('welcome');
  const [showAuth, setShowAuth] = useState(false);
  const [delayMs, setDelayMs] = useState(400);

  const pauseRef = useRef(false);
  const cancelRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const waitWhilePaused = async () => {
    while (pauseRef.current && !cancelRef.current) await delay(200);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setRepoDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Actions ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const oauthToken = fragment.get('oauth_token');
    const callbackError = params.get('oauth_error') || fragment.get('oauth_error');
    if (!oauthToken && !callbackError) return;
    window.history.replaceState({}, '', window.location.pathname);
    setShowAuth(true);
    if (callbackError) { setOauthError(callbackError); return; }
    setLoading(true);
    Promise.all([fetchGitHubUser(oauthToken), fetchPrimaryGitHubEmail(oauthToken), fetchAllRepos(oauthToken)]).then(([githubUser, email, repoData]) => {
      setUser(githubUser); setUserEmail(email); setToken(oauthToken);
      setRepos(repoData); setAppStep('support');
    }).catch((err: Error) => setOauthError(err.message)).finally(() => setLoading(false));
  }, []);

  const handleConnect = () => {
    setOauthError('');
    try { window.location.assign(getGitHubOAuthUrl()); }
    catch (err) { setOauthError(err instanceof Error ? err.message : 'Unable to start GitHub OAuth.'); }
  };

  const handleSelectRepo = async (repo: GitHubRepo) => {
    setSelectedRepo(repo); setRepoDropdownOpen(false); setRepoSearch('');
    setPermissionStatus('checking'); setPermissionError(''); setCollaborators([]); setCollaboratorsLoading(true);
    try {
      const result = await testRepoPermission(token, repo.owner.login, repo.name);
      setPermissionStatus(result.canCreate ? 'ok' : 'fail');
      if (!result.canCreate) setPermissionError(result.error || 'Cannot write to this repo.');
      setCollaborators(await fetchRepoCollaborators(token, repo.owner.login, repo.name));
    } catch (err: any) {
      setPermissionStatus('fail'); setError(err.message);
    } finally { setCollaboratorsLoading(false); }
  };

  const generateQuickdrawBadge = () => {
    setQuickdrawBadgeTemplates([{ id: uid(), title: `Quickdraw Badge Update`, body: `Automated issue closure at ${new Date().toISOString()}` }]);
  };

  const generateYOLOBadge = () => {
    if (!isValidEmail(coAuthors[0].email)) { setError('Enter the collaborator email associated with their GitHub account.'); return; }
    setYOLOBadgeTemplates([{
      id: uid(), title: `YOLO Badge Update`, branchName: `yolo-${Date.now()}`,
      filePath: `badges/yolo.md`, fileContent: `# YOLO Badge\nGenerated at ${new Date().toISOString()}`,
      coAuthors: [coAuthors[0]]
    }]);
  };

  const generatePRs = () => {
    const templates: PRTemplate[] = [];
    for (let i = 1; i <= 2; i++) {
      templates.push({
        id: uid(), title: `Automated PR #${i}`, branchName: `auto-pr-${i}-${Date.now()}`,
        body: `Automated batch process node #${i}.`, filePath: `testing/file-${i}.txt`,
        fileContent: `Node #${i} content generated at ${new Date().toISOString()}`
      });
    }
    setPRTemplates(templates);
  };

  const addCoAuthor = () => setCoAuthors(prev => [...prev, { name: '', email: '' }]);
  const removeCoAuthor = (idx: number) => setCoAuthors(prev => prev.filter((_, i) => i !== idx));
  const updateCoAuthor = (idx: number, field: keyof CoAuthor, value: string) => setCoAuthors(prev => prev.map((ca, i) => i === idx ? { ...ca, [field]: value } : ca));

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const generatePairTemplates = () => {
    const valid = coAuthors.filter(ca => ca.name && ca.email);
    if (valid.length === 0 || valid.some(ca => !isValidEmail(ca.email))) { setError('Every collaborator needs a valid email associated with their GitHub account.'); return; }
    setPairTemplates([{
      id: uid(), title: `Pair Session #1`, branchName: `pair-1-${Date.now()}`,
      body: `Co-authored session with ${valid.length} collaborators.`, coAuthors: valid,
      files: [{ path: `pair/log-1.md`, content: `Pair session content generated at ${new Date().toISOString()}` }]
    }]);
  };

  const commitAuthor = user && userEmail ? { name: user.login, email: userEmail } : undefined;

  // ── Workflows ──
  const startQuickdrawBadgeWorkflow = async () => {
    if (!selectedRepo || quickdrawBadgeTemplates.length === 0) return;
    cancelRef.current = false; pauseRef.current = false; setIsPaused(false);
    setStep(3); setIsCreating(true); setError('');
    const items: CreatedItem[] = quickdrawBadgeTemplates.map(t => ({ id: t.id, title: t.title, type: 'quickdraw_badge', status: 'pending' }));
    setCreatedItems(items);
    const owner = selectedRepo.owner.login; const repo = selectedRepo.name;
    try {
      const t = quickdrawBadgeTemplates[0];
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'creating', substatus: 'Opening Issue...' } : ci));
      const issue = await createIssue(token, owner, repo, t.title, t.body, []);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'merging', substatus: 'Closing Issue...', url: issue.html_url, number: issue.number } : ci));
      await delay(2000); await closeIssue(token, owner, repo, issue.number);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'merged', merged: true, substatus: undefined } : ci));
    } catch (err: any) {
      setCreatedItems(prev => prev.map(ci => ({ ...ci, status: 'error', error: err.message })));
    }
    setIsCreating(false); setStep(4);
  };

  const startYOLOBadgeWorkflow = async () => {
    if (!selectedRepo || yoloBadgeTemplates.length === 0) return;
    if (selectedRepo.private) { setError('YOLO Achievement requires a PUBLIC repository.'); return; }
    cancelRef.current = false; pauseRef.current = false; setIsPaused(false);
    setStep(3); setIsCreating(true); setError('');
    const items: CreatedItem[] = yoloBadgeTemplates.map(t => ({ id: t.id, title: t.title, type: 'yolo_badge', status: 'pending' }));
    setCreatedItems(items);
    const owner = selectedRepo.owner.login; const repo = selectedRepo.name; const baseBranch = selectedRepo.default_branch;
    try {
      const baseSHA = await getDefaultBranchSHA(token, owner, repo, baseBranch);
      const t = yoloBadgeTemplates[0];
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'creating', substatus: 'Creating branch...' } : ci));
      await createBranch(token, owner, repo, t.branchName, baseSHA);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, substatus: 'Committing with Co-author...' } : ci));
      await createMultiFileCommitWithCoAuthors(token, owner, repo, t.branchName, [{ path: t.filePath, content: t.fileContent }], t.title, t.coAuthors, commitAuthor);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, substatus: 'Opening Pull Request...' } : ci));
      const pr = await createPullRequest(token, owner, repo, t.title, 'YOLO flow — instant merge.', t.branchName, baseBranch);
      const reviewer = t.coAuthors[0].name.trim();
      if (reviewer) {
        setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, substatus: `Requesting review from @${reviewer}...` } : ci));
        await requestPRReview(token, owner, repo, pr.number, [reviewer]);
        await delay(2000);
      }
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'merging', substatus: 'Checking mergeability...', url: pr.html_url, number: pr.number } : ci));
      const mergeState = await waitForMergeable(token, owner, repo, pr.number, 45, 1000);
      if (!mergeState.mergeable && !mergeState.mergeable_state.includes('still calculating')) throw new Error(`PR #${pr.number} cannot be merged: ${mergeState.mergeable_state}.`);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, substatus: 'Merging instantly...' } : ci));
      const mergeResult = await mergePullRequest(token, owner, repo, pr.number, 'merge', 3);
      if (!mergeResult.merged) throw new Error(`GitHub did not merge PR #${pr.number}.`);
      await verifyMergedPullRequest(token, owner, repo, pr.number);
      try { await deleteBranch(token, owner, repo, t.branchName); } catch {}
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'merged', merged: true, substatus: undefined } : ci));
    } catch (err: any) {
      setCreatedItems(prev => prev.map(ci => ({ ...ci, status: 'error', error: err.message })));
    }
    setIsCreating(false); setStep(4);
  };

  const startCreatingPRs = async () => {
    if (!selectedRepo) return;
    const vError = validatePRConfig(prTemplates); if (vError) { setError(vError); return; }
    cancelRef.current = false; pauseRef.current = false; setIsPaused(false);
    setStep(3); setIsCreating(true);
    const items: CreatedItem[] = prTemplates.map(p => ({ id: p.id, title: p.title, type: 'pull_shark', status: 'pending', branchName: p.branchName }));
    setCreatedItems(items);
    const owner = selectedRepo.owner.login; const repo = selectedRepo.name; const base = selectedRepo.default_branch;
    try {
      let baseSHA = await getDefaultBranchSHA(token, owner, repo, base);
      for (let i = 0; i < prTemplates.length; i++) {
         if (cancelRef.current) break;
        await waitWhilePaused();
        if (cancelRef.current) break;
         const pr = prTemplates[i];
         try {
           setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'creating', substatus: 'Creating branch...' } : ci));
           await createBranch(token, owner, repo, pr.branchName, baseSHA);
          await createFileOnBranch(token, owner, repo, pr.branchName, pr.filePath, pr.fileContent, `Add ${pr.filePath}`, commitAuthor);
           const result = await createPullRequest(token, owner, repo, pr.title, pr.body, pr.branchName, base);
           if (autoMerge) {
             setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'merging', substatus: 'Merging...', url: result.html_url, number: result.number } : ci));
             const mergeState = await waitForMergeable(token, owner, repo, result.number, 45, 1000);
             if (!mergeState.mergeable && !mergeState.mergeable_state.includes('still calculating')) throw new Error(`PR #${result.number} cannot be merged: ${mergeState.mergeable_state}.`);
             const mergeResult = await mergePullRequest(token, owner, repo, result.number, mergeMethod, 3);
             if (!mergeResult.merged) throw new Error(`GitHub did not merge PR #${result.number}.`);
             await verifyMergedPullRequest(token, owner, repo, result.number);
             if (deleteBranchAfterMerge) try { await deleteBranch(token, owner, repo, pr.branchName); } catch {}
             setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'merged', merged: true, substatus: undefined, url: result.html_url, number: result.number } : ci));
             try { await delay(500); baseSHA = await getDefaultBranchSHAWithRetry(token, owner, repo, base, baseSHA, 3, 1000); } catch {}
           } else {
             setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'success', url: result.html_url, number: result.number, substatus: 'PR opened - waiting for manual merge' } : ci));
           }
         } catch (e: any) {
           setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'error', error: e.message } : ci));
         }
         await delay(delayMs);
      }
    } catch (err: any) { setError(err.message); }
    setIsCreating(false); setStep(4);
  };

  const startCreatingPairs = async () => {
    if (!selectedRepo) return;
    const vError = validatePairConfig(coAuthors, pairTemplates); if (vError) { setError(vError); return; }
    cancelRef.current = false; pauseRef.current = false; setIsPaused(false);
    setStep(3); setIsCreating(true);
    const items: CreatedItem[] = pairTemplates.map(p => ({ id: p.id, title: p.title, type: 'pair_extraordinaire', status: 'pending', branchName: p.branchName }));
    setCreatedItems(items);
    const owner = selectedRepo.owner.login; const repo = selectedRepo.name; const base = selectedRepo.default_branch;
    try {
      let baseSHA = await getDefaultBranchSHA(token, owner, repo, base);
      for (let i = 0; i < pairTemplates.length; i++) {
         if (cancelRef.current) break;
        await waitWhilePaused();
        if (cancelRef.current) break;
         const pt = pairTemplates[i];
         try {
           setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'creating', substatus: 'Creating branch...' } : ci));
           await createBranch(token, owner, repo, pt.branchName, baseSHA);
           await createMultiFileCommitWithCoAuthors(token, owner, repo, pt.branchName, pt.files, pt.title, pt.coAuthors, commitAuthor);
           const result = await createPullRequest(token, owner, repo, pt.title, pt.body, pt.branchName, base);
           setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'merging', substatus: 'Merging...', url: result.html_url, number: result.number } : ci));
           const mergeState = await waitForMergeable(token, owner, repo, result.number, 45, 1000);
           if (!mergeState.mergeable && !mergeState.mergeable_state.includes('still calculating')) throw new Error(`PR #${result.number} cannot be merged: ${mergeState.mergeable_state}.`);
           const mergeResult = await mergePullRequest(token, owner, repo, result.number, 'merge', 3);
           if (!mergeResult.merged) throw new Error(`GitHub did not merge PR #${result.number}.`);
           await verifyMergedPullRequest(token, owner, repo, result.number);
           await verifyCoAuthorTrailer(token, owner, repo, result.number, pt.coAuthors);
           if (deleteBranchAfterMerge) try { await deleteBranch(token, owner, repo, pt.branchName); } catch {}
           setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'merged', merged: true, substatus: undefined, url: result.html_url, number: result.number } : ci));
           try { await delay(500); baseSHA = await getDefaultBranchSHAWithRetry(token, owner, repo, base, baseSHA, 3, 1000); } catch {}
         } catch (e: any) {
           setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'error', error: e.message } : ci));
         }
         await delay(delayMs);
      }
    } catch (err: any) { setError(err.message); }
    setIsCreating(false); setStep(4);
  };

  const handleStart = () => {
    if (appMode === 'quickdraw_badge') startQuickdrawBadgeWorkflow();
    else if (appMode === 'yolo_badge') startYOLOBadgeWorkflow();
    else if (appMode === 'pull_shark') startCreatingPRs();
    else if (appMode === 'pair_extraordinaire') startCreatingPairs();
  };

  const reset = () => {
    cancelRef.current = false; pauseRef.current = false; setIsPaused(false);
    setStep(selectedRepo ? 2 : 0); setCreatedItems([]); setQuickdrawBadgeTemplates([]); setYOLOBadgeTemplates([]); setPRTemplates([]); setPairTemplates([]); setError('');
  };
  const disconnect = () => {
    cancelRef.current = true; pauseRef.current = false; setIsPaused(false);
    setStep(0); setAppStep('welcome'); setShowAuth(false); setToken(''); setUser(null); setUserEmail(null); setRepos([]); setSelectedRepo(null); setCollaborators([]); setCreatedItems([]); setError(''); setOauthError('');
  };

  const successCount = createdItems.filter(i => i.status === 'success' || i.status === 'merged').length;
  const errorCount = createdItems.filter(i => i.status === 'error').length;
  const progressPct = createdItems.length > 0 ? ((successCount + errorCount) / createdItems.length) * 100 : 0;
  const completionTitle = errorCount > 0 ? 'ATTENTION NEEDED' : 'ACTIVITY RECORDED';
  const queueCount = appMode === 'quickdraw_badge' ? quickdrawBadgeTemplates.length : appMode === 'yolo_badge' ? yoloBadgeTemplates.length : appMode === 'pull_shark' ? prTemplates.length : pairTemplates.length;
  const filteredRepos = repos.filter(r => r.full_name.toLowerCase().includes(repoSearch.toLowerCase()));
  const badgeAssets = {
    quickdraw_badge: quickdrawBadge,
    yolo_badge: yoloBadge,
    pull_shark: pullSharkBadge,
    pair_extraordinaire: pairExtraordinaireBadge,
  } as const;

  const togglePause = () => { pauseRef.current = !pauseRef.current; setIsPaused(!isPaused); };
  const cancelCreation = () => { cancelRef.current = true; pauseRef.current = false; setIsPaused(false); };

  // ── RENDER ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-gray-100 selection:bg-purple-500/30 font-sans app-shell">
      <div className="floating-githubs" aria-hidden="true">
        {FLOATING_GITHUB_LOGOS.map((logo, index) => (
          <Github key={index} className="floating-github" style={{ left: logo.left, width: logo.size, height: logo.size, animationDelay: logo.delay, animationDuration: logo.duration }} />
        ))}
      </div>
      <main className={cn('max-w-6xl mx-auto px-4 sm:px-6 relative z-10', step === 0 ? 'min-h-screen flex items-center justify-center py-12 sm:py-16' : 'py-8 sm:py-12')}>

        {(error || oauthError) && (
          <div className="mb-10 glass-card !bg-red-500/5 border-red-500/20 p-5 flex items-start gap-4 animate-in slide-in-from-top-4 duration-500">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-red-300 font-medium whitespace-pre-wrap">{error || oauthError}</div>
            <button onClick={() => { setError(''); setOauthError(''); }} className="text-red-500/50 hover:text-red-500"><X className="w-5 h-5" /></button>
          </div>
        )}

        {/* STEP 0 */}
        {appStep === 'welcome' && !showAuth && (
          <div className="max-w-3xl mx-auto text-center min-w-0">
            <h2 className="welcome-title font-black leading-tight text-white">GitHubCrazy<span className="text-green-400">.com</span></h2>
            <p className="welcome-quote italic text-gray-300 font-medium leading-relaxed max-w-2xl mx-auto mt-8">“Programs must be written for people to read, and only incidentally for machines to execute.”</p>
            <button onClick={() => setShowAuth(true)} className="mt-10 px-12 py-5 rounded-2xl bg-white text-gray-950 font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-white/10 hover:bg-green-400 transition-all">Get Started</button>
          </div>
        )}

        {appStep === 'welcome' && showAuth && (
          <div className="max-w-md mx-auto">
            <div className="glass-card p-10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-48 h-48 premium-gradient-purple blur-[100px] opacity-10"></div>
              <div className="text-center mb-10">
                 <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6 border border-white/10"><Key className="w-8 h-8 text-white" /></div>
                 <h3 className="text-xl font-black text-white tracking-widest uppercase">Welcome aboard</h3>
              </div>
              <div className="space-y-6">
                <p className="text-sm text-gray-500 leading-relaxed">Sign in securely with GitHub OAuth. GitHubCrazy never asks you to paste or manage a personal access token.</p>
                <button onClick={handleConnect} disabled={loading} className="w-full py-5 rounded-2xl bg-white text-gray-950 font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-xl shadow-white/10 hover:bg-green-400 disabled:opacity-50">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Github className="w-5 h-5" />} {loading ? 'CONNECTING...' : 'SIGN IN VIA GITHUB'} <ExternalLink className="w-4 h-4" />
                </button>
                <button onClick={() => setShowAuth(false)} className="w-full py-3 text-[10px] font-black uppercase tracking-widest text-gray-600 hover:text-white transition-colors">Back to welcome</button>
              </div>
            </div>
          </div>
        )}

        {/* SUPPORT PROJECT */}
        {appStep === 'support' && token && (
           <SupportProject token={token} onComplete={() => setAppStep('features')} />
        )}

        {/* FEATURE SELECTION */}
        {appStep === 'features' && (
           <FeatureSelection onSelectFeature={(feature) => {
              if (feature === 'badges') {
                setAppStep('badges');
                setStep(1);
              } else if (feature === 'stars') {
                setAppStep('stars');
              } else if (feature === 'followers') {
                setAppStep('followers');
              }
           }} />
        )}

        {/* INCREASE STARS */}
        {appStep === 'stars' && token && user && (
           <IncreaseStars token={token} user={user} repos={repos} />
        )}

        {/* INCREASE FOLLOWERS */}
        {appStep === 'followers' && token && user && (
           <IncreaseFollowers token={token} user={user} />
        )}

        {/* STEP 1 */}
        {appStep === 'badges' && step === 1 && (
          <div className="max-w-3xl mx-auto staggered-list text-center">
            <div className="flex justify-end mb-5">
              <button onClick={disconnect} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-red-400 transition-all">Log out</button>
            </div>
            <div className="glass-card p-6 sm:p-10 lg:p-14 relative overflow-visible">
              <div className="flex items-center gap-6 mb-12">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10"><Globe className="w-7 h-7 text-blue-400" /></div>
                <div>
                  <h2 className="text-2xl font-black text-white">REPOSITORY</h2>
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mt-1">Target destination management</p>
                </div>
              </div>
              <div className="relative mb-10" ref={dropdownRef}>
                <div onClick={() => setRepoDropdownOpen(!repoDropdownOpen)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-5 text-sm cursor-pointer flex items-center justify-between hover:border-white/20 transition-all font-bold">
                  <span className={cn('min-w-0 break-all', selectedRepo ? 'text-white' : 'text-gray-600')}>{selectedRepo ? selectedRepo.full_name : 'Browse available repositories...'}</span>
                  <ChevronDown className={cn('w-5 h-5 transition-transform', repoDropdownOpen && 'rotate-180')} />
                </div>
                {repoDropdownOpen && (
                  <div className="repo-menu absolute top-full left-0 right-0 mt-3 glass-card !bg-gray-950/98 border-white/10 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="p-4 border-b border-white/5 bg-white/5">
                       <input type="text" autoFocus value={repoSearch} onChange={e => setRepoSearch(e.target.value)} placeholder="Filter results..." className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none placeholder:text-gray-700" />
                    </div>
                    <div className="repo-list max-h-[min(62vh,560px)] overflow-y-auto overscroll-contain">
                      {filteredRepos.length === 0 && <div className="px-6 py-8 text-center text-xs font-bold text-gray-600">No repositories found</div>}
                      {filteredRepos.map(r => (
                        <div key={r.id} onClick={() => handleSelectRepo(r)} className="px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between border-b border-white/5 last:border-0">
                          <div className="flex items-center gap-4">
                             <img src={r.owner.avatar_url} alt="" className="w-6 h-6 rounded-lg" />
                             <span className="text-sm font-bold text-gray-300">{r.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                             {r.private && <Lock className="w-3 h-3 text-amber-500/50" />}
                             <span className="text-[10px] font-black text-gray-600 tracking-tighter">{r.stargazers_count} ★</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {selectedRepo && (
                 <div className="mb-10 grid grid-cols-2 gap-4 animate-in fade-in duration-500">
                    <div className="p-6 glass-card !bg-white/2 border-white/5">
                       <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Visibility</div>
                       <div className="text-xs font-bold text-gray-300 flex items-center gap-2">{selectedRepo.private ? <ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> : <Globe className="w-3.5 h-3.5 text-green-500" />} {selectedRepo.private ? 'PRIVATE' : 'PUBLIC'}</div>
                    </div>
                    <div className="p-6 glass-card !bg-white/2 border-white/5">
                       <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Branch</div>
                       <div className="text-xs font-bold text-gray-300 flex items-center gap-2"><GitBranch className="w-3.5 h-3.5" /> {selectedRepo.default_branch}</div>
                    </div>
                 </div>
              )}
                {permissionError && <div className="mb-10 rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm font-medium text-red-300">{permissionError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setStep(0)} className="py-4 rounded-2xl bg-white/5 text-gray-600 font-black text-[10px] uppercase tracking-widest hover:text-white transition-all">BACK</button>
                <button onClick={() => setStep(2)} disabled={!selectedRepo || permissionStatus !== 'ok'} className={cn('py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2', !selectedRepo || permissionStatus !== 'ok' ? 'bg-white/5 text-gray-800 cursor-not-allowed' : 'premium-gradient-purple text-white')}>CONTINUE <ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {appStep === 'badges' && step === 2 && selectedRepo && (
           <div className="max-w-5xl mx-auto space-y-10 text-center">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">Choose an achievement workflow</p>
                <button onClick={disconnect} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-red-400 transition-all">Log out</button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: 'quickdraw_badge', label: 'QuickDraw', icon: Sparkles },
                  { id: 'yolo_badge', label: 'YOLO Badge', icon: Rocket },
                  { id: 'pull_shark', label: 'Pull Shark', icon: GitPullRequest },
                  { id: 'pair_extraordinaire', label: 'Pair Extraordinaire', icon: Award }
                ].map(mode => (
                  <button key={mode.id} onClick={() => setAppMode(mode.id as any)} className={cn("px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-3", appMode === mode.id ? "bg-white text-gray-950 border-white shadow-xl" : "bg-white/5 border-white/5 text-gray-600 hover:text-white")}>
                    <mode.icon className="w-4 h-4" /> {mode.label}
                  </button>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-10">
                 <div className="glass-card p-10 flex flex-col items-center justify-center text-center opacity-60 hover:opacity-100 transition-opacity">
                    <img src={badgeAssets[appMode]} alt={`${appMode.replace('_', ' ')} badge`} className="badge-reference" />
                    <h3 className="text-2xl font-black text-white mb-4 uppercase tracking-tighter">{appMode.replace('_', ' ')}</h3>
                    <p className="text-sm text-gray-600 font-medium leading-relaxed">Node based orchestration for {appMode.replace('_', ' ')} achievement triggers.</p>
                 </div>

                 <div className="glass-card p-10 space-y-8 flex flex-col h-full items-start">
                    <div className="w-full flex-1 space-y-6">
                       {appMode === 'quickdraw_badge' && (
                         <div className="space-y-6 w-full">
                            <div className="p-6 glass-card !bg-purple-500/5 border-purple-500/10 text-xs text-gray-500 leading-relaxed font-bold uppercase tracking-widest">Automation involves opening a priority issue and archiving it within seconds.</div>
                            <button onClick={generateQuickdrawBadge} className="w-full py-5 rounded-2xl premium-gradient-purple text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl">INITIALIZE NODE</button>
                         </div>
                       )}
                       {appMode === 'yolo_badge' && (
                         <div className="space-y-6 w-full">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                              <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Reviewer Username</label>
                                  <select value={coAuthors[0].name} onChange={e => updateCoAuthor(0, 'name', e.target.value)} disabled={collaboratorsLoading || collaborators.length === 0} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white disabled:text-gray-700">
                                    <option value="">{collaboratorsLoading ? 'Loading collaborators...' : collaborators.length ? 'Select collaborator' : 'No collaborators found'}</option>
                                    {collaborators.map(collaborator => <option key={collaborator.id} value={collaborator.login}>{collaborator.login}</option>)}
                                  </select>
                               </div>
                               <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Git Email</label>
                                  <input value={coAuthors[0].email} onChange={e => updateCoAuthor(0, 'email', e.target.value)} placeholder="github-associated-email@example.com" className="w-full min-w-0 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" />
                               </div>
                            </div>
                            <p className="text-[10px] text-gray-600">Use the collaborator’s verified GitHub email, including their GitHub noreply address if applicable.</p>
                            <button onClick={generateYOLOBadge} disabled={!coAuthors[0].name || !isValidEmail(coAuthors[0].email)} className="w-full py-5 rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl disabled:opacity-30 disabled:cursor-not-allowed">BUILD YOLO FLOW</button>
                         </div>
                       )}
                       {appMode === 'pull_shark' && (
                         <div className="space-y-6 w-full">
                           <div className="p-6 glass-card !bg-green-500/5 border-green-500/10 text-xs text-gray-500 leading-relaxed font-bold uppercase tracking-widest">Create authentic pull requests in your selected repository to progress the Pull Shark achievement.</div>
                           <button onClick={() => setAutoMerge(!autoMerge)} className="w-full py-4 text-xs font-black uppercase tracking-widest border border-white/10 rounded-2xl text-gray-400">AUTO-MERGE: {autoMerge ? 'ON' : 'OFF'}</button>
                           <button onClick={generatePRs} className="w-full py-5 rounded-2xl premium-gradient-green text-white font-black text-xs uppercase tracking-widest">GENERATE PULL REQUESTS</button>
                         </div>
                       )}
                       {appMode === 'pair_extraordinaire' && (
                         <div className="space-y-6 w-full">
                            <div className="p-6 glass-card !bg-amber-500/5 border-amber-500/10 text-xs text-gray-500 leading-relaxed font-bold uppercase tracking-widest">Credit collaborators with co-authored commits and merged pull requests for Pair Extraordinaire.</div>
                            {coAuthors.map((ca, i) => (
                               <div key={i} className="flex flex-col sm:flex-row gap-2 min-w-0">
                                  <select value={ca.name} onChange={e => updateCoAuthor(i, 'name', e.target.value)} disabled={collaboratorsLoading || collaborators.length === 0} className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white disabled:text-gray-700">
                                    <option value="">{collaboratorsLoading ? 'Loading...' : collaborators.length ? 'Select collaborator' : 'No collaborators'}</option>
                                    {collaborators.map(collaborator => <option key={collaborator.id} value={collaborator.login}>{collaborator.login}</option>)}
                                  </select>
                                  <input value={ca.email} onChange={e => updateCoAuthor(i, 'email', e.target.value)} placeholder="github-associated-email@example.com" className="flex-1 min-w-0 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" />
                                  <button onClick={() => removeCoAuthor(i)} className="px-3 text-red-500"><X className="w-4 h-4" /></button>
                               </div>
                            ))}
                            <button onClick={addCoAuthor} className="w-full py-2 text-[10px] font-black uppercase text-gray-600">+ Add Member</button>
                            <button onClick={generatePairTemplates} disabled={coAuthors.length === 0 || coAuthors.some(ca => !ca.name || !isValidEmail(ca.email))} className="w-full py-5 rounded-2xl premium-gradient-purple text-white font-black text-xs uppercase tracking-[0.2em] disabled:opacity-30 disabled:cursor-not-allowed">START SESSION</button>
                         </div>
                       )}
                    </div>
                    <div className="w-full pt-10 mt-auto border-t border-white/5 flex items-center justify-between">
                       <div className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Queue: {queueCount} items</div>
                       <button onClick={handleStart} disabled={queueCount === 0} className="px-12 py-5 rounded-2xl premium-gradient-purple text-white font-black text-xs uppercase tracking-widest shadow-2xl shadow-purple-500/20">EXECUTE</button>
                    </div>
                 </div>
              </div>
           </div>
        )}

        {/* STEP 3 & 4 */}
        {appStep === 'badges' && (step === 3 || step === 4) && (
          <div className="max-w-4xl mx-auto space-y-8 text-center">
             <div className="glass-card p-10 lg:p-14 relative overflow-hidden">
                <div className="flex items-center justify-between mb-16">
                   <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10">{step === 4 ? <CheckCircle2 className="w-8 h-8 text-green-500" /> : <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />}</div>
                      <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter">{step === 4 ? completionTitle : 'EXECUTING'}</h2>
                        <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mt-1">{step === 4 ? `${successCount} recorded, ${errorCount} failed` : 'Workflow node performance'}</p>
                      </div>
                   </div>
                   {step === 3 && (
                     <div className="flex gap-3">
                       <button onClick={togglePause} className="p-4 rounded-2xl bg-white/5 border border-white/10">{isPaused ? <Play className="w-5 h-5 text-green-500" /> : <Pause className="w-5 h-5 text-amber-500" />}</button>
                       <button onClick={cancelCreation} className="p-4 rounded-2xl bg-white/5 border border-white/10 text-red-500"><X className="w-5 h-5" /></button>
                     </div>
                   )}
                </div>
                <div className="h-4 bg-black/40 rounded-full border border-white/5 p-1 mb-20 overflow-hidden relative"><div className="h-full rounded-full premium-gradient-purple shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all duration-1000" style={{ width: `${progressPct}%` }}></div></div>
                <div className="space-y-4">
                   {createdItems.map((item, i) => (
                     <div key={item.id} className="p-5 glass-card !bg-white/2 border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                           <span className="text-[10px] font-black text-gray-800 font-mono">#{i+1}</span>
                           <span className="text-xs font-bold text-gray-300">{item.title}</span>
                        </div>
                        <div className="flex items-center gap-4">
                           <span className={cn("text-[9px] font-black uppercase tracking-widest", item.status === 'merged' ? 'text-green-500' : item.status === 'error' ? 'text-red-400' : 'text-gray-600')}>{item.substatus || item.status}</span>
                           {item.error && <span className="max-w-xs text-right text-[10px] text-red-300/80">{item.error}</span>}
                           {item.url && <a href={item.url} target="_blank" className="p-2 rounded-lg bg-white/5 hover:text-white transition-all"><ChevronRight className="w-4 h-4 text-gray-700 hover:text-white" /></a>}
                        </div>
                     </div>
                   ))}
                </div>
                {step === 4 && <button onClick={reset} className="w-full mt-16 py-6 rounded-3xl bg-white text-gray-950 font-black text-xs uppercase tracking-widest shadow-2xl">START NEW BATCH</button>}
             </div>
          </div>
        )}
      </main>

      {(appStep !== 'welcome' || showAuth) && (
        <footer className="py-20 text-center opacity-30">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-700">&copy; {new Date().getFullYear()} GitHubCrazy.com</p>
        </footer>
      )}
    </div>
  );
}
