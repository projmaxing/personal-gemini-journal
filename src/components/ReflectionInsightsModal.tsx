import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit 
} from '../firebase/config';
import { fetchReflectionInsights } from '../services/api';
import { JournalEntry, Conversation, ReflectionInsights } from '../types';
import { 
  Sparkles, 
  X, 
  RefreshCw, 
  Lock, 
  Target, 
  AlertTriangle, 
  TrendingUp, 
  HelpCircle, 
  Layers, 
  ArrowRight, 
  CheckCircle2 
} from 'lucide-react';

interface ReflectionInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSelectPromptForSession?: (promptText: string) => void;
}

export const ReflectionInsightsModal: React.FC<ReflectionInsightsModalProps> = ({
  isOpen,
  onClose,
  user,
  onSelectPromptForSession,
}) => {
  const [insights, setInsights] = useState<ReflectionInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState(0);

  // Check for previously saved insight report in Firestore
  useEffect(() => {
    if (!isOpen || !user) return;

    const loadLatestSavedInsight = async () => {
      try {
        const insightsRef = collection(db, 'users', user.uid, 'insights');
        const q = query(insightsRef, orderBy('generatedAt', 'desc'), limit(1));
        const snap = await getDocs(q);

        if (!snap.empty) {
          setInsights(snap.docs[0].data() as ReflectionInsights);
        }
      } catch (err) {
        console.error('Error fetching cached insights:', err);
      }
    };

    loadLatestSavedInsight();
  }, [isOpen, user]);

  const handleGenerateInsights = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Query strictly the authenticated user's isolated Firestore subcollections
      const entriesRef = collection(db, 'users', user.uid, 'journals');
      const convsRef = collection(db, 'users', user.uid, 'conversations');

      const [entriesSnap, convsSnap] = await Promise.all([
        getDocs(query(entriesRef, orderBy('createdAt', 'desc'), limit(20))),
        getDocs(query(convsRef, orderBy('updatedAt', 'desc'), limit(15))),
      ]);

      const userEntries = entriesSnap.docs.map((d) => d.data() as JournalEntry);
      const userConvs = convsSnap.docs.map((d) => d.data() as Conversation);

      const totalItems = userEntries.length + userConvs.length;
      setHistoryCount(totalItems);

      if (totalItems === 0) {
        setError('No journal entries or conversations found. Write an entry or chat with the AI Companion first to analyze insights.');
        setLoading(false);
        return;
      }

      // 2. Call secure server endpoint with Bearer auth token
      const result = await fetchReflectionInsights(userEntries, userConvs);
      setInsights(result);

      // 3. Save generated insight report to users/{uid}/insights/{insightId}
      const insightDocId = `insight_${Date.now()}`;
      await setDoc(doc(db, 'users', user.uid, 'insights', insightDocId), result);
    } catch (err: any) {
      console.error('Failed to generate insights:', err);
      setError(err.message || 'Could not synthesize reflection insights.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#0F172A] rounded-2xl border border-slate-700 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto text-slate-200">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 bg-[#1E293B] flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0 shadow-lg">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Reflection Insights
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Isolated to UID
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-entry synthesis identifying your recurring patterns, goals, unresolved concerns, and growth shifts.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-xl text-xs flex items-start justify-between gap-2">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-rose-400 font-semibold underline">
                Dismiss
              </button>
            </div>
          )}

          {!insights && !loading && (
            <div className="py-12 text-center max-w-md mx-auto space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#1E293B] border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400 shadow-xl">
                <Sparkles className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Ready to uncover your psychological patterns?
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Gemini will analyze only your authorized journal corpus to highlight recurring themes, goals, unresolved friction, and actionable questions.
                </p>
              </div>
              <button
                id="btn-run-insights"
                onClick={handleGenerateInsights}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
              >
                <Sparkles className="w-4 h-4 text-cyan-300" />
                <span>Generate Reflection Insights</span>
              </button>
            </div>
          )}

          {loading && (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <h4 className="font-bold text-white text-sm">
                Synthesizing Longitudinal Insights...
              </h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Reviewing authorized entries, extracting emotional patterns, and formulating reflection prompts.
              </p>
            </div>
          )}

          {insights && !loading && (
            <div className="space-y-6">
              
              {/* Top Meta Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-[#1E293B] rounded-xl border border-slate-700/60 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>
                    Analyzed <strong className="text-white">{insights.entryCountAnalyzed || 'multi'}</strong> authenticated journal records
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-mono text-[11px]">
                    Generated {new Date(insights.generatedAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={handleGenerateInsights}
                    disabled={loading}
                    className="flex items-center gap-1 px-3 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3 text-cyan-400" />
                    Re-Analyze
                  </button>
                </div>
              </div>

              {/* 1. Recurring Themes */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>1. Recurring Themes</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {insights.recurringThemes?.map((item, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-[#1E293B] border border-slate-700/60 space-y-1">
                      <div className="font-bold text-xs text-cyan-300">{item.theme}</div>
                      <p className="text-xs text-slate-400 leading-relaxed">{item.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Frequently Mentioned Goals */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <span>2. Frequently Mentioned Goals</span>
                </div>
                <div className="space-y-2">
                  {insights.frequentlyMentionedGoals?.map((item, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl bg-[#1E293B] border border-slate-700/60 flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="space-y-0.5">
                        <div className="font-bold text-xs text-white">{item.goal}</div>
                        <p className="text-xs text-slate-400 leading-relaxed">{item.statusOrContext}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Unresolved Concerns */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>3. Unresolved Concerns & Mindful Reframes</span>
                </div>
                <div className="space-y-2.5">
                  {insights.unresolvedConcerns?.map((item, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-[#1E293B] border border-amber-500/30 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                        <span className="text-amber-400">Concern:</span>
                        <span>{item.concern}</span>
                      </div>
                      <div className="text-xs text-slate-300 bg-slate-900/80 p-3 rounded-lg border border-slate-700/60 leading-relaxed">
                        <strong className="text-cyan-300">Reframing Perspective:</strong> {item.suggestedPerspective}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Notable Changes Across Entries */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span>4. Notable Changes Across Entries</span>
                </div>
                <div className="space-y-2">
                  {insights.notableChanges?.map((item, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl bg-[#1E293B] border border-slate-700/60 space-y-1">
                      <div className="font-bold text-xs text-blue-300">{item.observation}</div>
                      <p className="text-xs text-slate-400">{item.impact}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. Useful Reflection Questions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <HelpCircle className="w-4 h-4 text-purple-400" />
                  <span>5. Curated Reflection Questions for You</span>
                </div>
                <div className="space-y-2">
                  {insights.reflectionQuestions?.map((question, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#1E293B] border border-purple-500/30 flex items-center justify-between gap-3 group hover:border-purple-400 transition-colors"
                    >
                      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed italic">
                        "{question}"
                      </p>
                      {onSelectPromptForSession && (
                        <button
                          onClick={() => {
                            onSelectPromptForSession(question);
                            onClose();
                          }}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-md shadow-blue-600/20"
                          title="Start journaling on this question in AI Companion"
                        >
                          <span>Journal on this</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#1E293B] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encapsulated under UID {user.uid.slice(0, 10)}...</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors border border-slate-700"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
