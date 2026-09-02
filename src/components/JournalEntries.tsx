import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  updateDoc,
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot,
  sanitizeForFirestore 
} from '../firebase/config';
import { generateSummary } from '../services/api';
import { JournalEntry, SessionSummary } from '../types';
import { 
  Plus, 
  BookOpen, 
  Sparkles, 
  Trash2, 
  Tag, 
  Smile, 
  Search, 
  Clock, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  Edit3,
  Save
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface JournalEntriesProps {
  user: User;
  onSummaryCreated?: (summary: SessionSummary) => void;
}

const MOOD_OPTIONS = ['Peaceful', 'Reflective', 'Energized', 'Grateful', 'Anxious', 'Fatigued', 'Determined'];

export const JournalEntries: React.FC<JournalEntriesProps> = ({
  user,
  onSummaryCreated,
}) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('Reflective');
  const [autoSummarizeOnSave, setAutoSummarizeOnSave] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Real-time Firestore sync on users/{uid}/journals
  useEffect(() => {
    if (!user) return;
    const entriesRef = collection(db, 'users', user.uid, 'journals');
    const q = query(entriesRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded: JournalEntry[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<JournalEntry, 'id'>),
        }));
        setEntries(loaded);

        if (!selectedEntry && loaded.length > 0 && !isEditing) {
          setSelectedEntry(loaded[0]);
        }
      },
      (err) => {
        console.error('Firestore journals query error:', err);
        setError('Failed to fetch private journal entries.');
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleStartNewEntry = () => {
    setSelectedEntry(null);
    setTitle('');
    setContent('');
    setMood('Reflective');
    setIsEditing(true);
    setError(null);
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!content.trim()) {
      setError('Please write some thoughts before saving.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const entryId = selectedEntry ? selectedEntry.id : `entry_${Date.now()}`;
      const wordCount = content.trim().split(/\s+/).length;
      let aiSummary = selectedEntry?.summary || '';

      const entryData: JournalEntry = {
        id: entryId,
        userId: user.uid,
        title: title.trim() || 'Untitled Reflection',
        content: content.trim(),
        mood,
        tags: selectedEntry?.tags || [],
        summary: aiSummary,
        wordCount,
        createdAt: selectedEntry ? selectedEntry.createdAt : Date.now(),
        updatedAt: Date.now(),
      };

      // 1. Save directly into isolated collection: users/{uid}/journals/{entryId} first
      await setDoc(doc(db, 'users', user.uid, 'journals', entryId), sanitizeForFirestore(entryData));

      // 2. Automatically generate AI Summary if requested (server fetches the saved entry directly from Firestore)
      if (autoSummarizeOnSave && content.length > 50) {
        try {
          const summaryRes = await generateSummary({
            sourceType: 'journal',
            sourceId: entryId,
            journalEntryId: entryId,
            title: entryData.title,
            content: entryData.content,
          });
          aiSummary = summaryRes.summaryText;
          entryData.summary = aiSummary;

          // Update entry with summary in Firestore
          await updateDoc(doc(db, 'users', user.uid, 'journals', entryId), {
            summary: aiSummary,
            updatedAt: Date.now(),
          });

          // Also save in user's summaries collection
          const summaryId = `summary_journal_${entryId}`;
          const fullSummary: SessionSummary = {
            id: summaryId,
            userId: user.uid,
            sourceType: 'journal',
            sourceId: entryId,
            title: summaryRes.title || entryData.title,
            summaryText: summaryRes.summaryText || '',
            keyThemes: summaryRes.keyThemes || [],
            actionableTakeaways: summaryRes.actionableTakeaways || [],
            moodTrend: summaryRes.moodTrend || mood || 'Reflective',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          await setDoc(doc(db, 'users', user.uid, 'summaries', summaryId), sanitizeForFirestore(fullSummary));
          if (onSummaryCreated) onSummaryCreated(fullSummary);
        } catch (sumErr) {
          console.warn('Auto-summary failed but entry was saved securely:', sumErr);
        }
      }

      setSelectedEntry(entryData);
      setIsEditing(false);
      setSuccessMessage('Journal entry saved privately.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Error saving journal entry:', err);
      setError(err.message || 'Failed to save entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!user) return;
    if (!window.confirm('Are you sure you want to permanently delete this journal entry?')) return;

    try {
      await deleteDoc(doc(db, 'users', user.uid, 'journals', entryId));
      await deleteDoc(doc(db, 'users', user.uid, 'summaries', `summary_journal_${entryId}`)).catch(() => {});
      if (selectedEntry?.id === entryId) {
        setSelectedEntry(null);
        setIsEditing(false);
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      setError('Could not delete entry.');
    }
  };

  const filteredEntries = entries.filter((e) => {
    const q = searchQuery.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      (e.tags && e.tags.some((t) => t.includes(q))) ||
      (e.mood && e.mood.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] max-w-7xl mx-auto overflow-hidden bg-[#0F172A] text-slate-200">
      
      {/* Entries Sidebar */}
      <aside className="w-80 sm:w-96 border-r border-slate-700/50 bg-[#1E293B] flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-700/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Entries ({entries.length})
              </h2>
            </div>
            <button
              id="btn-new-entry"
              onClick={handleStartNewEntry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-3.5 h-3.5" />
              New Entry
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search thoughts or moods..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-12 px-4 text-slate-500 text-xs">
              {searchQuery ? 'No entries match your search.' : 'No journal entries yet. Click "New Entry" to write.'}
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id && !isEditing;
              return (
                <button
                  key={entry.id}
                  onClick={() => {
                    setSelectedEntry(entry);
                    setIsEditing(false);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl transition-all border group ${
                    isSelected
                      ? 'bg-slate-800/90 border-slate-700 shadow-md text-white'
                      : 'border-transparent hover:bg-slate-800/40 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <h4 className={`font-semibold text-xs truncate max-w-[200px] ${isSelected ? 'text-blue-300' : 'group-hover:text-blue-400'}`}>
                      {entry.title}
                    </h4>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                      {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                    {entry.content}
                  </p>

                  <div className="mt-2.5 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {entry.mood && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                          {entry.mood}
                        </span>
                      )}
                      {entry.tags && entry.tags.length > 0 && (
                        <span className="text-slate-400 flex items-center gap-0.5">
                          <Tag className="w-2.5 h-2.5 text-slate-500" />
                          #{entry.tags[0]}
                          {entry.tags.length > 1 ? ` +${entry.tags.length - 1}` : ''}
                        </span>
                      )}
                    </div>
                    {entry.summary && (
                      <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> AI Summary
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Isolation Footer */}
        <div className="p-3 border-t border-slate-700/50 bg-slate-900/30 text-[11px] text-slate-400 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Private</span>
        </div>
      </aside>

      {/* Main View / Editor Area */}
      <main className="flex-1 flex flex-col bg-[#0F172A] overflow-y-auto">
        {successMessage && (
          <div className="bg-emerald-950/40 border-b border-emerald-800 px-6 py-2.5 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-rose-950/40 border-b border-rose-800 px-6 py-2.5 text-xs text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:underline text-xs">
              Dismiss
            </button>
          </div>
        )}

        {isEditing ? (
          /* Editor View */
          <form onSubmit={handleSaveEntry} className="flex-1 flex flex-col p-6 max-w-3xl mx-auto w-full space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-lg text-white tracking-tight">
                {selectedEntry ? 'Edit Journal Entry' : 'New Reflection Entry'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-entry"
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-600/20 transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving & Summarizing...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 text-white" />
                      <span>Save Entry</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Title & Mood */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">Title</label>
                <input
                  id="input-entry-title"
                  type="text"
                  placeholder="e.g. Unpacking a shift in perspective..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">Mood State</label>
                <select
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                >
                  {MOOD_OPTIONS.map((m) => (
                    <option key={m} value={m} className="bg-slate-900 text-white">
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1 flex items-center justify-between">
                <span>Journal Body</span>
                <span className="text-slate-500 font-normal text-[11px]">
                  {content.trim() ? content.trim().split(/\s+/).length : 0} words
                </span>
              </label>
              <textarea
                id="input-entry-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your honest, private reflection here. All content is stored securely in your private journal..."
                className="flex-1 w-full min-h-[300px] p-4 text-sm leading-relaxed bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-none font-sans"
              />
            </div>

            {/* Auto Summarize Toggle */}
            <div className="p-3.5 bg-[#1E293B] border border-slate-700/60 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-cyan-300">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="text-slate-200 font-medium">Automatic Gemini Summarization on Save</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSummarizeOnSave}
                  onChange={(e) => setAutoSummarizeOnSave(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </form>
        ) : selectedEntry ? (
          /* Reader View */
          <div className="p-6 sm:p-10 max-w-3xl mx-auto w-full space-y-6">
            
            {/* Header / Actions */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="font-bold text-2xl sm:text-3xl text-white tracking-tight">
                  {selectedEntry.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    {new Date(selectedEntry.createdAt).toLocaleDateString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                  <span>•</span>
                  <span className="px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                    {selectedEntry.mood || 'Reflective'}
                  </span>
                  {selectedEntry.wordCount && (
                    <>
                      <span>•</span>
                      <span className="text-slate-400">{selectedEntry.wordCount} words</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setTitle(selectedEntry.title);
                    setContent(selectedEntry.content);
                    setMood(selectedEntry.mood || 'Reflective');
                    setIsEditing(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700/80 rounded-xl transition-colors border border-slate-700"
                >
                  <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteEntry(selectedEntry.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-slate-700/80 rounded-xl transition-colors border border-slate-700"
                  title="Delete entry"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* AI Summary Highlight Box */}
            {selectedEntry.summary && (
              <div className="p-5 rounded-2xl bg-[#1E293B] border border-cyan-500/30 space-y-2 shadow-xl">
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span>Gemini Automated Summary</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed italic">
                  "{selectedEntry.summary}"
                </p>
              </div>
            )}

            {/* Tags list */}
            {selectedEntry.tags && selectedEntry.tags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedEntry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 text-xs font-medium"
                  >
                    <Tag className="w-3 h-3 text-slate-500" />
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Content Body */}
            <div className="bg-[#1E293B]/60 border border-slate-700/50 rounded-2xl p-6 sm:p-8 shadow-md">
              <div className="text-sm sm:text-base text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                {selectedEntry.content}
              </div>
            </div>
          </div>
        ) : (
          /* Empty Selection */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <BookOpen className="w-12 h-12 text-slate-600 mb-3" />
            <h3 className="font-bold text-slate-300 text-base">Select or Create an Entry</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Choose an existing journal reflection from the sidebar or click New Entry to start writing.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};
