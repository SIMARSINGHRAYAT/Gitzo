import React, { useState, useEffect } from 'react';
import type { GitHubRepo } from '../types';
import { Star, X, Loader2, Heart } from 'lucide-react';
import { cn } from '../utils/cn';

interface IncreaseStarsProps {
  token: string;
  user: { login: string; avatar_url: string };
  repos: GitHubRepo[];
}

export function IncreaseStars({ token, user, repos }: IncreaseStarsProps) {
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  
  // Local rejected state so we don't have to save it to the backend for this simple mockup
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    try {
      const res = await fetch('/api/stars', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load community cards');
      const data = await res.json();
      setCards(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedRepoId) return;
    const repo = repos.find(r => r.id.toString() === selectedRepoId);
    if (!repo) return;
    
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'submit', repo })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit repository');
      }
      const newCard = await res.json();
      setCards(prev => [...prev, newCard]);
      setSelectedRepoId('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (cardId: string) => {
    // Optimistic update
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, hasLiked: true, likes: c.likes + 1 } : c));
    
    try {
      await fetch('/api/stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'like', cardId })
      });
    } catch (err) {
      // Revert on error
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, hasLiked: false, likes: c.likes - 1 } : c));
    }
  };

  const handleReject = (cardId: string) => {
    setRejectedIds(prev => new Set(prev).add(cardId));
  };

  const userSubmissions = cards.filter(c => c.submittedBy === user.login);
  const otherCards = cards.filter(c => c.submittedBy !== user.login && !rejectedIds.has(c.id));

  return (
    <div className="max-w-5xl mx-auto min-w-0">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">Increase Stars</h2>
        <p className="text-sm text-gray-400">Discover and support community repositories.</p>
      </div>
      
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-10">
        {/* Submission Panel */}
        <div className="glass-card p-8 h-fit">
          <h3 className="text-lg font-black text-white mb-6 uppercase tracking-widest border-b border-white/10 pb-4">
            Your Submissions <span className="text-gray-500 ml-2">{userSubmissions.length} / 2</span>
          </h3>
          
          <div className="space-y-4 mb-6">
            {userSubmissions.map(card => (
              <div key={card.id} className="p-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <Star className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-bold text-gray-200">{card.repoName}</span>
                </div>
                <div className="text-[10px] text-gray-500 uppercase font-black">
                  {card.likes} Community Interactions
                </div>
              </div>
            ))}
          </div>

          {userSubmissions.length < 2 ? (
            <div className="space-y-4 mt-6">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Select a repository to submit</label>
              <select 
                value={selectedRepoId}
                onChange={e => setSelectedRepoId(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-green-400/50"
              >
                <option value="">Choose repository...</option>
                {repos.filter(r => !r.private && !userSubmissions.find(s => s.repoName === r.name)).map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button
                onClick={handleSubmit}
                disabled={!selectedRepoId || submitting}
                className="w-full py-4 rounded-xl premium-gradient-green text-gray-900 font-black text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed btn-hover-effect flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                Submit for Discovery
              </button>
            </div>
          ) : (
            <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
              <p className="text-xs text-green-400 font-bold">Maximum submissions reached.</p>
            </div>
          )}
        </div>

        {/* Discovery Feed */}
        <div className="glass-card p-8 h-fit min-h-[400px] flex flex-col">
          <h3 className="text-lg font-black text-white mb-6 uppercase tracking-widest border-b border-white/10 pb-4">
            Community Feed
          </h3>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
            </div>
          ) : otherCards.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-60">
              <Star className="w-12 h-12 text-gray-600 mb-4" />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No repositories available yet</p>
              <p className="text-[10px] text-gray-600 mt-2 max-w-[200px]">More community submissions will appear here as users join.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {otherCards.map(card => (
                <div key={card.id} className="p-5 bg-white/5 border border-white/10 rounded-2xl relative">
                  <div className="flex items-start gap-4 mb-4">
                    <img src={card.avatarUrl} alt="" className="w-10 h-10 rounded-lg border border-white/10" />
                    <div className="flex-1 min-w-0">
                      <a href={card.repoUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-white hover:text-green-400 hover:underline block truncate">
                        {card.repoOwner} / {card.repoName}
                      </a>
                      <p className="text-xs text-gray-400 truncate mt-1">{card.repoDescription || 'No description provided.'}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleLike(card.id)}
                      disabled={card.hasLiked}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                        card.hasLiked ? "bg-green-500/20 text-green-400 border border-green-500/30 cursor-default" : "bg-white/5 border border-white/10 text-white hover:bg-white/10 btn-hover-effect"
                      )}
                    >
                      <Heart className={cn("w-3.5 h-3.5", card.hasLiked && "fill-green-400")} /> 
                      {card.hasLiked ? 'Liked' : 'Like'} ({card.likes})
                    </button>
                    
                    <button
                      onClick={() => handleReject(card.id)}
                      className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all btn-hover-effect"
                      title="Hide this repository"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
