export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  content: string;
  mood?: string;
  tags?: string[];
  summary?: string;
  createdAt: number; // epoch ms
  updatedAt: number;
  wordCount?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: number;
  tokensEstimate?: number;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  summary?: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview?: string;
}

export interface SessionSummary {
  id: string;
  userId: string;
  sourceType: 'conversation' | 'journal';
  sourceId: string;
  title: string;
  summaryText: string;
  keyThemes: string[];
  actionableTakeaways: string[];
  moodTrend?: string;
  createdAt: number;
}

export interface ReflectionInsights {
  id: string;
  userId: string;
  recurringThemes: { theme: string; explanation: string }[];
  frequentlyMentionedGoals: { goal: string; statusOrContext: string }[];
  unresolvedConcerns: { concern: string; suggestedPerspective: string }[];
  notableChanges: { observation: string; impact: string }[];
  reflectionQuestions: string[];
  entryCountAnalyzed: number;
  generatedAt: number;
}

export interface SecurityCheckItem {
  id: string;
  category: 'Auth' | 'Firestore' | 'Secrets' | 'Prompt Injection' | 'Data Isolation' | 'Error Handling';
  title: string;
  description: string;
  status: 'passed' | 'enforced' | 'active';
  technicalDetails: string;
}
