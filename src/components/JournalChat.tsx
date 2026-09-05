import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  deleteDoc,
  getDocs, 
  query, 
  where,
  orderBy, 
  onSnapshot,
  sanitizeForFirestore 
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
  Compass,
  Trash2,
  X,
  Copy,
  Check,
  Pencil,
  RotateCcw
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
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionTitleInput, setSessionTitleInput] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [regeneratingMsgId, setRegeneratingMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentConversationIdRef = useRef<string | null>(null);
  currentConversationIdRef.current = currentConversationId;
  const isCreatingSessionRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

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

        const activeId = currentConversationIdRef.current;
        if (!activeId) {
          if (loaded.length > 0) {
            const firstId = loaded[0].id;
            currentConversationIdRef.current = firstId;
            setCurrentConversationId(firstId);
          } else if (!initialLoadDoneRef.current && !isCreatingSessionRef.current) {
            initialLoadDoneRef.current = true;
            handleNewConversation();
          }
        }
      },
      (err) => {
        console.error('Firestore conversations listener error:', err);
        setError('Error loading conversation history. Please refresh.');
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

    // Immediately clear displayed messages when switching or creating conversations
    setMessages([]);

    const targetConvId = currentConversationId;
    const messagesRef = collection(db, 'users', user.uid, 'conversations', targetConvId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // Discard any incoming snapshots if user switched away to a different conversation
        if (currentConversationIdRef.current !== targetConvId) return;

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

    return () => {
      unsubscribe();
    };
  }, [user, currentConversationId]);

  // Handler to switch active conversation with instant state cleanup
  const handleSelectConversation = (convId: string) => {
    if (convId === currentConversationId) return;
    currentConversationIdRef.current = convId;
    setCurrentConversationId(convId);
    setMessages([]);
    setInputText('');
    setIsGenerating(false);
    setIsSummarizing(false);
    setError(null);
  };

  // Create a genuinely new private conversation session
  const handleNewConversation = async () => {
    if (!user || isCreatingSessionRef.current) return;
    isCreatingSessionRef.current = true;

    // Immediately clear displayed state, draft text, and generation flags
    setInputText('');
    setMessages([]);
    setIsGenerating(false);
    setIsSummarizing(false);
    setError(null);

    // Generate unique conversation ID
    const newId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    currentConversationIdRef.current = newId;
    setCurrentConversationId(newId);

    try {
      const newConv: Conversation = {
        id: newId,
        userId: user.uid,
        title: 'New Reflection Session',
        messageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await setDoc(doc(db, 'users', user.uid, 'conversations', newId), sanitizeForFirestore(newConv));
    } catch (err: any) {
      console.error('Error creating conversation:', err);
      setError('Could not create new session. Please try again.');
    } finally {
      isCreatingSessionRef.current = false;
    }
  };

  // Delete conversation and its messages from Firestore
  const handleDeleteConversation = async (conv: Conversation) => {
    if (!user || isGenerating || isDeleting) return;
    setIsDeleting(true);
    setError(null);

    const convIdToDelete = conv.id;
    const isCurrentlySelected = currentConversationId === convIdToDelete;

    try {
      // 1. Fetch all message docs in the subcollection and delete them
      const messagesRef = collection(db, 'users', user.uid, 'conversations', convIdToDelete, 'messages');
      const messagesSnap = await getDocs(messagesRef);
      const deleteMessagePromises = messagesSnap.docs.map((docSnap) => deleteDoc(docSnap.ref));
      await Promise.all(deleteMessagePromises);

      // 2. Delete the conversation document itself
      await deleteDoc(doc(db, 'users', user.uid, 'conversations', convIdToDelete));

      // Note: Journal Entries and Saved Summaries are not affected by conversation deletion.

      // 3. Update active conversation if the deleted one was selected
      if (isCurrentlySelected) {
        setMessages([]);
        setInputText('');
        setIsGenerating(false);
        setIsSummarizing(false);

        const remaining = conversations.filter((c) => c.id !== convIdToDelete);
        if (remaining.length > 0) {
          const nextConv = remaining[0];
          currentConversationIdRef.current = nextConv.id;
          setCurrentConversationId(nextConv.id);
        } else {
          currentConversationIdRef.current = null;
          setCurrentConversationId(null);
          await handleNewConversation();
        }
      }

      setConversationToDelete(null);
    } catch (err: any) {
      console.error('Error deleting conversation from Firestore:', err);
      setError(err.message || 'Failed to delete conversation. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy message text to clipboard with fallback
  const handleCopyMessageText = async (msgId: string, text: string) => {
    let success = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        success = true;
      }
    } catch (clipErr) {
      console.warn('Clipboard API writeText failed, trying fallback:', clipErr);
    }

    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
    }

    if (success) {
      setCopiedMessageId(msgId);
      setTimeout(() => {
        setCopiedMessageId((prev) => (prev === msgId ? null : prev));
      }, 2000);
    }
  };

  // Start renaming session
  const startRenaming = (convId: string, currentTitle: string) => {
    setEditingSessionId(convId);
    setSessionTitleInput(currentTitle);
  };

  // Save renamed session title to Firestore
  const handleSaveSessionTitle = async (convId: string) => {
    const trimmed = sessionTitleInput.trim();
    if (!trimmed || !user || isRenaming) {
      setEditingSessionId(null);
      return;
    }
    setIsRenaming(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid, 'conversations', convId),
        {
          title: trimmed,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      setEditingSessionId(null);
    } catch (err: any) {
      console.error('Error renaming conversation:', err);
      setError('Failed to rename session. Please try again.');
    } finally {
      setIsRenaming(false);
    }
  };

  // Regenerate an assistant response using its preceding user prompt
  const handleRegenerateResponse = async (assistantMsg: ChatMessage) => {
    if (isGenerating || !user || !currentConversationId) return;

    const msgIndex = messages.findIndex((m) => m.id === assistantMsg.id);
    if (msgIndex === -1) return;

    // Search backwards to find the user prompt that prompted this response
    let promptUserMsg: ChatMessage | null = null;
    let priorHistory: ChatMessage[] = [];
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        promptUserMsg = messages[i];
        priorHistory = messages.slice(0, i);
        break;
      }
    }

    if (!promptUserMsg) {
      setError('No user prompt found to regenerate a response for.');
      return;
    }

    setIsGenerating(true);
    setRegeneratingMsgId(assistantMsg.id);
    setError(null);

    const targetConvId = currentConversationId;

    try {
      const aiResponse = await sendChatMessage(promptUserMsg.text, priorHistory, moodContext);

      if (currentConversationIdRef.current === targetConvId) {
        const updatedAssistantMessage: ChatMessage = {
          ...assistantMsg,
          text: aiResponse.text,
          createdAt: aiResponse.timestamp || Date.now(),
        };

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? updatedAssistantMessage : m))
        );

        // Update Firestore message document
        await setDoc(
          doc(db, 'users', user.uid, 'conversations', targetConvId, 'messages', assistantMsg.id),
          updatedAssistantMessage,
          { merge: true }
        );

        // Update conversation timestamp
        await setDoc(
          doc(db, 'users', user.uid, 'conversations', targetConvId),
          { updatedAt: Date.now() },
          { merge: true }
        );
      }
    } catch (err: any) {
      console.error('Failed to regenerate response:', err);
      if (currentConversationIdRef.current === targetConvId) {
        setError(err.message || 'Error regenerating response. Please try again.');
      }
    } finally {
      if (currentConversationIdRef.current === targetConvId) {
        setIsGenerating(false);
        setRegeneratingMsgId(null);
      }
    }
  };

  // Send message to Gemini through secure server path
  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = customPrompt || inputText;
    if (!promptToSend.trim() || isGenerating || !user) return;

    let convId = currentConversationId;
    if (!convId) {
      convId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      currentConversationIdRef.current = convId;
      setCurrentConversationId(convId);
    }

    const targetConvId = convId;
    const userMsgId = `msg_${Date.now()}_u`;

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      text: promptToSend.trim(),
      createdAt: Date.now(),
    };

    // Optimistically add user message only if user is still on this conversation
    if (currentConversationIdRef.current === targetConvId) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === userMsgId)) return prev;
        return [...prev, userMessage];
      });
    }

    setInputText('');
    setError(null);
    setIsGenerating(true);

    try {
      // 1. Save user message to Firestore subcollection under verified UID
      await setDoc(
        doc(db, 'users', user.uid, 'conversations', targetConvId, 'messages', userMsgId),
        userMessage
      );

      // Auto update conversation title on first message (asynchronously non-blocking)
      const isFirstMessage = messages.length === 0;
      const computedTitle = isFirstMessage 
        ? promptToSend.slice(0, 32).replace(/[^\w\s]/gi, '').trim() + (promptToSend.length > 32 ? '...' : '')
        : undefined;

      const metaUpdatePromise = setDoc(
        doc(db, 'users', user.uid, 'conversations', targetConvId),
        {
          userId: user.uid,
          updatedAt: Date.now(),
          lastMessagePreview: promptToSend.slice(0, 80),
          messageCount: messages.length + 1,
          ...(computedTitle ? { title: computedTitle } : {}),
        },
        { merge: true }
      ).catch((err) => console.warn('Non-blocking conversation metadata update failed:', err));

      // 2. Call server-side multi-turn endpoint with Bearer auth token
      const aiResponse = await sendChatMessage(promptToSend.trim(), messages, moodContext);
      await metaUpdatePromise;

      const assistantMsgId = `msg_${Date.now()}_a`;
      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        text: aiResponse.text,
        createdAt: aiResponse.timestamp || Date.now(),
      };

      // Only update local UI state if user has not navigated away during generation
      if (currentConversationIdRef.current === targetConvId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === assistantMsgId)) return prev;
          return [...prev, assistantMessage];
        });
        setIsGenerating(false);
      }

      // 3. Persist assistant response and updated metadata to Firestore in background (non-blocking for UI)
      Promise.all([
        setDoc(
          doc(db, 'users', user.uid, 'conversations', targetConvId, 'messages', assistantMsgId),
          assistantMessage
        ),
        setDoc(
          doc(db, 'users', user.uid, 'conversations', targetConvId),
          {
            updatedAt: Date.now(),
            messageCount: messages.length + 2,
          },
          { merge: true }
        ),
      ]).catch((persistErr) => {
        console.warn('Background Firestore persistence for assistant message failed:', persistErr);
      });
    } catch (err: any) {
      console.error('Failed to send message:', err);
      if (currentConversationIdRef.current === targetConvId) {
        setError(err.message || 'Error receiving Gemini response. Verify your connection.');
      }
    } finally {
      if (currentConversationIdRef.current === targetConvId) {
        setIsGenerating(false);
      }
    }
  };

  // Generate or update automatic summary idempotently (at most 1 saved summary per conversation)
  const handleSummarizeSession = async () => {
    if (!user || !currentConversationId) {
      setError('Please select or start a reflection session first.');
      return;
    }

    let activeMessages = messages;
    if (activeMessages.length === 0) {
      try {
        const msgsRef = collection(db, 'users', user.uid, 'conversations', currentConversationId, 'messages');
        const msgsSnap = await getDocs(query(msgsRef, orderBy('createdAt', 'asc')));
        if (!msgsSnap.empty) {
          activeMessages = msgsSnap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<ChatMessage, 'id'>),
          }));
          setMessages(activeMessages);
        }
      } catch (fetchMsgErr) {
        console.warn('Could not fetch messages from Firestore for summarization:', fetchMsgErr);
      }
    }

    if (activeMessages.length === 0) {
      setError('No messages found in this conversation to summarize.');
      return;
    }

    if (activeMessages.length < 2) {
      setError('Please have at least 1 back-and-forth exchange before summarizing.');
      return;
    }

    setIsSummarizing(true);
    setError(null);

    try {
      const activeConv = conversations.find((c) => c.id === currentConversationId);

      // 1. Look up existing summary for this conversation to guarantee at most 1 saved summary
      let existingSummary: SessionSummary | null = null;
      const duplicateIdsToDelete: string[] = [];

      // Check if conversation already has a linked summaryId
      if (activeConv?.summaryId) {
        try {
          const sumDocSnap = await getDoc(doc(db, 'users', user.uid, 'summaries', activeConv.summaryId));
          if (sumDocSnap.exists()) {
            existingSummary = {
              id: sumDocSnap.id,
              ...(sumDocSnap.data() as Omit<SessionSummary, 'id'>),
            };
          }
        } catch (fetchErr) {
          console.warn('Could not fetch summary by summaryId:', fetchErr);
        }
      }

      // Check deterministic document ID users/{uid}/summaries/summary_conv_${currentConversationId}
      if (!existingSummary) {
        try {
          const detDocSnap = await getDoc(doc(db, 'users', user.uid, 'summaries', `summary_conv_${currentConversationId}`));
          if (detDocSnap.exists()) {
            existingSummary = {
              id: detDocSnap.id,
              ...(detDocSnap.data() as Omit<SessionSummary, 'id'>),
            };
          }
        } catch (fetchErr) {
          console.warn('Could not fetch summary by deterministic ID:', fetchErr);
        }
      }

      // Query summaries collection where sourceType == 'conversation' and sourceId == currentConversationId
      try {
        const sumQuery = query(
          collection(db, 'users', user.uid, 'summaries'),
          where('sourceType', '==', 'conversation'),
          where('sourceId', '==', currentConversationId)
        );
        const querySnap = await getDocs(sumQuery);
        if (!querySnap.empty) {
          const matchedSummaries: SessionSummary[] = querySnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SessionSummary, 'id'>),
          }));

          // Sort so the latest created/updated is prioritized
          matchedSummaries.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

          if (!existingSummary) {
            existingSummary = matchedSummaries[0];
          }

          // Mark any other duplicate documents for this conversation to be removed
          const canonicalId = existingSummary.id;
          for (const s of matchedSummaries) {
            if (s.id !== canonicalId && !duplicateIdsToDelete.includes(s.id)) {
              duplicateIdsToDelete.push(s.id);
            }
          }
        }
      } catch (queryErr) {
        console.warn('Query for existing summaries encountered an error:', queryErr);
      }

      // 2. Check if any new messages have been added since the last summary
      const recordedMessageCount = activeConv?.lastSummarizedMessageCount ?? existingSummary?.messageCount;
      const hasSummaryContent = Boolean(existingSummary?.summaryText || activeConv?.summary);

      // IDEMPOTENCY CHECK: If an existing summary exists and no new messages were added, keep/use existing summary
      if (existingSummary && hasSummaryContent && recordedMessageCount !== undefined && recordedMessageCount === activeMessages.length) {
        // Clean up any extraneous duplicate summaries in background
        if (duplicateIdsToDelete.length > 0) {
          duplicateIdsToDelete.forEach((dupId) => {
            deleteDoc(doc(db, 'users', user.uid, 'summaries', dupId)).catch(() => {});
          });
        }

        // Ensure conversation has synced summaryId & message count metadata if needed
        if (
          activeConv &&
          (!activeConv.summaryId || activeConv.summaryId !== existingSummary.id || activeConv.lastSummarizedMessageCount !== activeMessages.length)
        ) {
          await setDoc(
            doc(db, 'users', user.uid, 'conversations', currentConversationId),
            {
              summaryId: existingSummary.id,
              summary: existingSummary.summaryText,
              lastSummarizedMessageCount: activeMessages.length,
              updatedAt: Date.now(),
            },
            { merge: true }
          ).catch(() => {});
        }

        setSummaryNotification(`Session summary is already up to date for this conversation.`);
        setTimeout(() => setSummaryNotification(null), 5000);

        if (onSummaryGenerated) {
          onSummaryGenerated(existingSummary);
        }
        setIsSummarizing(false);
        return;
      }

      // 3. If new messages have been added or no summary exists yet, regenerate/update the single existing summary
      const summaryResult = await generateSummary({
        sourceType: 'conversation',
        sourceId: currentConversationId,
        conversationId: currentConversationId,
        title: activeConv?.title || 'Journal Session',
        messages: activeMessages,
      });

      // Target document ID: reuse existing ID if available, otherwise deterministic ID
      const summaryId = existingSummary?.id || activeConv?.summaryId || `summary_conv_${currentConversationId}`;

      const fullSummary: SessionSummary = {
        id: summaryId,
        userId: user.uid,
        sourceType: 'conversation',
        sourceId: currentConversationId,
        title: summaryResult.title || activeConv?.title || 'Session Summary',
        summaryText: summaryResult.summaryText || '',
        keyThemes: summaryResult.keyThemes || [],
        actionableTakeaways: summaryResult.actionableTakeaways || [],
        moodTrend: summaryResult.moodTrend || moodContext || 'Reflective',
        createdAt: existingSummary?.createdAt || Date.now(),
        updatedAt: Date.now(),
        messageCount: activeMessages.length,
      };

      // Save/update the single summary document in users/{uid}/summaries/{summaryId}
      await setDoc(doc(db, 'users', user.uid, 'summaries', summaryId), sanitizeForFirestore(fullSummary));

      // Clean up any duplicate records
      if (duplicateIdsToDelete.length > 0) {
        for (const dupId of duplicateIdsToDelete) {
          if (dupId !== summaryId) {
            await deleteDoc(doc(db, 'users', user.uid, 'summaries', dupId)).catch(() => {});
          }
        }
      }

      // Update conversation with summary snippet, summaryId, lastSummarizedMessageCount, and timestamp
      await setDoc(
        doc(db, 'users', user.uid, 'conversations', currentConversationId),
        {
          summary: summaryResult.summaryText,
          summaryId: summaryId,
          lastSummarizedMessageCount: activeMessages.length,
          lastSummarizedAt: Date.now(),
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      setSummaryNotification(
        existingSummary 
          ? `Updated session summary: "${fullSummary.title}" (${activeMessages.length} messages)`
          : `Saved session summary: "${fullSummary.title}"`
      );
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
              const isEditingThis = editingSessionId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    if (!isEditingThis) {
                      handleSelectConversation(conv.id);
                    }
                  }}
                  className={`w-full text-left p-3 rounded-xl transition-all border group relative ${
                    isSelected
                      ? 'bg-slate-800/90 border-slate-700 shadow-md text-white'
                      : 'border-transparent hover:bg-slate-800/40 text-slate-400 hover:text-slate-200 cursor-pointer'
                  }`}
                >
                  {isEditingThis ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSaveSessionTitle(conv.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={sessionTitleInput}
                        onChange={(e) => setSessionTitleInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditingSessionId(null);
                        }}
                        autoFocus
                        maxLength={60}
                        placeholder="Session name"
                        className="w-full px-2 py-1 text-xs bg-slate-900 border border-blue-500 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <button
                        type="submit"
                        disabled={isRenaming || !sessionTitleInput.trim()}
                        className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors shrink-0"
                        title="Save session name"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingSessionId(null)}
                        className="p-1 text-slate-400 hover:bg-slate-700 rounded transition-colors shrink-0"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-1">
                      <span className={`font-medium text-xs truncate max-w-[130px] ${isSelected ? 'text-blue-300' : 'group-hover:text-blue-400'}`}>
                        {conv.title || 'Untitled Session'}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(conv.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        <button
                          id={`btn-rename-conv-${conv.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRenaming(conv.id, conv.title || 'Untitled Session');
                          }}
                          className="p-1 rounded-md text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 opacity-60 group-hover:opacity-100 transition-colors"
                          title="Rename session"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          id={`btn-delete-conv-${conv.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isGenerating && !isDeleting) {
                              setConversationToDelete(conv);
                            }
                          }}
                          disabled={isGenerating || isDeleting}
                          className={`p-1 rounded-md transition-colors ${
                            isGenerating || isDeleting
                              ? 'opacity-20 cursor-not-allowed text-slate-600'
                              : 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-60 group-hover:opacity-100'
                          }`}
                          title={isGenerating ? 'Cannot delete while generating' : 'Delete session'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Security verification stamp */}
        <div className="p-3 border-t border-slate-700/50 bg-slate-900/30 text-[11px] text-slate-400 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Private</span>
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
                {currentConv && editingSessionId === currentConv.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSaveSessionTitle(currentConv.id);
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={sessionTitleInput}
                      onChange={(e) => setSessionTitleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingSessionId(null);
                      }}
                      autoFocus
                      maxLength={60}
                      placeholder="Session name"
                      className="px-2.5 py-1 text-xs bg-slate-800 border border-blue-500 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-44 sm:w-64"
                    />
                    <button
                      type="submit"
                      disabled={isRenaming || !sessionTitleInput.trim()}
                      className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors shrink-0"
                      title="Save session name"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSessionId(null)}
                      className="p-1 text-slate-400 hover:bg-slate-800 rounded-md transition-colors shrink-0"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      {currentConv?.title || 'Private Reflection Session'}
                    </h3>
                    {currentConv && (
                      <button
                        type="button"
                        onClick={() => startRenaming(currentConv.id, currentConv.title || 'Private Reflection Session')}
                        className="p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-md transition-colors"
                        title="Rename session"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span>Multi-turn Gemini Flash</span>
                <span>•</span>
                <span>Context preserved</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* New Session on mobile */}
            <button
              id="btn-new-conversation-mobile"
              onClick={handleNewConversation}
              className="md:hidden flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors shadow-xs"
              title="Start a new reflection session"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>

            {/* Automatic Summarize Action */}
            <button
              id="btn-summarize-session"
              onClick={handleSummarizeSession}
              disabled={isSummarizing || messages.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700/80 text-slate-200 rounded-xl border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              title={
                currentConv?.summary && currentConv.lastSummarizedMessageCount === messages.length
                  ? "Session summary is up to date (click to view/keep)"
                  : "Automatically extract summary, key themes, and takeaways using Gemini"
              }
            >
              {isSummarizing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span className="hidden sm:inline">
                {isSummarizing 
                  ? 'Summarizing...' 
                  : currentConv?.summary && currentConv.lastSummarizedMessageCount === messages.length
                    ? 'Summarized'
                    : 'Summarize'}
              </span>
            </button>

            {/* Delete Active Session Action */}
            {currentConv && (
              <button
                id="btn-delete-active-session"
                onClick={() => {
                  if (!isGenerating && !isDeleting) {
                    setConversationToDelete(currentConv);
                  }
                }}
                disabled={isGenerating || isDeleting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-rose-950/40 hover:text-rose-300 hover:border-rose-800/60 text-slate-400 rounded-xl border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                title={isGenerating ? 'Cannot delete while generating' : 'Delete this conversation session'}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
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
                    <div className="max-w-[75%] bg-blue-600 text-white p-4 rounded-2xl rounded-tr-none shadow-lg shadow-blue-600/10 group relative">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      <div className="flex items-center justify-between gap-3 mt-2.5 pt-1.5 border-t border-blue-500/30 text-[10px] text-blue-200">
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <button
                          id={`btn-copy-msg-${msg.id}`}
                          type="button"
                          onClick={() => handleCopyMessageText(msg.id, msg.text)}
                          className="inline-flex items-center gap-1 text-[10px] text-blue-200 hover:text-white hover:bg-blue-700/60 px-1.5 py-0.5 rounded transition-colors"
                          title="Copy sent text"
                        >
                          {copiedMessageId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-300" />
                              <span className="text-emerald-200 font-medium">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
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
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2.5 font-mono pt-2 border-t border-slate-800">
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <div className="flex items-center gap-1.5 font-sans">
                          <button
                            id={`btn-copy-msg-${msg.id}`}
                            type="button"
                            onClick={() => handleCopyMessageText(msg.id, msg.text)}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-2 py-0.5 rounded-md transition-colors"
                            title="Copy reflection"
                          >
                            {copiedMessageId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400 font-medium">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                          <button
                            id={`btn-regenerate-msg-${msg.id}`}
                            type="button"
                            onClick={() => handleRegenerateResponse(msg)}
                            disabled={isGenerating}
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-colors ${
                              isGenerating
                                ? 'text-slate-600 cursor-not-allowed'
                                : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800'
                            }`}
                            title={isGenerating ? 'Gemini is reflecting...' : 'Regenerate response'}
                          >
                            <RotateCcw className={`w-3 h-3 ${regeneratingMsgId === msg.id ? 'animate-spin text-cyan-400' : ''}`} />
                            <span>{regeneratingMsgId === msg.id ? 'Regenerating...' : 'Regenerate'}</span>
                          </button>
                        </div>
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
              <span>Private & Account-Isolated. Accessible only to your authenticated account.</span>
            </p>
          </div>
        </footer>
      </main>

      {/* Delete Conversation Confirmation Modal */}
      {conversationToDelete && (
        <div
          id="modal-delete-conversation-backdrop"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isDeleting) setConversationToDelete(null);
          }}
        >
          <div
            id="modal-delete-conversation"
            className="bg-[#1E293B] border border-slate-700/90 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Delete “{conversationToDelete.title || 'Untitled Session'}”?
                  </h3>
                </div>
              </div>
              <button
                id="btn-close-delete-modal"
                onClick={() => {
                  if (!isDeleting) setConversationToDelete(null);
                }}
                disabled={isDeleting}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-sm text-slate-300">
              <p className="leading-relaxed">
                This will permanently delete this conversation and its messages. Journal Entries and Saved Summaries will not be affected.
              </p>
            </div>

            {isGenerating && (
              <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Gemini is currently generating a response. Please wait for generation to finish before deleting.</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                id="btn-cancel-delete-conv"
                type="button"
                onClick={() => {
                  if (!isDeleting) setConversationToDelete(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-conv"
                type="button"
                onClick={() => handleDeleteConversation(conversationToDelete)}
                disabled={isDeleting || isGenerating}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors shadow-lg shadow-rose-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting Session...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Session</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
