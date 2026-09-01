import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  db, 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc 
} from '../firebase/config';
import { SessionSummary } from '../types';
import { 
  ListCheck, 
  Sparkles, 
  Tag, 
  CheckCircle2, 
  Trash2, 
  Calendar, 
  Lock, 
  MessageSquare, 
  BookOpen, 
  ArrowRight 
} from 'lucide-react';

interface SummariesViewProps {
  user: User;
  onNavigateToTab?: (tab: 'chat' | 'entries') => void;
}

export const SummariesView: React.FC<SummariesViewProps> = ({ user, onNavigateToTab }) => {
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const summariesRef = collection(db, 'users', user.uid, 'summaries');
    const q = query(summariesRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: SessionSummary[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<SessionSummary, 'id'>),
        }));
        setSummaries(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching summaries:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleDeleteSummary = async (summaryId: string) => {
    if (!user) return;
    if (!window.confirm('Delete this saved summary?')) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'summaries', summaryId));
    } catch (err) {
      console.error('Delete summary error:', err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-slate-200">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Saved Summaries & Takeaways
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-cyan-400 border border-cyan-500/20">
              AI-Synthesized
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Automatically extracted breakthroughs, key themes, and action items stored strictly under your private account.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>users/{user.uid.slice(0, 8)}.../summaries</span>
        </div>
      </div>

      {/* Grid of Summaries */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          Loading summaries...
        </div>
      ) : summaries.length === 0 ? (
        <div className="py-20 text-center max-w-md mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-[#1E293B] border border-slate-700/60 flex items-center justify-center mx-auto text-slate-400 mb-3 shadow-lg">
            <ListCheck className="w-6 h-6 text-cyan-400" />
          </div>
          <h3 className="font-bold text-base text-white">No Summaries Yet</h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Summaries are generated automatically when you click <strong>"Summarize Session"</strong> in the AI Companion or save a new Journal Entry.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {onNavigateToTab && (
              <>
                <button
                  onClick={() => onNavigateToTab('chat')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/20 transition-colors"
                >
                  Go to AI Companion
                </button>
                <button
                  onClick={() => onNavigateToTab('entries')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700/80 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition-colors"
                >
                  Write Journal Entry
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {summaries.map((sum) => (
            <div
              key={sum.id}
              className="bg-[#1E293B] border border-slate-700/60 rounded-2xl p-5 sm:p-6 shadow-xl hover:border-slate-600 transition-all space-y-4"
            >
              {/* Header Info */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${
                        sum.sourceType === 'conversation'
                          ? 'bg-blue-500/10 text-cyan-300 border border-cyan-500/30'
                          : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {sum.sourceType === 'conversation' ? (
                        <MessageSquare className="w-3 h-3" />
                      ) : (
                        <BookOpen className="w-3 h-3" />
                      )}
                      {sum.sourceType === 'conversation' ? 'Conversation Session' : 'Journal Entry'}
                    </span>

                    {sum.moodTrend && (
                      <span className="text-xs text-slate-400 italic">
                        • {sum.moodTrend}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-lg text-white mt-2">
                    {sum.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-cyan-400" />
                    {new Date(sum.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <button
                    onClick={() => handleDeleteSummary(sum.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700/50 transition-colors"
                    title="Delete summary"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Summary Text */}
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                {sum.summaryText}
              </p>

              {/* Key Themes & Action Items */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-700/60">
                {/* Key Themes */}
                {sum.keyThemes && sum.keyThemes.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-slate-500" />
                      Key Themes
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {sum.keyThemes.map((theme, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actionable Takeaways */}
                {sum.actionableTakeaways && sum.actionableTakeaways.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Actionable Takeaways
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {sum.actionableTakeaways.map((takeaway, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-cyan-400 font-bold">•</span>
                          <span>{takeaway}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
