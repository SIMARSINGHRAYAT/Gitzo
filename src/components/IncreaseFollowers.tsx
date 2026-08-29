import React, { useState, useEffect } from 'react';
import { Users, X, Loader2, UserPlus, CheckCircle2 } from 'lucide-react';
import { followUser } from '../utils/github';
import { cn } from '../utils/cn';

interface IncreaseFollowersProps {
  token: string;
  user: { login: string; avatar_url: string; name?: string; bio?: string; html_url?: string };
}

export function IncreaseFollowers({ token, user }: IncreaseFollowersProps) {
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Local rejected state so we don't have to save it to the backend for this simple mockup
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCardsAndSubmitSelf();
  }, []);

  const fetchCardsAndSubmitSelf = async () => {
    try {
      // 1. Submit self to community (ignoring if already exists handled by backend)
      await fetch('/api/followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'submit' })
      });

      // 2. Fetch community cards
      const res = await fetch('/api/followers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load community profiles');
      const data = await res.json();
      setCards(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async (card: any) => {
    // Optimistic update
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, hasFollowed: true, followingLoading: true } : c));
    
    try {
      // 1. Real GitHub Follow
      await followUser(token, card.username);
      
      // 2. Record interaction in backend
      await fetch('/api/followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'follow', cardId: card.id })
      });
      
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, followingLoading: false } : c));
    } catch (err: any) {
      // Revert on error
      setError(`Failed to follow ${card.username}: ${err.message}`);
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, hasFollowed: false, followingLoading: false } : c));
    }
  };

  const handleReject = (cardId: string) => {
    setRejectedIds(prev => new Set(prev).add(cardId));
  };

  const otherCards = cards.filter(c => c.username !== user.login && !rejectedIds.has(c.id));

  return (
    <div className="max-w-5xl mx-auto min-w-0">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">Increase Followers</h2>
        <p className="text-sm text-gray-400">Discover and follow other GitHub developers.</p>
      </div>
      
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      <div className="glass-card p-8 min-h-[400px] flex flex-col max-w-2xl mx-auto">
        <h3 className="text-lg font-black text-white mb-6 uppercase tracking-widest border-b border-white/10 pb-4 text-center">
          Developer Profiles
        </h3>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : otherCards.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-60">
            <Users className="w-12 h-12 text-gray-600 mb-4" />
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No profiles available yet</p>
            <p className="text-[10px] text-gray-600 mt-2 max-w-[200px]">More profiles will appear here as the community grows.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {otherCards.map(card => (
              <div key={card.id} className="p-6 bg-white/5 border border-white/10 rounded-2xl relative">
                <div className="flex items-start gap-5 mb-6">
                  <img src={card.avatarUrl} alt="" className="w-14 h-14 rounded-xl border border-white/10 shadow-lg" />
                  <div className="flex-1 min-w-0 pt-1">
                    <a href={card.profileUrl} target="_blank" rel="noreferrer" className="text-lg font-black text-white hover:text-blue-400 hover:underline block truncate">
                      {card.name || card.username}
                    </a>
                    <p className="text-xs text-gray-400 font-mono mt-1">@{card.username}</p>
                    {card.bio && <p className="text-sm text-gray-300 mt-3 line-clamp-2 leading-relaxed">{card.bio}</p>}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleFollow(card)}
                    disabled={card.hasFollowed || card.followingLoading}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                      card.hasFollowed ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 cursor-default" : "bg-white/5 border border-white/10 text-white hover:bg-white/10 btn-hover-effect"
                    )}
                  >
                    {card.followingLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : card.hasFollowed ? (
                      <CheckCircle2 className="w-4 h-4 text-blue-400" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    {card.hasFollowed ? 'Following' : 'Follow on GitHub'}
                  </button>
                  
                  <button
                    onClick={() => handleReject(card.id)}
                    className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all btn-hover-effect"
                    title="Hide this profile"
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
  );
}
