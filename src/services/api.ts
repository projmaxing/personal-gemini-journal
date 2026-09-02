import { getAuthToken } from '../firebase/config';
import { ChatMessage, SessionSummary, ReflectionInsights, JournalEntry, Conversation } from '../types';

/**
 * Helper to fetch with authenticated Firebase ID token with 30s timeout
 */
async function fetchWithAuth(url: string, options: RequestInit = {}, timeoutMs = 30000) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('User is not authenticated. Operation denied.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  let signal = options.signal;
  if (!signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    signal = AbortSignal.timeout(timeoutMs);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      signal,
    });
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error('The request timed out while waiting for a response. Please try again.');
    }
    throw err;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with status ${response.status}`);
  }

  return response.json();
}

/**
 * Multi-turn Gemini journaling assistant endpoint
 */
export async function sendChatMessage(
  currentPrompt: string,
  messages: ChatMessage[],
  moodContext?: string
): Promise<{ text: string; timestamp: number }> {
  return fetchWithAuth('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      currentPrompt,
      messages: messages.map(m => ({ role: m.role, text: m.text })),
      moodContext,
    }),
  });
}

/**
 * Automatic summarization endpoint (Secured: references Firestore doc directly)
 */
export async function generateSummary(params: {
  sourceType: 'conversation' | 'journal';
  sourceId: string;
  journalEntryId?: string;
  conversationId?: string;
  title?: string;
  content?: string;
  messages?: ChatMessage[];
}): Promise<SessionSummary> {
  return fetchWithAuth('/api/summarize', {
    method: 'POST',
    body: JSON.stringify({
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      journalEntryId: params.sourceType === 'journal' ? (params.journalEntryId || params.sourceId) : undefined,
      conversationId: params.sourceType === 'conversation' ? (params.conversationId || params.sourceId) : undefined,
      title: params.title,
    }),
  });
}

/**
 * Original Feature: Reflection Insights
 * Server fetches verified user's authorized records from Firestore directly.
 */
export async function fetchReflectionInsights(
  _entries?: JournalEntry[],
  _conversations?: Conversation[]
): Promise<ReflectionInsights> {
  return fetchWithAuth('/api/reflection-insights', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Fetch server security posture
 */
export async function fetchSecurityStatus() {
  const res = await fetch('/api/security-status');
  return res.json();
}
