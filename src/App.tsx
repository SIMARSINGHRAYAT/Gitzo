import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  GitHubRepo, QuickdrawBadgeTemplate, YOLOBadgeTemplate, PRTemplate, PairTemplate, CoAuthor,
  CreatedItem, TokenInfo, AppMode, MergeMethod,
} from './types';
import {
  detectTokenType, validateToken, fetchAllRepos, testRepoPermission,
  getDefaultBranchSHA, getDefaultBranchSHAWithRetry,
  createBranch, createFileOnBranch, createPullRequest,
  createMultiFileCommitWithCoAuthors,
  waitForMergeable, mergePullRequest, deleteBranch,
  createIssue, closeIssue, requestPRReview
} from './utils/github';
import { cn } from './utils/cn';
import {
  Github, Key, Search, ChevronDown, Plus, Trash2, Play,
  CheckCircle2, XCircle, Loader2, AlertTriangle, Lock, Globe,
  Star, AlertCircle, RotateCcw, Sparkles, X,
  ChevronRight, Pause, Download, ShieldCheck, ShieldAlert,
  GitPullRequest, GitMerge, GitBranch, Eye, EyeOff, Users, Award,
  Rocket,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────
const MAX_ITEMS = 300;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_CONSECUTIVE_ERRORS = 5;

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
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [user, setUser] = useState<{ login: string; avatar_url: string } | null>(null);

  // Repo state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
  const [permissionError, setPermissionError] = useState('');

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
  const [delayMs, setDelayMs] = useState(400);

  const pauseRef = useRef(false);
  const cancelRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setRepoDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Actions ──
  const handleConnect = useCallback(async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    setLoading(true); setError('');
    try {
      const result = await validateToken(trimmed);
      if (!result) { setError('Invalid token. Please check and try again.'); return; }
      const { user: u, tokenInfo: t } = result;
      if (t.type === 'classic' && !t.hasRepoScope) {
        setError(`Classic token missing "repo" scope. Scopes found: [${t.scopes.join(', ') || 'none'}].`);
        return;
      }
      setUser(u); setToken(trimmed); setTokenInfo(t);
      const repoData = await fetchAllRepos(trimmed);
      setRepos(repoData);
      setStep(1);
    } catch (err: any) {
      setError(err.message || 'Connection failed.');
    } finally { setLoading(false); }
  }, [tokenInput]);

  const handleSelectRepo = async (repo: GitHubRepo) => {
    setSelectedRepo(repo); setRepoDropdownOpen(false); setRepoSearch('');
    setPermissionStatus('checking'); setPermissionError('');
    try {
      const result = await testRepoPermission(token, repo.owner.login, repo.name);
      setPermissionStatus(result.canCreate ? 'ok' : 'fail');
      if (!result.canCreate) setPermissionError(result.error || 'Cannot write to this repo.');
    } catch (err: any) {
      setPermissionStatus('fail'); setError(err.message);
    }
  };

  const generateQuickdrawBadge = () => {
    setQuickdrawBadgeTemplates([{ id: uid(), title: `Quickdraw Badge Update`, body: `Automated issue closure at ${new Date().toISOString()}` }]);
  };

  const generateYOLOBadge = () => {
    if (!coAuthors[0].name || !coAuthors[0].email) { setError('Please provide Reviewer Name and Email for YOLO attribution.'); return; }
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

  const generatePairTemplates = () => {
    const valid = coAuthors.filter(ca => ca.name && ca.email);
    setPairTemplates([{
      id: uid(), title: `Pair Session #1`, branchName: `pair-1-${Date.now()}`,
      body: `Co-authored session with ${valid.length} collaborators.`, coAuthors: valid,
      files: [{ path: `pair/log-1.md`, content: `Pair session content generated at ${new Date().toISOString()}` }]
    }]);
  };

  // ── Workflows ──
  const startQuickdrawBadgeWorkflow = async () => {
    if (!selectedRepo || quickdrawBadgeTemplates.length === 0) return;
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
      await createMultiFileCommitWithCoAuthors(token, owner, repo, t.branchName, [{ path: t.filePath, content: t.fileContent }], t.title, t.coAuthors);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, substatus: 'Opening Pull Request...' } : ci));
      const pr = await createPullRequest(token, owner, repo, t.title, 'YOLO flow — instant merge.', t.branchName, baseBranch);
      const reviewer = t.coAuthors[0].name.trim();
      if (reviewer) {
        setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, substatus: `Requesting review from @${reviewer}...` } : ci));
        await requestPRReview(token, owner, repo, pr.number, [reviewer]);
        await delay(2000);
      }
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'merging', substatus: 'Checking mergeability...', url: pr.html_url, number: pr.number } : ci));
      await waitForMergeable(token, owner, repo, pr.number, 15, 1000);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, substatus: 'Merging instantly...' } : ci));
      await mergePullRequest(token, owner, repo, pr.number, 'merge', 3);
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
    setStep(3); setIsCreating(true);
    const items: CreatedItem[] = prTemplates.map(p => ({ id: p.id, title: p.title, type: 'prs', status: 'pending', branchName: p.branchName }));
    setCreatedItems(items);
    const owner = selectedRepo.owner.login; const repo = selectedRepo.name; const base = selectedRepo.default_branch;
    try {
      let baseSHA = await getDefaultBranchSHA(token, owner, repo, base);
      for (let i = 0; i < prTemplates.length; i++) {
         if (cancelRef.current) break;
         const pr = prTemplates[i];
         try {
           setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'creating', substatus: 'Creating branch...' } : ci));
           await createBranch(token, owner, repo, pr.branchName, baseSHA);
           await createFileOnBranch(token, owner, repo, pr.branchName, pr.filePath, pr.fileContent, `Add ${pr.filePath}`);
           const result = await createPullRequest(token, owner, repo, pr.title, pr.body, pr.branchName, base);
           if (autoMerge) {
             setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'merging', substatus: 'Merging...', url: result.html_url, number: result.number } : ci));
             await waitForMergeable(token, owner, repo, result.number, 15, 1000);
             await mergePullRequest(token, owner, repo, result.number, mergeMethod, 3);
             if (deleteBranchAfterMerge) try { await deleteBranch(token, owner, repo, pr.branchName); } catch {}
             setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'merged', merged: true, substatus: undefined, url: result.html_url, number: result.number } : ci));
             try { await delay(500); baseSHA = await getDefaultBranchSHAWithRetry(token, owner, repo, base, baseSHA, 3, 1000); } catch {}
           } else {
             setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'success', url: result.html_url, number: result.number, substatus: undefined } : ci));
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
    setStep(3); setIsCreating(true);
    const items: CreatedItem[] = pairTemplates.map(p => ({ id: p.id, title: p.title, type: 'pair', status: 'pending', branchName: p.branchName }));
    setCreatedItems(items);
    const owner = selectedRepo.owner.login; const repo = selectedRepo.name; const base = selectedRepo.default_branch;
    try {
      let baseSHA = await getDefaultBranchSHA(token, owner, repo, base);
      for (let i = 0; i < pairTemplates.length; i++) {
         if (cancelRef.current) break;
         const pt = pairTemplates[i];
         try {
           setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'creating', substatus: 'Creating branch...' } : ci));
           await createBranch(token, owner, repo, pt.branchName, baseSHA);
           await createMultiFileCommitWithCoAuthors(token, owner, repo, pt.branchName, pt.files, pt.title, pt.coAuthors);
           const result = await createPullRequest(token, owner, repo, pt.title, pt.body, pt.branchName, base);
           setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'merging', substatus: 'Merging...', url: result.html_url, number: result.number } : ci));
           await waitForMergeable(token, owner, repo, result.number, 15, 1000);
           await mergePullRequest(token, owner, repo, result.number, 'merge', 3);
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
    else if (appMode === 'prs') startCreatingPRs();
    else if (appMode === 'pair') startCreatingPairs();
  };

  const reset = () => { setStep(2); setCreatedItems([]); setQuickdrawBadgeTemplates([]); setYOLOBadgeTemplates([]); setPRTemplates([]); setPairTemplates([]); setError(''); };
  const disconnect = () => { setStep(0); setToken(''); setTokenInput(''); setUser(null); setRepos([]); setStep(0); reset(); };

  const successCount = createdItems.filter(i => i.status === 'success' || i.status === 'merged').length;
  const errorCount = createdItems.filter(i => i.status === 'error').length;
  const progressPct = createdItems.length > 0 ? ((successCount + errorCount) / createdItems.length) * 100 : 0;
  const queueCount = appMode === 'quickdraw_badge' ? quickdrawBadgeTemplates.length : appMode === 'yolo_badge' ? yoloBadgeTemplates.length : appMode === 'prs' ? prTemplates.length : pairTemplates.length;
  const filteredRepos = repos.filter(r => r.full_name.toLowerCase().includes(repoSearch.toLowerCase()));

  const togglePause = () => { pauseRef.current = !pauseRef.current; setIsPaused(!isPaused); };
  const cancelCreation = () => { cancelRef.current = true; pauseRef.current = false; setIsPaused(false); };

  // ── RENDER ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 selection:bg-purple-500/30 font-sans">
      {/* Header */}
      <header className="border-b border-white/5 bg-gray-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 group cursor-default">
            <div className="w-10 h-10 rounded-xl premium-gradient-purple flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform duration-500">
              <Github className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">GITHUB BULK MANAGER</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse"></span>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-600">Premium Achievement Suite</p>
              </div>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2 border border-white/5">
                <img src={user.avatar_url} alt="" className="w-6 h-6 rounded-full border border-white/10" />
                <span className="text-xs font-bold text-gray-300">{user.login}</span>
                {tokenInfo && <span className="text-[9px] font-black uppercase text-purple-400">{tokenInfo.type}</span>}
              </div>
              <button onClick={disconnect} className="p-2 rounded-lg bg-white/5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"><XCircle className="w-5 h-5" /></button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Stepper */}
        <div className="flex flex-wrap justify-center sm:justify-start gap-4 mb-20">
          {['Connect', 'Repository', 'Configure', 'Execute', 'Complete'].map((label, i) => (
            <div key={label} className="flex items-center gap-4">
              <div className={cn(
                'flex items-center gap-3 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all',
                step === i ? 'bg-white text-gray-950 shadow-2xl scale-110' :
                step > i ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-white/5 text-gray-700 border border-white/5 opacity-50'
              )}>
                {step > i ? <CheckCircle2 className="w-4 h-4" /> : <span className="w-4 h-4 flex items-center justify-center">{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-10 glass-card !bg-red-500/5 border-red-500/20 p-5 flex items-start gap-4 animate-in slide-in-from-top-4 duration-500">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-red-300 font-medium whitespace-pre-wrap">{error}</div>
            <button onClick={() => setError('')} className="text-red-500/50 hover:text-red-500"><X className="w-5 h-5" /></button>
          </div>
        )}

        {/* STEP 0 */}
        {step === 0 && (
          <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-20 items-center">
            <div className="space-y-8 text-left">
              <h2 className="text-5xl sm:text-7xl font-black leading-tight text-white tracking-widest">ELEVATE<br/><span className="text-purple-500">PROFILES.</span></h2>
              <p className="text-lg text-gray-500 font-medium leading-relaxed max-w-md">Automate complex GitHub workflows, secure achievements, and streamline repository management with a professional-grade interface.</p>
            </div>
            <div className="glass-card p-10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-48 h-48 premium-gradient-purple blur-[100px] opacity-10"></div>
              <div className="text-center mb-10">
                 <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6 border border-white/10"><Key className="w-8 h-8 text-white" /></div>
                 <h3 className="text-xl font-black text-white tracking-widest uppercase">AUTHENTICATION</h3>
              </div>
              <div className="space-y-6">
                <div className="relative">
                  <input type={showToken ? 'text' : 'password'} value={tokenInput} onChange={e => setTokenInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleConnect()} placeholder="ghp_xxxx..." className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4.5 text-sm text-white placeholder:text-gray-700 focus:outline-none focus:border-purple-500/50 pr-16 font-mono" />
                  <button onClick={() => setShowToken(!showToken)} className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white">{showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                </div>
                <button onClick={handleConnect} disabled={loading || !tokenInput.trim()} className={cn('w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3', loading || !tokenInput.trim() ? 'bg-white/5 text-gray-700 cursor-not-allowed border border-white/5' : 'premium-gradient-purple text-white shadow-xl shadow-purple-500/30')}>
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />} {loading ? 'VALIDATING...' : 'AUTHORIZE SESSION'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <div className="max-w-3xl mx-auto staggered-list text-left">
            <div className="glass-card p-10 lg:p-14 relative overflow-hidden">
              <div className="flex items-center gap-6 mb-12">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10"><Globe className="w-7 h-7 text-blue-400" /></div>
                <div>
                  <h2 className="text-2xl font-black text-white">REPOSITORY</h2>
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mt-1">Target destination management</p>
                </div>
              </div>
              <div className="relative mb-10" ref={dropdownRef}>
                <div onClick={() => setRepoDropdownOpen(!repoDropdownOpen)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-5 text-sm cursor-pointer flex items-center justify-between hover:border-white/20 transition-all font-bold">
                  <span className={selectedRepo ? 'text-white' : 'text-gray-600'}>{selectedRepo ? selectedRepo.full_name : 'Browse available repositories...'}</span>
                  <ChevronDown className={cn('w-5 h-5 transition-transform', repoDropdownOpen && 'rotate-180')} />
                </div>
                {repoDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-4 glass-card !bg-gray-950/95 border-white/10 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="p-4 border-b border-white/5 bg-white/5">
                       <input type="text" autoFocus value={repoSearch} onChange={e => setRepoSearch(e.target.value)} placeholder="Filter results..." className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none placeholder:text-gray-700" />
                    </div>
                    <div className="max-h-64 overflow-y-auto">
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
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setStep(0)} className="py-4 rounded-2xl bg-white/5 text-gray-600 font-black text-[10px] uppercase tracking-widest hover:text-white transition-all">BACK</button>
                <button onClick={() => setStep(2)} disabled={!selectedRepo || permissionStatus !== 'ok'} className={cn('py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2', !selectedRepo || permissionStatus !== 'ok' ? 'bg-white/5 text-gray-800 cursor-not-allowed' : 'premium-gradient-purple text-white')}>CONTINUE <ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && selectedRepo && (
           <div className="max-w-5xl mx-auto space-y-10 text-left">
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: 'quickdraw_badge', label: 'QuickDraw', icon: Sparkles },
                  { id: 'yolo_badge', label: 'YOLO Badge', icon: Rocket },
                  { id: 'prs', label: 'Pull Requests', icon: GitPullRequest },
                  { id: 'pair', label: 'Pair Suite', icon: Award }
                ].map(mode => (
                  <button key={mode.id} onClick={() => setAppMode(mode.id as any)} className={cn("px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-3", appMode === mode.id ? "bg-white text-gray-950 border-white shadow-xl" : "bg-white/5 border-white/5 text-gray-600 hover:text-white")}>
                    <mode.icon className="w-4 h-4" /> {mode.label}
                  </button>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-10">
                 <div className="glass-card p-10 flex flex-col items-center justify-center text-center opacity-60 hover:opacity-100 transition-opacity">
                    {appMode === 'quickdraw_badge' && <Sparkles className="w-20 h-20 text-purple-500 mb-8" />}
                    {appMode === 'yolo_badge' && <Rocket className="w-20 h-20 text-red-500 mb-8" />}
                    {appMode === 'prs' && <GitPullRequest className="w-20 h-20 text-green-500 mb-8" />}
                    {appMode === 'pair' && <Award className="w-20 h-20 text-amber-500 mb-8" />}
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
                            <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Reviewer Username</label>
                                  <input value={coAuthors[0].name} onChange={e => updateCoAuthor(0, 'name', e.target.value)} placeholder="octocat" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" />
                               </div>
                               <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Git Email</label>
                                  <input value={coAuthors[0].email} onChange={e => updateCoAuthor(0, 'email', e.target.value)} placeholder="me@work.com" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" />
                               </div>
                            </div>
                            <button onClick={generateYOLOBadge} className="w-full py-5 rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl">BUILD YOLO FLOW</button>
                         </div>
                       )}
                       {appMode === 'prs' && (
                         <div className="space-y-6 w-full">
                           <button onClick={() => setAutoMerge(!autoMerge)} className="w-full py-4 text-xs font-black uppercase tracking-widest border border-white/10 rounded-2xl text-gray-400">AUTO-MERGE: {autoMerge ? 'ON' : 'OFF'}</button>
                           <button onClick={generatePRs} className="w-full py-5 rounded-2xl premium-gradient-green text-white font-black text-xs uppercase tracking-widest">GENERATE BATCH</button>
                         </div>
                       )}
                       {appMode === 'pair' && (
                         <div className="space-y-6 w-full">
                            {coAuthors.map((ca, i) => (
                               <div key={i} className="flex gap-2">
                                  <input value={ca.name} onChange={e => updateCoAuthor(i, 'name', e.target.value)} placeholder="User" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" />
                                  <input value={ca.email} onChange={e => updateCoAuthor(i, 'email', e.target.value)} placeholder="Email" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" />
                                  <button onClick={() => removeCoAuthor(i)} className="px-3 text-red-500"><X className="w-4 h-4" /></button>
                               </div>
                            ))}
                            <button onClick={addCoAuthor} className="w-full py-2 text-[10px] font-black uppercase text-gray-600">+ Add Member</button>
                            <button onClick={generatePairTemplates} className="w-full py-5 rounded-2xl premium-gradient-purple text-white font-black text-xs uppercase tracking-[0.2em]">START SESSION</button>
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
        {(step === 3 || step === 4) && (
          <div className="max-w-4xl mx-auto space-y-8 text-left">
             <div className="glass-card p-10 lg:p-14 relative overflow-hidden">
                <div className="flex items-center justify-between mb-16">
                   <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10">{step === 4 ? <CheckCircle2 className="w-8 h-8 text-green-500" /> : <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />}</div>
                      <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter">{step === 4 ? 'COMPLETE' : 'EXECUTING'}</h2>
                        <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mt-1">Workflow node performance</p>
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
                           <span className={cn("text-[9px] font-black uppercase tracking-widest", item.status === 'merged' ? 'text-green-500' : 'text-gray-600')}>{item.substatus || item.status}</span>
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

      <footer className="py-20 text-center opacity-30">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-700">&copy; {new Date().getFullYear()} GITHUB BULK MANAGER • VISUAL STANDARD VERIFIED</p>
      </footer>
    </div>
  );
}
