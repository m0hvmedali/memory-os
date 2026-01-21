import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
// @ts-ignore
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0/dist/transformers.min.js';

// Configure transformers.js to not load from local path, but from CDN
env.allowLocalModels = false;
env.useBrowserCache = true;

import {
  Shield,
  Calendar,
  FileText,
  User,
  Folder,
  MessageCircle,
  Brain,
  ChevronDown,
  ChevronUp,
  Search,
  Zap,
  Heart,
  Users,
  Sparkles,
  Copy,
  Check,
  Download,
  Loader2,
  HardDrive,
  Cpu,
  Database,
  RefreshCw,
  Cloud,
  CloudOff,
  Settings,
  Save,
  Trash2,
  Terminal,
  HelpCircle,
  ExternalLink,
  AlertTriangle,
  LogOut,
  UploadCloud,
  DownloadCloud,
  File,
  History,
  Target,
  GitBranch,
  BookOpen,
  X,
  AlertCircle,
  Info,
  CheckCircle,
  BarChart2,
  PieChart,
  Activity,
  Clock,
  Hash,
  AlignLeft,
  Smile,
  TrendingUp,
  Filter,
  PenTool,
  Book,
  Sun,
  Moon,
  Coffee,
  Frown,
  Meh,
  Menu,
  Ghost,
  Eye,
  MessageSquare,
  Globe,
  MicOff,
  Ear,
  Type
} from "lucide-react";

// --- Types ---

interface MemoryItem {
  id: string;
  sourceFile: string;
  // content can be a Person object, an Emotion object, a Conversation array, a Journal Entry, or a simple Text object
  content: any; 
  timestamp: number;
  type?: 'person' | 'emotion' | 'conversation' | 'text' | 'journal' | 'unknown';
  embedding?: number[]; // Added for semantic search
}

interface IntelligenceDossier {
    subject: string;
    content: any;
    sourceFile: string;
    relevanceScore: number;
    type: string;
}

interface SupabaseConfig {
    url: string;
    key: string;
    enabled: boolean;
}

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message: string;
}

interface AnalysisStats {
    totalMessages: number;
    wordCount: number;
    charCount: number;
    avgLength: number;
    longestMessage: { text: string; sender: string; length: number };
    topSenders: { name: string; count: number }[];
    topWords: { word: string; count: number }[];
    topEmojis: { char: string; count: number }[];
    activityByHour: number[]; // 0-23
    activityByDay: number[]; // 0-6 (Sun-Sat)
    sentiment: { positive: number; negative: number; neutral: number };
    mediaCount: number;
}

interface ChatMessage {
    role: 'user' | 'ai';
    content: string;
    timestamp: number;
    isThinking?: boolean;
    groundingMetadata?: any;
    usedContext?: string[]; // Snippets used for the answer
}

interface VectorItem {
    id: string;
    text: string;
    embedding: number[];
    meta: any;
}

// --- Constants ---
const USER_ALIASES = new Set(['mohamed', 'mohammed', 'me', 'user', 'ana', 'أنا', 'انا', 'محمد']);

const STOPWORDS = new Set([
    // Arabic
    'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'كان', 'كانت', 'ان', 'أن', 'لا', 'ما', 'لو', 'يا', 'انا', 'أنا', 'انت', 'أنت', 'هو', 'هي', 'هم', 'احنا', 'نحن', 'بس', 'مش', 'ده', 'دي', 'عشان', 'اللي', 'و', 'أو', 'ثم', 'لكن', 'بل', 'ب', 'ل', 'ك', 'ال', 'هل', 'كيف', 'اين', 'متى', 'كم', 'لماذا', 'ايه', 'ليه', 'فين', 'امتى', 'ازاي', 'مين',
    // English
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'is', 'are', 'was', 'were', 'am'
]);

const POSITIVE_WORDS = new Set(['حب', 'احب', 'جميل', 'حلو', 'رائع', 'ممتاز', 'شكرا', 'مبروك', 'سعيد', 'فرح', 'خير', 'تمام', 'اكيد', 'طبعا', 'موافق', 'love', 'good', 'great', 'happy', 'thanks', 'cool', 'nice', 'awesome']);
const NEGATIVE_WORDS = new Set(['كره', 'زعل', 'حزن', 'سيء', 'خرا', 'زفت', 'لا', 'مش', 'رفض', 'غضب', 'تعب', 'ملل', 'قرف', 'hate', 'bad', 'sad', 'angry', 'no', 'not', 'worst', 'boring', 'tired']);

const MOODS = ['😐', '🙂', '😃', '😔', '😠', '😨', '😴', '🥰', '😎', '🧠'];

const QUESTION_CATEGORIES = [
  {
    id: 'personality',
    label: 'Personality Analysis',
    icon: User,
    color: 'text-indigo-400',
    questions: [
      "What are the top 5 traits in my communication style?",
      "How has my personality changed over time?",
      "Who am I most similar to from my past self?",
      "When was I my most authentic self?",
      "When was I wearing a social mask?"
    ]
  },
  {
    id: 'emotions',
    label: 'Emotional Map',
    icon: Heart,
    color: 'text-rose-400',
    questions: [
      "What are my most recurring emotions?",
      "Who triggers my negative emotions?",
      "When was I writing while stressed vs calm?",
      "Am I using words to escape specific feelings?",
      "What did I need to hear but no one said?"
    ]
  },
  {
    id: 'relationships',
    label: 'Relationships Dynamics',
    icon: Users,
    color: 'text-emerald-400',
    questions: [
      "Who influenced my language the most?",
      "Which relationships seem unbalanced?",
      "When was I giving more than receiving?",
      "Is there a pattern to how my relationships end?",
      "Who brings out the worst version of me?"
    ]
  },
  {
    id: 'mind',
    label: 'Mind & Logic',
    icon: Brain,
    color: 'text-amber-400',
    questions: [
      "What thoughts loop in my head?",
      "Am I more analytical or emotional?",
      "When were my decisions driven by fear?",
      "When did I speak with true confidence?",
      "What is a question I never asked myself?"
    ]
  },
  {
    id: 'shadow',
    label: 'The Shadow (Dark Side)',
    icon: Ghost, 
    color: 'text-zinc-500',
    questions: [
      "How would a stranger judge me based on this?",
      "What lie do I keep telling myself?",
      "What am I ignoring?",
      "Was I loving or just needy?",
      "What is the 'Unnoticed Message' I missed?"
    ]
  }
];

// --- IndexedDB Layer ---
const DB_NAME = "MemoryOS_DB";
const STORE_NAME = "memories"; 

const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 4); 
  request.onupgradeneeded = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// --- Storage Abstraction Layer ---

// Helper to get Supabase Client
const getSupabase = (config: SupabaseConfig): SupabaseClient | null => {
    if (!config.enabled || !config.url || !config.key) return null;
    try {
        return createClient(config.url, config.key);
    } catch (e) {
        console.error("Supabase init failed", e);
        return null;
    }
};

async function saveMemories(items: MemoryItem[], config?: SupabaseConfig) {
  const sb = config ? getSupabase(config) : null;

  if (sb) {
      // Cloud Mode
      // Map to snake_case for DB
      const rows = items.map(item => ({
          id: item.id,
          source_file: item.sourceFile,
          content: item.content,
          timestamp: item.timestamp,
          type: item.type || 'unknown'
      }));
      
      const { error } = await sb.from('memories').upsert(rows);
      if (error) {
          // Enhance error message for common Supabase issues
          if (error.message.includes('fetch')) throw new Error("Network Error: Could not connect to Supabase.");
          if (error.code === '42501' || error.message.includes('JWT')) throw new Error("Permission Denied: Check API Key or Table Policies.");
          throw new Error("Cloud Sync Failed: " + error.message);
      }
      return;
  } else {
      // Local Mode
      try {
        const db = await dbPromise;
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        items.forEach(item => store.put(item));
        return new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e: any) {
          throw new Error("Local Storage Failed: " + e.message);
      }
  }
}

async function getAllMemories(config?: SupabaseConfig): Promise<MemoryItem[]> {
  const sb = config ? getSupabase(config) : null;

  if (sb) {
      // Cloud Mode
      const { data, error } = await sb.from('memories').select('*');
      if (error) {
           if (error.message.includes('fetch')) throw new Error("Network Error: Could not reach cloud database.");
           if (error.code === 'PGRST116') throw new Error("Data Format Error: Unexpected response structure.");
           throw new Error("Fetch Failed: " + error.message);
      }
      // Map back to MemoryItem
      return (data || []).map((row: any) => ({
          id: row.id,
          sourceFile: row.source_file,
          content: row.content,
          timestamp: row.timestamp,
          type: row.type
      }));
  } else {
      // Local Mode
      try {
          const db = await dbPromise;
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
      } catch (e: any) {
          throw new Error("Local Read Failed: " + e.message);
      }
  }
}

async function clearMemories(config?: SupabaseConfig) {
    const sb = config ? getSupabase(config) : null;

    if (sb) {
        // Cloud Mode - Delete all
        const { error } = await sb.from('memories').delete().neq('id', '0'); // Hack to delete all
        if (error) throw new Error("Cloud Wipe Failed: " + error.message);
    } else {
        // Local Mode
        const db = await dbPromise;
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        return new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
    }
}

// --- Parsing Logic ---

function parseWhatsAppLogs(text: string): any[] | null {
    // Regex for: "14/08/24, 5:56 pm - Sender Name: Message Content"
    const regex = /^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),\s*(\d{1,2}:\d{2}\s?(?:[aApP][mM])?)\s*-\s*([^:]+):\s*(.+)/;
    
    const lines = text.split('\n');
    const messages: any[] = [];
    let currentMessage: any = null;
    let matchCount = 0;

    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            matchCount++;
            if (currentMessage) messages.push(currentMessage);
            currentMessage = {
                date: match[1],
                time: match[2],
                sender: match[3].trim(),
                message: match[4].trim(),
                original: line
            };
        } else {
            if (currentMessage) currentMessage.message += "\n" + line;
        }
    }
    
    if (currentMessage) messages.push(currentMessage);
    if (matchCount > 0 && messages.length > 0) return messages;
    return null;
}

function parseBracketLogs(text: string): any[] | null {
    // Regex for: [Date] - [Sender]: [Message]
    // Handles cases like: [التاريخ والوقت غير متوفر] - [user]: [Message content...]
    const regex = /^\[(.*?)\]\s*-\s*\[(.*?)\]:\s*(.*)/;
    
    const lines = text.split('\n');
    const messages: any[] = [];
    let currentMessage: any = null;
    let matchCount = 0;

    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            matchCount++;
            if (currentMessage) messages.push(currentMessage);
            
            let content = match[3].trim();
            // Remove starting bracket if present (common in this format)
            if (content.startsWith('[')) {
                content = content.substring(1);
            }

            currentMessage = {
                date: match[1].trim(),
                sender: match[2].trim(),
                message: content,
                original: line
            };
        } else {
            if (currentMessage) {
                currentMessage.message += "\n" + line;
            }
        }
    }
    
    if (currentMessage) messages.push(currentMessage);

    // Post-processing: Remove trailing ']' if the format wrapped the message in brackets
    if (matchCount > 0) {
        messages.forEach(msg => {
            const trimmed = msg.message.trim();
            if (trimmed.endsWith(']')) {
                msg.message = trimmed.substring(0, trimmed.length - 1);
            }
        });
        return messages;
    }
    return null;
}

// Process text content into MemoryItems
function processFileContent(fileName: string, text: string): MemoryItem[] {
      const itemsToAdd: MemoryItem[] = [];
      const idBase = `${fileName}_${Date.now()}`;

      // STRICT JSON CHECKING
      if (fileName.endsWith('.json')) {
          try {
              const json = JSON.parse(text);
              const isChatLog = Array.isArray(json) && json.length > 0 && (json[0].sender || json[0].message);
              
              if (isChatLog) {
                  itemsToAdd.push({
                      id: idBase,
                      sourceFile: fileName,
                      content: json,
                      timestamp: Date.now(),
                      type: 'conversation'
                  });
              } else if (Array.isArray(json)) {
                  json.forEach((item, idx) => {
                       itemsToAdd.push({
                          id: `${idBase}_${idx}`,
                          sourceFile: fileName,
                          content: item,
                          timestamp: Date.now(),
                          type: determineType(item)
                       });
                  });
              } else {
                  itemsToAdd.push({
                      id: idBase,
                      sourceFile: fileName,
                      content: json,
                      timestamp: Date.now(),
                      type: determineType(json)
                  });
              }
              return itemsToAdd;
          } catch (e) {
              // Ensure we don't treat broken JSON as text silently
              throw new Error(`Invalid JSON in ${fileName}: ${(e as Error).message}`);
          }
      } 
      
      // TEXT / CHAT LOGS
      try {
          // Try different parsers
          const parsedBracketChat = parseBracketLogs(text);
          const parsedWhatsApp = !parsedBracketChat ? parseWhatsAppLogs(text) : null;
          
          if (parsedBracketChat) {
               itemsToAdd.push({
                  id: idBase,
                  sourceFile: fileName,
                  content: parsedBracketChat,
                  timestamp: Date.now(),
                  type: 'conversation'
              });
          } else if (parsedWhatsApp) {
              itemsToAdd.push({
                  id: idBase,
                  sourceFile: fileName,
                  content: parsedWhatsApp,
                  timestamp: Date.now(),
                  type: 'conversation'
              });
          } else {
              // Fallback to plain text only if explicitly text or unknown extension
              itemsToAdd.push({
                  id: idBase,
                  sourceFile: fileName,
                  content: { text: text },
                  timestamp: Date.now(),
                  type: 'text'
              });
          }
      } catch (err) {
          throw new Error(`Failed to process ${fileName}: ${(err as Error).message}`);
      }
      return itemsToAdd;
}

function determineType(obj: any): 'person' | 'emotion' | 'conversation' | 'text' | 'journal' | 'unknown' {
    if (obj.relationship_to_user || obj.background || obj.traits || (obj.name && obj.age)) return 'person';
    if (obj.primary_emotion || obj.english_name || (obj.family && obj.type)) return 'emotion';
    if (obj.messages || obj.sender) return 'conversation';
    if (obj.entry && obj.mood) return 'journal';
    return 'unknown';
}

// --- Analysis Logic ---

const analyzeMessages = (messages: any[]): AnalysisStats => {
    let wordCount = 0;
    let charCount = 0;
    let mediaCount = 0;
    let longest = { text: '', sender: '', length: 0 };
    const senderCounts: Record<string, number> = {};
    const wordFreq: Record<string, number> = {};
    const emojiFreq: Record<string, number> = {};
    const activityByHour = new Array(24).fill(0);
    const activityByDay = new Array(7).fill(0); // 0 = Sunday
    let positive = 0;
    let negative = 0;
    let neutral = 0;

    // Emoji Regex
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

    messages.forEach(msg => {
        const text = msg.message || msg.text || '';
        const sender = msg.sender || 'Unknown';
        
        // Sender stats
        senderCounts[sender] = (senderCounts[sender] || 0) + 1;

        // Basic Text Stats
        if (text.includes('<Media omitted>') || text.includes('image omitted') || text.includes('video omitted')) {
            mediaCount++;
            return;
        }

        const len = text.length;
        charCount += len;
        if (len > longest.length) {
            longest = { text: text.substring(0, 100) + (len > 100 ? '...' : ''), sender, length: len };
        }

        // Tokenization
        const words = text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, "").split(/\s+/);
        words.forEach((w: string) => {
            if (w && !STOPWORDS.has(w) && !Number(w)) {
                wordFreq[w] = (wordFreq[w] || 0) + 1;
                wordCount++;
            }
            if (POSITIVE_WORDS.has(w)) positive++;
            else if (NEGATIVE_WORDS.has(w)) negative++;
            else neutral++;
        });

        // Emojis
        const emojis = text.match(emojiRegex);
        if (emojis) {
            emojis.forEach((e: string) => {
                emojiFreq[e] = (emojiFreq[e] || 0) + 1;
            });
        }

        // Time Analysis
        // Try to parse date/time. Formats vary wildly.
        // Assuming "14/08/24, 5:56 pm" or standard ISO
        try {
            let dateObj;
            if (msg.date && msg.time) {
                 // Hacky parser for DD/MM/YY
                 const [day, month, year] = msg.date.split(/[\/.-]/).map(Number);
                 let timeStr = msg.time.toLowerCase();
                 let [hours, minutes] = timeStr.replace(/[ap]m/, '').split(':').map(Number);
                 if (timeStr.includes('pm') && hours < 12) hours += 12;
                 if (timeStr.includes('am') && hours === 12) hours = 0;
                 
                 // Reconstruct roughly
                 const fullYear = year < 100 ? 2000 + year : year;
                 dateObj = new Date(fullYear, month - 1, day, hours, minutes);
            } else if (msg.timestamp) {
                dateObj = new Date(msg.timestamp);
            }

            if (dateObj && !isNaN(dateObj.getTime())) {
                activityByHour[dateObj.getHours()]++;
                activityByDay[dateObj.getDay()]++;
            }
        } catch (e) {
            // Ignore time parse errors
        }
    });

    // Sorting and Formatting
    const topSenders = Object.entries(senderCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

    const topWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([word, count]) => ({ word, count }));
    
    const topEmojis = Object.entries(emojiFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([char, count]) => ({ char, count }));

    return {
        totalMessages: messages.length,
        wordCount,
        charCount,
        avgLength: messages.length ? Math.round(charCount / messages.length) : 0,
        longestMessage: longest,
        topSenders,
        topWords,
        topEmojis,
        activityByHour,
        activityByDay,
        sentiment: { positive, negative, neutral },
        mediaCount
    };
};

// --- Vector Logic (Transformers.js) ---

// Cosine Similarity
function cosineSimilarity(a: number[], b: number[]) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Global pipeline singleton to avoid reloading
let embeddingPipeline: any = null;

const loadEmbeddingModel = async (onProgress?: (progress: number) => void) => {
    if (embeddingPipeline) return embeddingPipeline;
    
    console.log("Loading Xenova/all-MiniLM-L6-v2...");
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: (data: any) => {
            if (data.status === 'progress' && onProgress) {
                onProgress(data.progress);
            }
        }
    });
    return embeddingPipeline;
};

// --- Analytics Components ---

const SimpleBarChart = ({ data, labels, color = "bg-indigo-500", height = 100 }: { data: number[], labels: string[], color?: string, height?: number }) => {
    const max = Math.max(...data, 1);
    return (
        <div className="flex items-end justify-between gap-1 w-full" style={{ height: `${height}px` }}>
            {data.map((val, i) => (
                <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div 
                        className={`w-full rounded-t-sm opacity-80 group-hover:opacity-100 transition-all ${color}`} 
                        style={{ height: `${(val / max) * 100}%` }}
                    ></div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-black text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 border border-zinc-800">
                        {labels[i]}: {val}
                    </div>
                </div>
            ))}
        </div>
    );
};

const KeywordBubble = ({ word, count, max }: { word: string, count: number, max: number }) => {
    const size = Math.max(0.8, Math.min(2.5, 0.8 + (count / max) * 2));
    const opacity = Math.max(0.4, Math.min(1, 0.4 + (count / max)));
    
    return (
        <span 
            className="inline-block m-1 px-2 py-1 rounded-lg bg-zinc-800/50 hover:bg-indigo-900/50 hover:text-white transition-colors cursor-default"
            style={{ fontSize: `${size}rem`, opacity }}
        >
            {word}
            <span className="ml-1 text-[0.6em] opacity-50">{count}</span>
        </span>
    );
};

interface AnalyticsProps {
    memories: MemoryItem[];
    vectorStore: VectorItem[];
    onInitVectors: () => void;
    isLoadingVectors: boolean;
}

const AnalyticsDashboard = ({ memories, vectorStore, onInitVectors, isLoadingVectors }: AnalyticsProps) => {
    const [selectedId, setSelectedId] = useState<string>("all");
    const [semanticQuery, setSemanticQuery] = useState("");
    const [searchMode, setSearchMode] = useState<'semantic' | 'exact'>('exact'); // Default to Exact for speed
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    
    // Filter only conversations
    const conversations = useMemo(() => {
        return memories.filter(m => m.type === 'conversation' || (Array.isArray(m.content) && m.content[0]?.sender));
    }, [memories]);

    // Mode: Exact Search (String Matching)
    const performExactSearch = () => {
        if (!semanticQuery.trim()) return;
        setIsSearching(true);
        const term = semanticQuery.toLowerCase();
        const results: any[] = [];

        conversations.forEach(c => {
            const msgs = Array.isArray(c.content) ? c.content : c.content?.messages || [];
            msgs.forEach((m: any) => {
                const text = m.message || m.text || '';
                const sender = m.sender || 'Unknown';
                // Check if text or sender contains the term
                if (text.toLowerCase().includes(term) || sender.toLowerCase().includes(term)) {
                    results.push({
                        message: text,
                        sender: sender,
                        timestamp: m.date || c.timestamp // Try to get specific message date or fallback to file date
                    });
                }
            });
        });

        // Limit results to avoid UI lag on broad queries
        setSearchResults(results.slice(0, 100));
        setIsSearching(false);
    };

    // Mode: Semantic Search (Vectors)
    const performSemanticSearch = async () => {
        if (!semanticQuery.trim() || vectorStore.length === 0) return;
        setIsSearching(true);
        try {
            const pipe = await loadEmbeddingModel();
            const output = await pipe(semanticQuery, { pooling: 'mean', normalize: true });
            const queryEmbedding = Array.from(output.data) as number[];

            // Score and filter
            const scored = vectorStore.map(vec => ({
                ...vec,
                score: cosineSimilarity(queryEmbedding, vec.embedding)
            }));
            
            // Get top 50 chunks
            const topK = scored.sort((a, b) => b.score - a.score).slice(0, 50);
            
            const relevantMessages = topK.map(k => ({
                message: k.text,
                sender: k.meta.sender || 'Unknown', 
                timestamp: k.meta.timestamp
            }));
            
            setSearchResults(relevantMessages);
        } catch (e) {
            console.error("Semantic search failed", e);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSearch = () => {
        setSearchResults([]);
        if (searchMode === 'semantic') {
            performSemanticSearch();
        } else {
            performExactSearch();
        }
    };

    // Compute Stats (Based on search results OR selected conversation)
    const stats = useMemo(() => {
        let msgsToAnalyze: any[] = [];
        
        if (searchResults.length > 0) {
            // If search yielded results, analyze them
            msgsToAnalyze = searchResults;
        } else if (selectedId === "all") {
            conversations.forEach(c => {
                const content = Array.isArray(c.content) ? c.content : c.content?.messages || [];
                msgsToAnalyze = [...msgsToAnalyze, ...content];
            });
        } else {
            const target = conversations.find(c => c.id === selectedId);
            if (target) {
                 msgsToAnalyze = Array.isArray(target.content) ? target.content : target.content?.messages || [];
            }
        }
        return analyzeMessages(msgsToAnalyze);
    }, [conversations, selectedId, searchResults]);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({length: 24}, (_, i) => i.toString());

    return (
        <div className="p-4 space-y-6 pb-24 overflow-y-auto h-full custom-scrollbar">
             {/* Header */}
             <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <BarChart2 className="w-5 h-5 text-indigo-400" />
                        Deep Analytics
                    </h2>
                    
                    {searchResults.length === 0 && (
                        <select 
                            value={selectedId}
                            onChange={(e) => setSelectedId(e.target.value)}
                            className="bg-zinc-800 border-none text-xs rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 max-w-[150px]"
                        >
                            <option value="all">All Conversations</option>
                            {conversations.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.sourceFile.replace('.json', '').replace('whatsapp_', '')}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Filter / Search Bar */}
                <div className="bg-zinc-900/50 p-2 rounded-xl border border-zinc-800 flex flex-col gap-2">
                    
                    {/* Search Mode Toggles */}
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setSearchMode('exact')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${
                                searchMode === 'exact' 
                                ? 'bg-zinc-800 text-white shadow-sm' 
                                : 'text-zinc-500 hover:bg-zinc-800/50'
                            }`}
                        >
                            <Type className="w-3.5 h-3.5" /> Classic Search
                        </button>
                        
                        {vectorStore.length > 0 ? (
                            <button 
                                onClick={() => setSearchMode('semantic')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${
                                    searchMode === 'semantic' 
                                    ? 'bg-indigo-600/20 text-indigo-400 shadow-sm border border-indigo-500/30' 
                                    : 'text-zinc-500 hover:bg-zinc-800/50'
                                }`}
                            >
                                <Zap className="w-3.5 h-3.5" /> AI Search
                            </button>
                        ) : (
                            <button 
                                onClick={onInitVectors}
                                disabled={isLoadingVectors}
                                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium bg-zinc-800/30 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400 transition-colors"
                            >
                                {isLoadingVectors ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                Enable AI Search
                            </button>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                           <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                           <input 
                               type="text"
                               value={semanticQuery}
                               onChange={(e) => setSemanticQuery(e.target.value)}
                               onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                               placeholder={searchMode === 'semantic' ? "Search by meaning (e.g., 'feeling sad')..." : "Search exact words (e.g., 'Cairo', '2023')..."}
                               className="w-full bg-zinc-950 rounded-lg pl-9 pr-8 py-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none placeholder-zinc-600"
                           />
                           {searchResults.length > 0 && (
                               <button 
                                   onClick={() => { setSearchResults([]); setSemanticQuery(""); }}
                                   className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300"
                               >
                                   <X className="w-4 h-4" />
                               </button>
                           )}
                        </div>
                        <button 
                            onClick={handleSearch}
                            disabled={isSearching}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 rounded-lg transition-colors"
                        >
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {searchResults.length > 0 && (
                    <div className={`border px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
                        searchMode === 'semantic' 
                        ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' 
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                    }`}>
                        {searchMode === 'semantic' ? <Sparkles className="w-3 h-3" /> : <Search className="w-3 h-3" />}
                        Found {searchResults.length} matches for "{semanticQuery}"
                    </div>
                )}
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                    <div className="text-zinc-400 text-xs mb-1">Total Messages</div>
                    <div className="text-2xl font-bold text-white">{stats.totalMessages.toLocaleString()}</div>
                </div>
                <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                    <div className="text-zinc-400 text-xs mb-1">Words</div>
                    <div className="text-2xl font-bold text-indigo-400">{stats.wordCount.toLocaleString()}</div>
                </div>
                 <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                    <div className="text-zinc-400 text-xs mb-1">Avg Length</div>
                    <div className="text-2xl font-bold text-emerald-400">{stats.avgLength} <span className="text-xs font-normal text-zinc-500">chars</span></div>
                </div>
                 <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                    <div className="text-zinc-400 text-xs mb-1">Sentiment</div>
                    <div className="flex text-xs gap-2 mt-2">
                        <span className="text-green-400">+{stats.sentiment.positive}</span>
                        <span className="text-red-400">-{stats.sentiment.negative}</span>
                    </div>
                </div>
            </div>

            {/* Activity Charts */}
            <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
                    <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Hourly Activity
                    </h3>
                    <SimpleBarChart data={stats.activityByHour} labels={hours} color="bg-blue-500" height={120} />
                </div>
                <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
                    <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Weekly Activity
                    </h3>
                    <SimpleBarChart data={stats.activityByDay} labels={days} color="bg-purple-500" height={120} />
                </div>
            </div>

            {/* Word Cloud */}
            <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
                 <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                        <Hash className="w-4 h-4" /> Top Keywords
                </h3>
                <div className="flex flex-wrap justify-center">
                    {stats.topWords.map((w, i) => (
                        <KeywordBubble key={i} word={w.word} count={w.count} max={stats.topWords[0]?.count || 1} />
                    ))}
                </div>
            </div>

             {/* Top Senders */}
             <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
                 <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                        <Users className="w-4 h-4" /> Top Speakers
                </h3>
                <div className="space-y-2">
                    {stats.topSenders.slice(0, 5).map((s, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                            <span className="text-zinc-300">
                                {USER_ALIASES.has(s.name.toLowerCase()) ? `${s.name} (You)` : s.name}
                            </span>
                            <div className="flex items-center gap-2">
                                <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500" style={{ width: `${(s.count / stats.totalMessages) * 100}%` }}></div>
                                </div>
                                <span className="text-zinc-500 w-8 text-right">{Math.round((s.count / stats.totalMessages) * 100)}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {searchResults.length > 0 && (
                <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
                    <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" /> Matches Found
                    </h3>
                    <div className="space-y-3">
                        {searchResults.slice(0, 10).map((m, i) => (
                            <div key={i} className="bg-zinc-950 p-3 rounded-lg text-sm border border-zinc-800">
                                <div className="text-xs text-indigo-400 mb-1 font-semibold">{m.sender}</div>
                                <div className="text-zinc-300 leading-relaxed">
                                    {/* Highlighting simple matches manually for exact search */}
                                    {searchMode === 'exact' ? (
                                        <span>
                                            {m.message.split(new RegExp(`(${semanticQuery})`, 'gi')).map((part: string, i: number) => 
                                                part.toLowerCase() === semanticQuery.toLowerCase() 
                                                ? <span key={i} className="bg-yellow-500/20 text-yellow-200 px-0.5 rounded">{part}</span> 
                                                : part
                                            )}
                                        </span>
                                    ) : (
                                        m.message
                                    )}
                                </div>
                            </div>
                        ))}
                        {searchResults.length > 10 && (
                            <div className="text-center text-xs text-zinc-500 pt-2">
                                +{searchResults.length - 10} more matches...
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

interface NeuralAnalystProps {
    memories: MemoryItem[];
    vectorStore: VectorItem[];
    onInitVectors: () => void;
    isLoadingVectors: boolean;
}

const NeuralAnalyst = ({ memories, vectorStore, onInitVectors, isLoadingVectors }: NeuralAnalystProps) => {
    const [mode, setMode] = useState<'analyst' | 'mirror' | 'silence'>('analyst');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Initial Message
    useEffect(() => {
        if (messages.length === 0) {
            setMessages([{
                role: 'ai',
                content: "I am your Neural Analyst. I don't just chat; I analyze patterns, timelines, and hidden meanings in your data. \n\nTry asking: \n\"Make a timeline of my relationship with...\" \n\"When did my tone change?\"",
                timestamp: Date.now()
            }]);
        }
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Semantic Search Helper
    const searchMemory = async (query: string, topK = 15) => {
        if (vectorStore.length === 0) return [];
        
        const pipe = await loadEmbeddingModel();
        const output = await pipe(query, { pooling: 'mean', normalize: true });
        const queryEmbedding = Array.from(output.data) as number[];

        const scored = vectorStore.map(vec => ({
            ...vec,
            score: cosineSimilarity(queryEmbedding, vec.embedding)
        }));

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    };

    // Mirror Mode
    const runMirrorAnalysis = async () => {
        setIsThinking(true);
        // Compare first 10% vs last 10% of vectors
        if(vectorStore.length < 10) {
             setMessages(prev => [...prev, { role: 'ai', content: "Not enough data for Mirror Mode. Import more conversations.", timestamp: Date.now() }]);
             setIsThinking(false);
             return;
        }

        const past = vectorStore.slice(0, 5).map(v => v.text).join('\n---\n');
        const present = vectorStore.slice(-5).map(v => v.text).join('\n---\n');

        const prompt = `
        Compare the User's "Past Self" vs "Present Self".
        
        PAST SAMPLES:
        ${past}

        PRESENT SAMPLES:
        ${present}

        Output a psychological profile comparing: Tone, Vocabulary, and Emotional State.
        `;

        await generateAIResponse(prompt, "Mirror Analysis");
    };

    // Silence Analysis
    const runSilenceAnalysis = async () => {
        setIsThinking(true);
        // Find a random gap > 3 days
        // This is a simulation since we don't have full date parsing in vectors yet
        // In real app, we'd use the timestamp meta from vectors
        const prompt = `
        Analyze the concept of "Silence" in the user's data. 
        Look for patterns where the user stops replying or writes shorter messages.
        
        CONTEXT SAMPLES:
        ${vectorStore.slice(0, 10).map(v => v.text).join('\n')}
        `;
        
        await generateAIResponse(prompt, "Silence Analysis");
    };

    // Core Generation
    const generateAIResponse = async (promptContext: string, systemRole: string) => {
        setIsThinking(true);
        try {
            const apiKey = process.env.API_KEY;
            if (!apiKey) throw new Error("API Key missing");
            const ai = new GoogleGenAI({ apiKey });
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [
                    { role: 'user', parts: [{ text: `
                        SYSTEM ROLE: ${systemRole}.
                        IDENTITY: The user is identified by names like "Mohammed", "Mohamed", "Me", "User", "Ana". Treat these as the "Self".
                        
                        INSTRUCTION: Answer based ONLY on the provided context. Do not invent facts.
                        
                        ${promptContext}
                    ` }] }
                ],
                config: {
                    thinkingConfig: { thinkingBudget: 1024 }
                }
            });

            setMessages(prev => [...prev, {
                role: 'ai',
                content: response.text || "No insight found.",
                timestamp: Date.now()
            }]);
        } catch (e) {
            setMessages(prev => [...prev, {
                role: 'ai',
                content: "Error: Could not connect to Neural Core (Check API Key).",
                timestamp: Date.now()
            }]);
        } finally {
            setIsThinking(false);
        }
    };

    const handleSendMessage = async () => {
        if (!input.trim()) return;
        
        const userMsg = input;
        setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: Date.now() }]);
        setInput("");
        setIsThinking(true);

        try {
            if (vectorStore.length === 0) {
                 setMessages(prev => [...prev, { role: 'ai', content: "Please initialize the Neural Engine first (click the button in toolbar).", timestamp: Date.now() }]);
                 setIsThinking(false);
                 return;
            }

            // 1. Retrieve Context
            const context = await searchMemory(userMsg, 20); // Top 20 chunks
            const contextText = context.map(c => `[Source: ${c.meta.source}] ${c.text}`).join('\n\n');

            // 2. Generate
            const prompt = `
            CONTEXT FROM MEMORY:
            ${contextText}
            
            USER REQUEST:
            "${userMsg}"
            
            Perform a deep analysis. If the user asks for a timeline, summarize chronological events. If they ask about feelings, trace emotional words.
            `;

            await generateAIResponse(prompt, "Psychological Analyst");

        } catch (e) {
            console.error(e);
            setMessages(prev => [...prev, { role: 'ai', content: "Analysis failed.", timestamp: Date.now() }]);
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-900 bg-zinc-950/50 backdrop-blur sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setMode('analyst')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${mode === 'analyst' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <Brain className="w-3.5 h-3.5" /> Analyst
                    </button>
                     <button 
                        onClick={() => { setMode('mirror'); runMirrorAnalysis(); }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${mode === 'mirror' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <Eye className="w-3.5 h-3.5" /> Mirror Mode
                    </button>
                    <button 
                        onClick={() => { setMode('silence'); runSilenceAnalysis(); }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${mode === 'silence' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <Ear className="w-3.5 h-3.5" /> Silence Analysis
                    </button>
                </div>
                
                {/* Engine Status */}
                <div className="flex items-center gap-2">
                    {isLoadingVectors ? (
                        <div className="flex items-center gap-2 text-xs text-yellow-500">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Loading Engine...</span>
                        </div>
                    ) : vectorStore.length > 0 ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-500 px-2 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
                            <Zap className="w-3 h-3 fill-current" />
                            <span>Neural Core Active ({vectorStore.length} vectors)</span>
                        </div>
                    ) : (
                        <button 
                            onClick={onInitVectors}
                            className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded transition-colors"
                        >
                            <PowerIcon className="w-3 h-3" /> Initialize Engine
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-4 ${
                                msg.role === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-br-none' 
                                    : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-bl-none'
                            }`}>
                                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                                {msg.usedContext && (
                                    <div className="mt-3 pt-3 border-t border-zinc-800/50 text-[10px] text-zinc-500 flex flex-wrap gap-2">
                                        <span className="font-semibold text-indigo-400">Sources:</span>
                                        {Array.from(new Set(msg.usedContext)).slice(0, 3).map((s, i) => (
                                            <span key={i} className="bg-zinc-950 px-1.5 py-0.5 rounded">{s}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    
                    {isThinking && (
                        <div className="flex justify-start">
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 rounded-bl-none flex items-center gap-3">
                                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                                <span className="text-xs text-zinc-500 ml-2">Neural processing...</span>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Prompt Grid (Only show if empty or just started) */}
                {messages.length < 3 && mode === 'analyst' && (
                    <div className="px-4 pb-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {QUESTION_CATEGORIES.map(cat => (
                                <button 
                                    key={cat.id}
                                    onClick={() => {
                                        const q = cat.questions[Math.floor(Math.random() * cat.questions.length)];
                                        setInput(q);
                                    }}
                                    className="text-left p-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 transition-all group"
                                >
                                    <div className={`flex items-center gap-2 mb-1 ${cat.color}`}>
                                        <cat.icon className="w-4 h-4" />
                                        <span className="text-xs font-semibold">{cat.label}</span>
                                    </div>
                                    <div className="text-xs text-zinc-500 group-hover:text-zinc-300 truncate">
                                        e.g. {cat.questions[0]}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input Area */}
                <div className="p-4 bg-zinc-950 border-t border-zinc-900">
                    <div className="relative max-w-4xl mx-auto">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                            placeholder={vectorStore.length === 0 ? "Initialize Engine to start..." : "Ask your Neural Analyst..."}
                            disabled={vectorStore.length === 0 || isThinking}
                            className="w-full bg-zinc-900 text-zinc-100 rounded-xl pl-4 pr-12 py-3.5 focus:ring-2 focus:ring-indigo-500/50 outline-none border border-zinc-800 placeholder-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={!input.trim() || vectorStore.length === 0 || isThinking}
                            className="absolute right-2 top-2 p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-0 disabled:pointer-events-none"
                        >
                            <Sparkles className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Journal Component
const JournalEditor = ({ memories, onSave }: { memories: MemoryItem[], onSave: (item: MemoryItem) => Promise<boolean> }) => {
    const [entry, setEntry] = useState("");
    const [mood, setMood] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [dateStr, setDateStr] = useState("");

    // Initialize logic
    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        setDateStr(today);
        
        // Find existing
        const id = `journal_${today}`;
        const existing = memories.find(m => m.id === id);
        
        if (existing && existing.content) {
            setEntry(existing.content.entry || "");
            setMood(existing.content.mood || "");
        }
    }, [memories]);

    // Auto-save logic
    useEffect(() => {
        const timer = setTimeout(() => {
            if (entry.trim()) {
                handleSave();
            }
        }, 3000); // 3 seconds debounced auto-save
        
        return () => clearTimeout(timer);
    }, [entry, mood]);

    const handleSave = async () => {
        if(!dateStr || !entry.trim()) return;
        setIsSaving(true);
        const id = `journal_${dateStr}`;
        const item: MemoryItem = {
            id,
            sourceFile: `${id}.json`,
            type: 'journal',
            timestamp: Date.now(),
            content: {
                date: dateStr,
                entry: entry,
                mood: mood
            }
        };

        const success = await onSave(item);
        if(success) {
            setLastSaved(new Date());
        }
        setIsSaving(false);
    };

    return (
        <div className="h-full flex flex-col max-w-3xl mx-auto p-4 md:p-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                     <h2 className="text-3xl font-light text-white tracking-tight">
                         {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                     </h2>
                     <p className="text-zinc-500 text-sm mt-1">What's on your mind?</p>
                </div>
                <div className="flex items-center gap-4">
                     {isSaving ? (
                         <span className="text-xs text-zinc-500 animate-pulse flex items-center gap-2">
                             <RefreshCw className="w-3 h-3 animate-spin" /> Saving...
                         </span>
                     ) : lastSaved ? (
                         <span className="text-xs text-zinc-600 flex items-center gap-1">
                             <Check className="w-3 h-3" /> Saved {lastSaved.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                         </span>
                     ) : null}
                </div>
            </div>

            {/* Mood Selector */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
                {MOODS.map(m => (
                    <button
                        key={m}
                        onClick={() => setMood(m)}
                        className={`text-2xl p-3 rounded-2xl transition-all ${mood === m ? 'bg-indigo-500/20 scale-110 shadow-lg shadow-indigo-500/10' : 'bg-zinc-900/50 hover:bg-zinc-800 grayscale hover:grayscale-0'}`}
                    >
                        {m}
                    </button>
                ))}
            </div>

            {/* Editor */}
            <div className="flex-1 relative group">
                <textarea 
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                    placeholder="Start writing..."
                    className="w-full h-full bg-transparent text-zinc-300 text-lg md:text-xl leading-relaxed resize-none outline-none placeholder-zinc-700 selection:bg-indigo-500/30"
                    spellCheck={false}
                />
                <div className="absolute bottom-0 right-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity text-zinc-700 text-xs">
                    {entry.length} chars
                </div>
            </div>
        </div>
    );
};

// Simple Icon component for the button
const PowerIcon = (props: any) => (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      {...props}
    >
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" x2="12" y1="2" y2="12" />
    </svg>
)

// --- Main App Component ---

function App() {
  const [activeView, setActiveView] = useState<'upload' | 'memories' | 'analytics' | 'intelligence' | 'journal' | 'settings'>('upload');
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  
  // Vector Store State (Shared between Analytics and Intelligence)
  const [vectorStore, setVectorStore] = useState<VectorItem[]>([]);
  const [isLoadingVectors, setIsLoadingVectors] = useState(false);

  // Settings State
  const [apiKey, setApiKey] = useState(process.env.API_KEY || "");
  const [userName, setUserName] = useState("User");
  
  // Supabase State
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>({
      url: "",
      key: "",
      enabled: false
  });

  // --- Toast Logic ---
  const addToast = (type: ToastType, title: string, message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // --- Initialization ---
  useEffect(() => {
    // Load local settings
    const savedName = localStorage.getItem("memory_os_name");
    const savedSupabase = localStorage.getItem("memory_os_supabase");

    if (savedName) setUserName(savedName);
    if (savedSupabase) {
        try {
            setSupabaseConfig(JSON.parse(savedSupabase));
        } catch(e) {}
    }

    // Load Data
    loadData();
  }, []);

  const loadData = async () => {
      try {
          const data = await getAllMemories(supabaseConfig.enabled ? supabaseConfig : undefined);
          setMemories(data);
      } catch (e) {
          console.error("Load error:", e);
          addToast("error", "Load Failed", (e as Error).message);
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    
    const files = Array.from(e.target.files);
    let successCount = 0;
    let failCount = 0;

    addToast('info', 'Processing', `Reading ${files.length} files...`);

    const newItems: MemoryItem[] = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const items = processFileContent(file.name, text);
        newItems.push(...items);
        successCount++;
      } catch (err) {
        console.error(`Error parsing ${file.name}:`, err);
        failCount++;
      }
    }

    if (newItems.length > 0) {
        try {
            await saveMemories(newItems, supabaseConfig.enabled ? supabaseConfig : undefined);
            setMemories(prev => [...prev, ...newItems]); // Optimistic update
            addToast('success', 'Import Complete', `Imported ${successCount} files. ${failCount > 0 ? `${failCount} failed.` : ''}`);
            setActiveView('memories');
        } catch (e) {
            addToast('error', 'Save Failed', (e as Error).message);
        }
    } else if (failCount > 0) {
        addToast('error', 'Import Failed', 'Could not parse any selected files.');
    }
  };

  const handleSaveMemory = async (item: MemoryItem) => {
      try {
        await saveMemories([item], supabaseConfig.enabled ? supabaseConfig : undefined);
        setMemories(prev => {
            const index = prev.findIndex(m => m.id === item.id);
            if (index >= 0) {
                const updated = [...prev];
                updated[index] = item;
                return updated;
            }
            return [...prev, item];
        });
        return true;
      } catch (e) {
          console.error("Save failed", e);
          addToast('error', 'Save Failed', (e as Error).message);
          return false;
      }
  };
  
  const handleClearData = async () => {
      if(!confirm("Are you sure? This will delete all memories.")) return;
      try {
          await clearMemories(supabaseConfig.enabled ? supabaseConfig : undefined);
          setMemories([]);
          setVectorStore([]); // Clear vectors too
          addToast('success', 'Cleared', 'All memories deleted.');
      } catch (e) {
          addToast('error', 'Error', (e as Error).message);
      }
  };

  // --- Shared Vector Initialization ---
  const initializeEngine = async () => {
      if (vectorStore.length > 0) return; // Already loaded
      setIsLoadingVectors(true);
      try {
          const pipe = await loadEmbeddingModel();
          
          // Process memories into chunks
          const chunks: VectorItem[] = [];
          
          memories.forEach(mem => {
              if (mem.type === 'conversation') {
                  const msgs = Array.isArray(mem.content) ? mem.content : mem.content?.messages || [];
                  // Group by 20 messages
                  for (let i = 0; i < msgs.length; i += 20) {
                      const batch = msgs.slice(i, i + 20);
                      const text = batch.map((m: any) => `${m.sender}: ${m.message}`).join('\n');
                      if (text.length > 50) { 
                          chunks.push({
                              id: `${mem.id}_chunk_${i}`,
                              text: text,
                              embedding: [],
                              meta: { 
                                  source: mem.sourceFile, 
                                  timestamp: msgs[i]?.date || mem.timestamp,
                                  sender: batch[0]?.sender // Primary sender hint
                              }
                          });
                      }
                  }
              } else if (mem.type === 'journal') {
                  chunks.push({
                      id: mem.id,
                      text: mem.content.entry,
                      embedding: [],
                      meta: { source: 'Journal', timestamp: mem.timestamp }
                  });
              }
          });

          console.log(`Embedding ${chunks.length} chunks...`);
          addToast('info', 'Neural Core', `Embedding ${chunks.length} memory chunks...`);
          
          const vectors: VectorItem[] = [];
          for (let i = 0; i < chunks.length; i++) {
              const output = await pipe(chunks[i].text, { pooling: 'mean', normalize: true });
              vectors.push({
                  ...chunks[i],
                  embedding: Array.from(output.data) as number[]
              });
              // Yield to UI every 10 items
              if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
          }

          setVectorStore(vectors);
          setIsLoadingVectors(false);
          addToast('success', 'Neural Core Ready', 'You can now use Semantic Search and AI features.');
      } catch (e) {
          console.error(e);
          setIsLoadingVectors(false);
          addToast('error', 'Engine Failed', 'Could not load neural models.');
      }
  };

  // --- Views ---

  const renderContent = () => {
    switch (activeView) {
      case 'upload':
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-8 animate-fade-in">
            <div className="p-6 rounded-full bg-zinc-900 border border-zinc-800 shadow-2xl shadow-indigo-500/10 mb-4">
               <UploadCloud className="w-16 h-16 text-indigo-500" />
            </div>
            <h2 className="text-3xl font-light text-white tracking-tight">Feed Your Memory</h2>
            <p className="text-zinc-400 max-w-md leading-relaxed">
              Upload your WhatsApp chats (txt), JSON exports, or journal entries. 
              The system processes everything locally first.
            </p>
            
            <label className="group relative flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full cursor-pointer hover:bg-zinc-200 transition-all font-medium shadow-lg hover:shadow-xl hover:scale-105 active:scale-95">
              <UploadCloud className="w-5 h-5" />
              <span>Select Files</span>
              <input 
                type="file" 
                multiple 
                accept=".txt,.json,.md,.csv" 
                className="hidden" 
                onChange={handleFileUpload} 
              />
            </label>
            
            <div className="text-xs text-zinc-600 mt-8">
                Supports: WhatsApp Export (.txt), JSON Schema, Plain Text
            </div>
          </div>
        );

      case 'memories':
        return (
          <div className="p-4 md:p-8 h-full overflow-y-auto custom-scrollbar">
            <h2 className="text-2xl font-light mb-6 sticky top-0 bg-zinc-950/80 backdrop-blur-md py-4 z-10 flex items-center justify-between">
                <span>Memory Stream</span>
                <span className="text-xs font-mono bg-zinc-900 px-2 py-1 rounded text-zinc-500">{memories.length} items</span>
            </h2>
            
            {memories.length === 0 ? (
                <div className="text-center text-zinc-500 mt-20">
                    <Ghost className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    No memories found. Go to Upload.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                {memories.slice().reverse().map((mem) => (
                    <div key={mem.id} className="group bg-zinc-900/50 border border-zinc-800/50 p-5 rounded-xl hover:border-indigo-500/30 transition-all hover:bg-zinc-900 relative overflow-hidden">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                             {mem.type === 'conversation' && <MessageCircle className="w-4 h-4 text-blue-400" />}
                             {mem.type === 'person' && <User className="w-4 h-4 text-purple-400" />}
                             {mem.type === 'journal' && <BookOpen className="w-4 h-4 text-emerald-400" />}
                             {mem.type === 'emotion' && <Heart className="w-4 h-4 text-rose-400" />}
                             {(mem.type === 'text' || mem.type === 'unknown' || !mem.type) && <FileText className="w-4 h-4 text-zinc-400" />}
                             <span className="text-xs font-medium text-zinc-400 truncate max-w-[150px]">
                                {mem.sourceFile.replace('.json', '')}
                             </span>
                        </div>
                        <span className="text-[10px] text-zinc-600 font-mono">
                            {new Date(mem.timestamp).toLocaleDateString()}
                        </span>
                    </div>
                    
                    <div className="text-sm text-zinc-300 line-clamp-4 leading-relaxed opacity-80 group-hover:opacity-100">
                        {mem.type === 'conversation' 
                            ? (Array.isArray(mem.content) 
                                ? mem.content.slice(0, 3).map((m:any) => `${m.sender}: ${m.message}`).join('\n') 
                                : "Chat Log")
                            : (typeof mem.content === 'string' ? mem.content : JSON.stringify(mem.content, null, 2))
                        }
                    </div>
                    
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                ))}
                </div>
            )}
          </div>
        );

      case 'analytics':
          return (
            <AnalyticsDashboard 
                memories={memories} 
                vectorStore={vectorStore} 
                onInitVectors={initializeEngine} 
                isLoadingVectors={isLoadingVectors} 
            />
          );

      case 'intelligence':
        return (
            <NeuralAnalyst 
                memories={memories} 
                vectorStore={vectorStore} 
                onInitVectors={initializeEngine} 
                isLoadingVectors={isLoadingVectors} 
            />
        );

      case 'journal':
          return <JournalEditor memories={memories} onSave={handleSaveMemory} />;

      case 'settings':
        return (
          <div className="p-6 max-w-2xl mx-auto h-full overflow-y-auto custom-scrollbar animate-fade-in">
             <h2 className="text-2xl font-light mb-8 flex items-center gap-2">
                 <Settings className="w-6 h-6" /> System Configuration
             </h2>
             
             <div className="space-y-8">
                 {/* User Profile */}
                 <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                     <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                         <User className="w-4 h-4 text-indigo-400" /> Identity
                     </h3>
                     <div className="space-y-4">
                         <div>
                             <label className="block text-xs text-zinc-500 mb-1">Display Name</label>
                             <input 
                                type="text" 
                                value={userName}
                                onChange={(e) => {
                                    setUserName(e.target.value);
                                    localStorage.setItem("memory_os_name", e.target.value);
                                }}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                             />
                         </div>
                     </div>
                 </div>

                 {/* Cloud Sync */}
                 <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-4 opacity-10">
                         <Database className="w-24 h-24" />
                     </div>
                     <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                         <Cloud className="w-4 h-4 text-emerald-400" /> Cloud Sync (Supabase)
                     </h3>
                     <div className="space-y-4 relative z-10">
                         <div className="flex items-center gap-2 mb-4">
                             <button 
                                onClick={() => {
                                    const newState = { ...supabaseConfig, enabled: !supabaseConfig.enabled };
                                    setSupabaseConfig(newState);
                                    localStorage.setItem("memory_os_supabase", JSON.stringify(newState));
                                }}
                                className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${supabaseConfig.enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                             >
                                 <div className={`w-4 h-4 bg-white rounded-full transition-transform ${supabaseConfig.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                             </button>
                             <span className="text-sm text-zinc-300">{supabaseConfig.enabled ? 'Sync Enabled' : 'Sync Disabled (Local Only)'}</span>
                         </div>
                         
                         {supabaseConfig.enabled && (
                             <div className="space-y-3 animate-slide-down">
                                 <div>
                                     <label className="block text-xs text-zinc-500 mb-1">Project URL</label>
                                     <input 
                                        type="password" 
                                        value={supabaseConfig.url}
                                        onChange={(e) => {
                                            const newState = { ...supabaseConfig, url: e.target.value };
                                            setSupabaseConfig(newState);
                                            localStorage.setItem("memory_os_supabase", JSON.stringify(newState));
                                        }}
                                        placeholder="https://xyz.supabase.co"
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 focus:ring-1 focus:ring-emerald-500 outline-none font-mono text-sm"
                                     />
                                 </div>
                                 <div>
                                     <label className="block text-xs text-zinc-500 mb-1">Anon Key</label>
                                     <input 
                                        type="password" 
                                        value={supabaseConfig.key}
                                        onChange={(e) => {
                                            const newState = { ...supabaseConfig, key: e.target.value };
                                            setSupabaseConfig(newState);
                                            localStorage.setItem("memory_os_supabase", JSON.stringify(newState));
                                        }}
                                        placeholder="eyJh..."
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 focus:ring-1 focus:ring-emerald-500 outline-none font-mono text-sm"
                                     />
                                 </div>
                                 <button 
                                    onClick={loadData}
                                    className="flex items-center gap-2 text-xs bg-emerald-500/10 text-emerald-400 px-3 py-2 rounded hover:bg-emerald-500/20 transition-colors"
                                 >
                                     <RefreshCw className="w-3 h-3" /> Test Connection & Sync
                                 </button>
                             </div>
                         )}
                     </div>
                 </div>

                 {/* Danger Zone */}
                 <div className="bg-red-950/10 p-6 rounded-2xl border border-red-900/30">
                     <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-red-400">
                         <AlertTriangle className="w-4 h-4" /> Danger Zone
                     </h3>
                     <button 
                        onClick={handleClearData}
                        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-lg transition-colors text-sm w-full justify-center"
                     >
                         <Trash2 className="w-4 h-4" /> Wipe All Data
                     </button>
                 </div>
             </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-200 font-sans selection:bg-indigo-500/30">
      
      {/* Mobile Sidebar Toggle */}
      <button 
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-zinc-900/80 backdrop-blur rounded-full border border-zinc-800 shadow-lg"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40 w-64 bg-zinc-950 border-r border-zinc-900 transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 flex flex-col
      `}>
        <div className="p-6 border-b border-zinc-900 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Brain className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-medium tracking-tight text-white">Memory OS</h1>
        </div>

        <nav className="flex-1 p-4 space-y-1">
            <button 
                onClick={() => { setActiveView('upload'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'upload' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            >
                <UploadCloud className="w-5 h-5" />
                <span className="text-sm font-medium">Import Data</span>
            </button>
            <button 
                onClick={() => { setActiveView('memories'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'memories' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            >
                <HardDrive className="w-5 h-5" />
                <span className="text-sm font-medium">Memories</span>
            </button>
             <button 
                onClick={() => { setActiveView('analytics'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'analytics' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            >
                <BarChart2 className="w-5 h-5" />
                <span className="text-sm font-medium">Analytics</span>
            </button>
             <button 
                onClick={() => { setActiveView('intelligence'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'intelligence' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            >
                <Brain className="w-5 h-5" />
                <span className="text-sm font-medium">Neural Analyst</span>
            </button>
            <button 
                onClick={() => { setActiveView('journal'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'journal' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            >
                <Book className="w-5 h-5" />
                <span className="text-sm font-medium">Journal</span>
            </button>
        </nav>

        <div className="p-4 border-t border-zinc-900">
             <button 
                onClick={() => { setActiveView('settings'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'settings' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            >
                <Settings className="w-5 h-5" />
                <span className="text-sm font-medium">Settings</span>
            </button>
            <div className="mt-4 px-4 text-[10px] text-zinc-600 font-mono text-center">
                v1.2.0 • Local First
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden bg-zinc-950">
          {renderContent()}
      </main>

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className="animate-slide-up bg-zinc-900 border border-zinc-800 text-zinc-200 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 min-w-[300px]">
            {t.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
            {t.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
            {t.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
            {t.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
            <div>
              <div className="font-medium text-sm">{t.title}</div>
              <div className="text-xs text-zinc-500">{t.message}</div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
