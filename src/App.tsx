import React, { useState, useEffect } from 'react';
import { onAuthStatusChange, User } from './firebase/config';
import { AuthScreen } from './components/AuthScreen';
import { Navbar } from './components/Navbar';
import { JournalChat } from './components/JournalChat';
import { JournalEntries } from './components/JournalEntries';
import { SummariesView } from './components/SummariesView';
import { ReflectionInsightsModal } from './components/ReflectionInsightsModal';
import { SecurityChecklistModal } from './components/SecurityChecklistModal';
import { SessionSummary } from './types';
import { Shield, Sparkles } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'entries' | 'summaries'>('chat');
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);

  // Monitor Firebase Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStatusChange((currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center flex-col space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white font-bold text-xl flex items-center justify-center animate-pulse shadow-lg shadow-blue-500/20">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div className="text-xs text-slate-400 font-medium tracking-wide flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          Verifying Authenticated Firebase Session...
        </div>
      </div>
    );
  }

  // Not authenticated: render modern secure Auth screen
  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 flex flex-col font-sans selection:bg-blue-600/30 selection:text-white">
      
      {/* Top Navbar */}
      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenInsights={() => setIsInsightsOpen(true)}
        onOpenSecurity={() => setIsSecurityOpen(true)}
      />

      {/* Main Content Views */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'chat' && (
          <JournalChat
            user={user}
            onSummaryGenerated={(summary: SessionSummary) => {
              // Can switch or notify
            }}
          />
        )}

        {activeTab === 'entries' && (
          <JournalEntries
            user={user}
            onSummaryCreated={() => {
              // entry saved with summary
            }}
          />
        )}

        {activeTab === 'summaries' && (
          <SummariesView
            user={user}
            onNavigateToTab={(tab) => setActiveTab(tab)}
          />
        )}
      </main>

      {/* Reflection Insights Feature Modal */}
      <ReflectionInsightsModal
        isOpen={isInsightsOpen}
        onClose={() => setIsInsightsOpen(false)}
        user={user}
        onSelectPromptForSession={(prompt) => {
          setActiveTab('chat');
        }}
      />

      {/* Security & Threat Model Checklist Modal */}
      <SecurityChecklistModal
        isOpen={isSecurityOpen}
        onClose={() => setIsSecurityOpen(false)}
        uid={user.uid}
      />
    </div>
  );
}
