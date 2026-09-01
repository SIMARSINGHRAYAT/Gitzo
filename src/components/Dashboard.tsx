import React, { useEffect, useState } from 'react';
import { getAllProfiles, followUser, unfollowUser, getDailyFollowsRemaining } from '../utils/api';
import { Users, Heart, Loader2, AlertCircle, LogOut } from 'lucide-react';
import { cn } from '../utils/cn';

interface ProfileCard {
  id: string;
  githubUsername: string;
  githubName: string | null;
  githubAvatar: string | null;
  githubBio: string | null;
  followersCount: number;
  isFollowing?: boolean;
}

interface DashboardProps {
  token: string;
  onLogout: () => void;
  onBack?: () => void;
}

export function Dashboard({ token, onLogout }: DashboardProps) {
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [loadingFollow, setLoadingFollow] = useState<Record<string, boolean>>({});
  const [followsRemaining, setFollowsRemaining] = useState(10);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, [token]);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getAllProfiles(token);
      setProfiles(data);
      
      // Build following map
      const following: Record<string, boolean> = {};
      data.forEach(profile => {
        if (profile.isFollowing) {
          following[profile.id] = true;
        }
      });
      setFollowingMap(following);

      // Get daily follows remaining
      const dailyStats = await getDailyFollowsRemaining(token);
      setFollowsRemaining(dailyStats.followsRemaining);
      setDailyLimitReached(dailyStats.followsRemaining === 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async (profileId: string, username: string) => {
    setLoadingFollow(prev => ({ ...prev, [profileId]: true }));
    setError('');

    try {
      await followUser(profileId, token);
      setFollowingMap(prev => ({ ...prev, [profileId]: true }));
      
      // Update profiles with new follower count
      setProfiles(prev =>
        prev.map(p =>
          p.id === profileId
            ? { ...p, followersCount: p.followersCount + 1, isFollowing: true }
            : p
        )
      );

      // Refresh daily follows remaining
      const dailyStats = await getDailyFollowsRemaining(token);
      setFollowsRemaining(dailyStats.followsRemaining);
      setDailyLimitReached(dailyStats.followsRemaining === 0);
    } catch (err: any) {
      setError(err.message || 'Failed to follow user');
    } finally {
      setLoadingFollow(prev => ({ ...prev, [profileId]: false }));
    }
  };

  const handleUnfollow = async (profileId: string) => {
    setLoadingFollow(prev => ({ ...prev, [profileId]: true }));
    setError('');

    try {
      await unfollowUser(profileId, token);
      setFollowingMap(prev => {
        const updated = { ...prev };
        delete updated[profileId];
        return updated;
      });

      // Update profiles with new follower count
      setProfiles(prev =>
        prev.map(p =>
          p.id === profileId
            ? { ...p, followersCount: Math.max(0, p.followersCount - 1), isFollowing: false }
            : p
        )
      );

      // Refresh daily follows remaining
      const dailyStats = await getDailyFollowsRemaining(token);
      setFollowsRemaining(dailyStats.followsRemaining);
    } catch (err: any) {
      setError(err.message || 'Failed to unfollow user');
    } finally {
      setLoadingFollow(prev => ({ ...prev, [profileId]: false }));
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
            <Users className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white uppercase">Community</h2>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mt-1">
              Discover and follow amazing developers
            </p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-red-400 transition-all flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" /> Log Out
        </button>
      </div>

      {/* Daily limit info */}
      <div className="glass-card p-6 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">Daily Follow Limit</p>
            <p className="text-xs text-gray-400 mt-1">
              {followsRemaining} of 10 follows remaining today
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-purple-400">{followsRemaining}/10</div>
            {dailyLimitReached && (
              <p className="text-xs text-red-400 font-bold mt-1">Limit reached. Try again tomorrow.</p>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="glass-card !bg-red-500/5 border-red-500/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      )}

      {/* Profiles grid */}
      {!loading && profiles.length === 0 && (
        <div className="text-center py-20">
          <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No profiles found yet</p>
        </div>
      )}

      {!loading && profiles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map(profile => (
            <div
              key={profile.id}
              className="glass-card p-8 hover:border-white/30 transition-all transform hover:scale-105 duration-300 flex flex-col"
            >
              {/* Avatar and username */}
              <div className="flex items-start justify-between mb-6">
                {profile.githubAvatar && (
                  <img
                    src={profile.githubAvatar}
                    alt={profile.githubUsername}
                    className="w-16 h-16 rounded-2xl border-2 border-purple-500/30"
                  />
                )}
                <div className="flex-1 ml-4">
                  <h3 className="text-lg font-black text-white truncate">
                    {profile.githubName || profile.githubUsername}
                  </h3>
                  <p className="text-xs text-gray-400 font-bold">@{profile.githubUsername}</p>
                </div>
              </div>

              {/* Bio */}
              {profile.githubBio && (
                <p className="text-xs text-gray-300 mb-4 line-clamp-2">{profile.githubBio}</p>
              )}

              {/* Followers count */}
              <div className="mb-6 p-3 bg-white/5 rounded-lg">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                  {profile.followersCount} Followers
                </p>
              </div>

              {/* Follow button */}
              <button
                onClick={() => {
                  if (followingMap[profile.id]) {
                    handleUnfollow(profile.id);
                  } else {
                    handleFollow(profile.id, profile.githubUsername);
                  }
                }}
                disabled={loadingFollow[profile.id] || (dailyLimitReached && !followingMap[profile.id])}
                className={cn(
                  'w-full py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2',
                  followingMap[profile.id]
                    ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30'
                    : dailyLimitReached
                    ? 'bg-gray-600/20 border border-gray-600/30 text-gray-500 cursor-not-allowed'
                    : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                )}
              >
                {loadingFollow[profile.id] ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                  </>
                ) : followingMap[profile.id] ? (
                  <>
                    <Heart className="w-4 h-4 fill-current" /> Following
                  </>
                ) : dailyLimitReached ? (
                  'Limit Reached'
                ) : (
                  <>
                    <Heart className="w-4 h-4" /> Follow
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
