import React, { useEffect, useState } from 'react';
import { checkRepoStarred, starRepo, checkUserFollowed, followUser } from '../utils/github';
import { SUPPORT_REPOSITORY, MAINTAINER_PROFILE } from '../config';
import { checkUserStatus } from '../utils/api';
import { Star, UserPlus, CheckCircle2, Loader2, ChevronRight } from 'lucide-react';
import { cn } from '../utils/cn';

interface SupportProjectProps {
  token: string;
  onComplete: () => void;
}

export function SupportProject({ token, onComplete }: SupportProjectProps) {
  const [isStarred, setIsStarred] = useState(false);
  const [isFollowed, setIsFollowed] = useState(false);
  const [loadingStar, setLoadingStar] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  const [repoOwner, repoName] = SUPPORT_REPOSITORY.split('/');

  useEffect(() => {
    let mounted = true;
    async function checkStatus() {
      try {
        // Use server-side verification
        const status = await checkUserStatus(token);
        if (mounted) {
          setIsStarred(status.repositoryStarred);
          setIsFollowed(status.maintainerFollowed);
          setChecking(false);
        }
      } catch (err: any) {
        if (mounted) {
          setError('Failed to verify GitHub status. ' + err.message);
          setChecking(false);
        }
      }
    }
    checkStatus();
    return () => { mounted = false; };
  }, [token]);

  const handleStar = async () => {
    if (isStarred) return;
    setLoadingStar(true);
    setError('');
    try {
      await starRepo(token, repoOwner, repoName);
      // Re-verify status from server after action
      const status = await checkUserStatus(token);
      setIsStarred(status.repositoryStarred);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingStar(false);
    }
  };

  const handleFollow = async () => {
    if (isFollowed) return;
    setLoadingFollow(true);
    setError('');
    try {
      await followUser(token, MAINTAINER_PROFILE);
      // Re-verify status from server after action
      const status = await checkUserStatus(token);
      setIsFollowed(status.maintainerFollowed);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingFollow(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto text-center min-w-0">
      <div className="glass-card p-10 relative overflow-hidden group">
        <h2 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter">Support the Project</h2>
        <p className="text-sm text-gray-400 mb-8 max-w-xl mx-auto">
          Help us grow the community, star our repository and follow the maintainer to show your support.
        </p>

        {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        <div className="space-y-4 mb-10">
          {/* Option 1 */}
          <button
            onClick={handleStar}
            disabled={checking || isStarred || loadingStar}
            className={cn(
              "w-full py-5 px-6 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-between shadow-xl",
              isStarred ? "bg-green-500/20 text-green-400 border border-green-500/30 cursor-default" : "bg-white/5 border border-white/10 text-white hover:bg-white/10 btn-hover-effect"
            )}
          >
            <div className="flex items-center gap-4">
              <Star className="w-5 h-5" />
              <span>Star the Repository</span>
            </div>
            {checking || loadingStar ? <Loader2 className="w-5 h-5 animate-spin" /> : isStarred && <CheckCircle2 className="w-5 h-5 text-green-400" />}
          </button>

          {/* Option 2 */}
          <button
            onClick={handleFollow}
            disabled={checking || isFollowed || loadingFollow}
            className={cn(
              "w-full py-5 px-6 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-between shadow-xl",
              isFollowed ? "bg-green-500/20 text-green-400 border border-green-500/30 cursor-default" : "bg-white/5 border border-white/10 text-white hover:bg-white/10 btn-hover-effect"
            )}
          >
            <div className="flex items-center gap-4">
              <UserPlus className="w-5 h-5" />
              <span>Follow the Maintainer</span>
            </div>
            {checking || loadingFollow ? <Loader2 className="w-5 h-5 animate-spin" /> : isFollowed && <CheckCircle2 className="w-5 h-5 text-green-400" />}
          </button>
        </div>

        <button
          onClick={onComplete}
          disabled={!isStarred || !isFollowed}
          className={cn(
            "w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-2 transition-all",
            isStarred && isFollowed ? "premium-gradient-purple text-white btn-hover-effect" : "bg-white/5 text-gray-600 cursor-not-allowed"
          )}
        >
          Continue to Dashboard <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
