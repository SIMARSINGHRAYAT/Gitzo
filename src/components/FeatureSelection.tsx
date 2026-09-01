import React from 'react';
import { Award, Star, Users, Heart, ChevronRight } from 'lucide-react';

interface FeatureSelectionProps {
  onSelectFeature: (feature: 'badges' | 'stars' | 'followers' | 'dashboard') => void;
}

export function FeatureSelection({ onSelectFeature }: FeatureSelectionProps) {
  return (
    <div className="max-w-4xl mx-auto text-center min-w-0">
      <h2 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter">Choose a Feature</h2>
      <p className="text-sm text-gray-400 mb-10 max-w-xl mx-auto">
        Select a tool from the GitHubCrazy ecosystem to enhance your GitHub profile.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Badges Feature */}
        <button
          onClick={() => onSelectFeature('badges')}
          className="glass-card p-8 flex flex-col items-center justify-between gap-6 hover:bg-white/5 btn-hover-effect border-purple-500/30 group"
        >
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Badges</h3>
            <p className="text-xs text-gray-400 leading-relaxed">Generate profile badges for GitHub achievements.</p>
          </div>
          <div className="w-full mt-4 flex items-center justify-center text-xs font-black uppercase text-purple-400 group-hover:text-purple-300">
            Select <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </button>

        {/* Increase Stars Feature */}
        <button
          onClick={() => onSelectFeature('stars')}
          className="glass-card p-8 flex flex-col items-center justify-between gap-6 hover:bg-white/5 btn-hover-effect border-green-500/30 group"
        >
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center border border-green-500/20 text-green-400">
            <Star className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Stars</h3>
            <p className="text-xs text-gray-400 leading-relaxed">Submit repositories for community discovery.</p>
          </div>
          <div className="w-full mt-4 flex items-center justify-center text-xs font-black uppercase text-green-400 group-hover:text-green-300">
            Select <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </button>

        {/* Increase Followers Feature */}
        <button
          onClick={() => onSelectFeature('followers')}
          className="glass-card p-8 flex flex-col items-center justify-between gap-6 hover:bg-white/5 btn-hover-effect border-blue-500/30 group"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
            <Users className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Followers</h3>
            <p className="text-xs text-gray-400 leading-relaxed">Connect with other developers.</p>
          </div>
          <div className="w-full mt-4 flex items-center justify-center text-xs font-black uppercase text-blue-400 group-hover:text-blue-300">
            Select <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </button>

        {/* Community Dashboard */}
        <button
          onClick={() => onSelectFeature('dashboard')}
          className="glass-card p-8 flex flex-col items-center justify-between gap-6 hover:bg-white/5 btn-hover-effect border-pink-500/30 group"
        >
          <div className="w-16 h-16 rounded-2xl bg-pink-500/10 flex items-center justify-center border border-pink-500/20 text-pink-400">
            <Heart className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Community</h3>
            <p className="text-xs text-gray-400 leading-relaxed">Discover and follow community members.</p>
          </div>
          <div className="w-full mt-4 flex items-center justify-center text-xs font-black uppercase text-pink-400 group-hover:text-pink-300">
            Select <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </button>
      </div>
    </div>
  );
}
