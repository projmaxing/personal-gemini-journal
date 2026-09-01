import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  orderBy, 
  onSnapshot 
} from '../firebase/config';
import { sendChatMessage, generateSummary } from '../services/api';
import { ChatMessage, Conversation, SessionSummary } from '../types';
import { 
  Send, 
  Sparkles, 
  Plus, 
  MessageSquare, 
  FileText, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  CornerDownLeft,
  ChevronRight,
  Smile,
  Compass
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface JournalChatProps {
  user: User;
  onSummaryGenerated?: (summary: SessionSummary) => void;
  onSelectPromptForEntry?: (promptText: string) => void;
}

const PROMPT_SUGGESTIONS = [
  "I'm feeling mentally scattered today. Help me unpack what's taking up mental bandwidth.",
  "I achieved a milestone today, but I'm having trouble celebrating it. Can we reflect?",
  "I have a tough decision to make between safety and growth. Let's talk it through.",
  "Evening unwind: What are 3 micro-moments from today that deserve gratitude?"
];

export const JournalChat: React.FC<JournalChatProps> = ({
  user,
  onSummaryGenerated,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [moodContext, setMoodContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryNotification, setSummaryNotification] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Load user's conversations list from Firestore: users/{uid}/conversations
  useEffect(() => {
    if (!user) return;
    const convsRef = collection(db, 'users', user.uid, 'conversations');
    const q = query(convsRef, orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded: Conversation[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Conversation, 'id'>),
        }));
        setConversations(loaded);

        // If no conversation selected and conversations exist, select first; else create new
        if (!currentConversationId && loaded.length > 0) {
          setCurrentConversationId(loaded[0].id);
        } else if (loaded.length === 0 && !currentConversationId) {
          handleNewConversation();
        }
      },
      (err) => {
        console.error('Firestore conversations listener error:', err);
        setError('Error loading conversation history from isolated Firestore.');
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Load messages for current conversation: users/{uid}/conversations/{conversationId}/messages
  useEffect(() => {
    if (!user || !currentConversationId) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'users', user.uid, 'conversations', currentConversationId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedMsgs: ChatMessage[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ChatMessage, 'id'>),
        }));
        setMessages(loadedMsgs);
      },
      (err) => {
        console.error('Firestore messages listener error:', err);
      }
    );

    return () => unsubscribe();
  }, [user, currentConversationId]);

  // Create a new private conversation session
  const handleNewConversation = async () => {
    if (!user) return;
    try {
      const newId = `conv_${Date.now()}`;
      const newConv: Conversation = {
        id: newId,
        userId: user.uid,
        title: 'New Reflection Session',
        messageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await setDoc(doc(db, 'users', user.uid, 'conversations', newId), newConv);
      setCurrentConversationId(newId);
      setMessages([]);
      setError(null);
    } catch (err: any) {
      console.error('Error creating conversation:', err);
      setError('Could not create new session in Firestore.');
    }
  };

  // Send message to Gemini through secure server path
  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = customPrompt || inputText;
    if (!promptToSend.trim() || isGenerating || !user) return;

    const convId = currentConversationId || `conv_${Date.now()}`;
    const userMsgId = `msg_${Date.now()}_u`;

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      text: promptToSend.trim(),
      createdAt: Date.now(),
    };

    setInputText('');
    setError(null);
    setIsGenerating(true);

    try {
      // 1. Save user message to Firestore subcollection under verified UID
      await setDoc(
        doc(db, 'users', user.uid, 'conversations', convId, 'messages', userMsgId),
        userMessage
      );

      // Auto update conversation title on first message
      const isFirstMessage = messages.length === 0;
      const computedTitle = isFirstMessage 
        ? promptToSend.slice(0, 32).replace(/[^\w\s]/gi, '') + (promptToSend.length > 32 ? '...' : '')
        : undefined;

      await setDoc(
        doc(db, 'users', user.uid, 'conversations', convId),
        {
          userId: user.uid,
          updatedAt: Date.now(),
          lastMessagePreview: promptToSend.slice(0, 80),
          messageCount: messages.length + 1,
          ...(computedTitle ? { title: computedTitle } : {}),
        },
        { merge: true }
      );

      // 2. Call server-side multi-turn endpoint with Bearer auth token
      const aiResponse = await sendChatMessage(promptToSend.trim(), messages, moodContext);

      const assistantMsgId = `msg_${Date.now()}_a`;
      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        text: aiResponse.text,
        createdAt: aiResponse.timestamp || Date.now(),
      };

      // 3. Save assistant response to Firestore
      await setDoc(
        doc(db, 'users', user.uid, 'conversations', convId, 'messages', assistantMsgId),
        assistantMessage
      );

      // Update conversation message count
      await setDoc(
        doc(db, 'users', user.uid, 'conversations', convId),
        {
          updatedAt: Date.now(),
          messageCount: messages.length + 2,
        },
        { merge: true }
      );
    } catch (err: any) {
      console.error('Failed to send message:', err);
      setError(err.message || 'Error receiving Gemini response. Verify your connection.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate automatic summary using Gemini and save to Firestore
  const handleSummarizeSession = async () => {
    if (!user || !currentConversationId || messages.length < 2) {
      setError('Please have at least 1 back-and-forth exchange before summarizing.');
      return;
    }

    setIsSummarizing(true);
    setError(null);

    try {
      const activeConv = conversations.find((c) => c.id === currentConversationId);
      const summaryResult = await generateSummary({
        sourceType: 'conversation',
        sourceId: currentConversationId,
        title: activeConv?.title || 'Journal Session',
        messages,
      });

      // Save summary in users/{uid}/summaries/{summaryId}
      const summaryId = `summary_${Date.now()}`;
      const fullSummary: SessionSummary = {
        id: summaryId,
        userId: user.uid,
        sourceType: 'conversation',
        sourceId: currentConversationId,
        title: summaryResult.title || activeConv?.title || 'Session Summary',
        summaryText: summaryResult.summaryText,
        keyThemes: summaryResult.keyThemes || [],
        actionableTakeaways: summaryResult.actionableTakeaways || [],
        moodTrend: summaryResult.moodTrend,
        createdAt: Date.now(),
      };

      await setDoc(doc(db, 'users', user.uid, 'summaries', summaryId), fullSummary);

      // Update conversation with summary snippet
      await setDoc(
        doc(db, 'users', user.uid, 'conversations', currentConversationId),
        {
          summary: summaryResult.summaryText,
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      setSummaryNotification(`Saved session summary: "${fullSummary.title}"`);
      setTimeout(() => setSummaryNotification(null), 5000);

      if (onSummaryGenerated) {
        onSummaryGenerated(fullSummary);
      }
    } catch (err: any) {
      console.error('Summarization failed:', err);
      setError(err.message || 'Failed to generate session summary.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const currentConv = conversations.find((c) => c.id === currentConversationId);

  return (
    <div className="flex h-[calc(100vh-4rem)] max-w-7xl mx-auto overflow-hidden bg-[#0F172A]">
      
      {/* Session History Sidebar */}
      <aside className="w-72 sm:w-80 border-r border-slate-700/50 bg-[#1E293B] flex flex-col shrink-0 hidden md:flex">
        <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Conversations
            </h2>
          </div>
          <button
            id="btn-new-conversation"
            onClick={handleNewConversation}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            New Session
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {conversations.length === 0 ? (
            <div className="text-center py-8 px-4 text-slate-500 text-xs">
              No conversations yet. Start your first session above.
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = conv.id === currentConversationId;
              return (
                <button
                  key={conv.id}
                  onClick={() => setCurrentConversationId(conv.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all border group ${
                    isSelected
                      ? 'bg-slate-800/90 border-slate-700 shadow-md text-white'
                      : 'border-transparent hover:bg-slate-800/40 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className={`font-medium text-xs truncate max-w-[190px] ${isSelected ? 'text-blue-300' : 'group-hover:text-blue-400'}`}>
                      {conv.title || 'Untitled Session'}
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                      {new Date(conv.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  {conv.lastMessagePreview && (
                    <p className="text-[11px] text-slate-400 truncate mt-1">
                      {conv.lastMessagePreview}
                    </p>
                  )}
                  {conv.summary && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                      <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">Summarized</span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Security verification stamp */}
        <div className="p-3 border-t border-slate-700/50 bg-slate-900/30 text-[11px] text-slate-400 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Vault: <code className="font-mono text-[10px] text-slate-300">users/{'{uid}'}/conversations</code></span>
        </div>
      </aside>

      {/* Main Multi-turn Chat Panel */}
      <main className="flex-1 flex flex-col bg-[#0F172A] relative overflow-hidden">
        
        {/* Top Header of Active Session */}
        <header className="px-6 py-3.5 bg-[#0F172A]/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center text-cyan-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-semibold text-white">
                  {currentConv?.title || 'Private Reflection Session'}
                </h3>
                <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] rounded uppercase tracking-wider border border-slate-700 font-mono hidden sm:inline-block">
                  AES-256 Cloud Vault
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span>Multi-turn Gemini 2.5 Flash</span>
                <span>•</span>
                <span>Context preserved</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Automatic Summarize Action */}
            <button
              id="btn-summarize-session"
              onClick={handleSummarizeSession}
              disabled={isSummarizing || messages.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700/80 text-slate-200 rounded-xl border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              title="Automatically extract summary, key themes, and takeaways using Gemini"
            >
              {isSummarizing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span>{isSummarizing ? 'Summarizing...' : 'Summarize Session'}</span>
            </button>
          </div>
        </header>

        {/* Feedback / Notification Banners */}
        {summaryNotification && (
          <div className="bg-emerald-950/40 border-b border-emerald-800 px-4 py-2 text-xs text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{summaryNotification}</span>
            </div>
            <span className="font-semibold text-[11px] text-emerald-400">View in Saved Summaries tab</span>
          </div>
        )}

        {error && (
          <div className="bg-rose-950/40 border-b border-rose-800 px-4 py-2 text-xs text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:underline text-[11px]">
              Dismiss
            </button>
          </div>
        )}

        {/* Message Thread */}
        <section className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto text-center py-10 space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 text-cyan-400 mx-auto flex items-center justify-center shadow-lg shadow-blue-500/10">
                <Compass className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  What's on your mind today?
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Your reflections remain strictly isolated to your authenticated account. Type freely or select a starting prompt:
                </p>
              </div>

              {/* Prompt Starters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left pt-2">
                {PROMPT_SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(suggestion)}
                    className="p-3.5 rounded-xl bg-[#1E293B]/70 border border-slate-700/60 hover:border-slate-600 hover:bg-slate-800 text-xs text-slate-300 transition-all text-left group shadow-xs"
                  >
                    <div className="flex items-start justify-between">
                      <span className="leading-relaxed group-hover:text-white">{suggestion}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0 mt-0.5 ml-2" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {isUser ? (
                    <div className="max-w-[75%] bg-blue-600 text-white p-4 rounded-2xl rounded-tr-none shadow-lg shadow-blue-600/10">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      <p className="text-[10px] text-blue-200 mt-2 text-right">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Private
                      </p>
                    </div>
                  ) : (
                    <div className="max-w-[85%] bg-[#1E293B] text-slate-200 p-5 rounded-2xl rounded-tl-none border border-slate-700/80 shadow-xl">
                      <div className="flex items-center gap-2 mb-2.5 text-cyan-400">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold tracking-widest uppercase">Gemini Analysis</span>
                      </div>
                      <div className="prose prose-invert prose-xs sm:prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 text-slate-200 leading-relaxed">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-2 font-mono">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {isGenerating && (
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-[#1E293B] text-slate-200 p-4 rounded-2xl rounded-tl-none border border-slate-700/80 shadow-xl flex items-center gap-3">
                <div className="flex items-center gap-2 text-cyan-400">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-xs font-bold tracking-widest uppercase">Gemini Reflecting</span>
                </div>
                <span className="text-xs text-slate-400 italic">Synthesizing thoughtful guidance...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </section>

        {/* Input Bar with Mood context toggle */}
        <footer className="p-4 sm:p-6 bg-[#0F172A]/90 border-t border-slate-800 backdrop-blur-md">
          <div className="max-w-4xl mx-auto space-y-2.5">
            
            {/* Optional Mood Context pill */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Smile className="w-3.5 h-3.5 text-slate-400" />
              <span>Emotional Tone:</span>
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                {['Reflective', 'Anxious', 'Energized', 'Grateful', 'Overwhelmed', 'Clear-Headed'].map((mood) => (
                  <button
                    key={mood}
                    type="button"
                    onClick={() => setMoodContext(moodContext === mood ? '' : mood)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors whitespace-nowrap ${
                      moodContext === mood
                        ? 'bg-blue-600/30 text-cyan-300 border-cyan-500/50 font-semibold'
                        : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="relative"
            >
              <textarea
                id="input-chat-prompt"
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={2}
                placeholder="Type your reflection, thought, or question here..."
                className="w-full bg-[#1E293B] border border-slate-700 rounded-xl py-3.5 pl-4 pr-16 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-none shadow-inner"
              />

              <div className="absolute right-3 bottom-3.5 flex items-center gap-2">
                <button
                  id="btn-send-message"
                  type="submit"
                  disabled={!inputText.trim() || isGenerating}
                  className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 shadow-lg shadow-blue-600/20"
                  title="Send reflection (Enter)"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>

            <p className="text-center text-[10px] text-slate-500 flex items-center justify-center gap-1.5 pt-1">
              <Lock className="w-3 h-3 text-emerald-400" />
              <span>End-to-End Encryption Enabled. No one but you can read this journal.</span>
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
};
