import React from 'react';
import { ShieldCheck, Sparkles, BookOpen, MessageSquare, ListCheck, LogOut, Lock, User as UserIcon } from 'lucide-react';
import { User } from 'firebase/auth';
import { signOutUser } from '../firebase/config';

interface NavbarProps {
  user: User;
  activeTab: 'chat' | 'entries' | 'summaries';
  setActiveTab: (tab: 'chat' | 'entries' | 'summaries') => void;
  onOpenInsights: () => void;
  onOpenSecurity: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  setActiveTab,
  onOpenInsights,
  onOpenSecurity,
}) => {
  const isAnonymous = user.isAnonymous;
  const displayName = user.displayName || (isAnonymous ? 'Guest User' : user.email?.split('@')[0]) || 'Journaler';

  return (
    <header id="app-navbar" className="border-b border-slate-800 bg-[#0F172A]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand & Security Badge */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base sm:text-lg tracking-tight">
                Gemini Journal
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                SECURE SESSION
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:flex items-center gap-1.5">
              <span>Zero-Trust Cloud Vault</span>
              <span>•</span>
              <span>UID: <code className="font-mono text-[10px] text-slate-300 bg-slate-800 px-1 py-0.5 rounded">{user.uid.slice(0, 8)}...</code></span>
            </p>
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <nav id="nav-tabs" className="hidden md:flex items-center gap-1 bg-[#1E293B] p-1 rounded-xl border border-slate-700/50">
          <button
            id="tab-chat"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            AI Companion
          </button>
          <button
            id="tab-entries"
            onClick={() => setActiveTab('entries')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'entries'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Journal Entries
          </button>
          <button
            id="tab-summaries"
            onClick={() => setActiveTab('summaries')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'summaries'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <ListCheck className="w-3.5 h-3.5" />
            Saved Summaries
          </button>
        </nav>

        {/* Action Controls & User Identity */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Reflection Insights Feature Button */}
          <button
            id="btn-reflection-insights"
            onClick={onOpenInsights}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400/60 shadow-lg shadow-cyan-500/10 transition-all"
            title="Generate deep reflection insights across your journal history"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Reflection Insights</span>
            <span className="sm:hidden">Insights</span>
          </button>

          {/* Security & Threat Model Checklist Button */}
          <button
            id="btn-security-modal"
            onClick={onOpenSecurity}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700/80 text-slate-300 border border-slate-700 transition-colors"
            title="View Security Checklist & Threat Model Verification"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline">Security Shield</span>
          </button>

          {/* User Profile & Sign Out */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center text-xs font-semibold overflow-hidden border border-slate-600">
              {user.photoURL ? (
                <img src={user.photoURL} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-xs font-bold text-slate-200">{displayName.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <button
              id="btn-signout"
              onClick={() => signOutUser()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
              title="Sign Out securely"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Tab Row */}
      <div className="md:hidden flex items-center justify-around border-t border-slate-800 bg-[#1E293B]/90 px-2 py-1.5">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'chat' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('entries')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'entries' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Entries
        </button>
        <button
          onClick={() => setActiveTab('summaries')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'summaries' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400'
          }`}
        >
          <ListCheck className="w-3.5 h-3.5" />
          Summaries
        </button>
      </div>
    </header>
  );
};
