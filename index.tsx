import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
// @ts-ignore
// Transformers import removed from main thread, moved to Worker

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
  Type,
  ArrowRight,
  Bot
} from "lucide-react";

// --- Worker Script Definition ---
// We define the worker code as a string to avoid needing a separate file build step
const WORKER_CODE = `
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0/dist/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

let embeddingPipeline = null;
let vectorStore = []; // Keep a copy in worker for fast search

self.onmessage = async (event) => {
    const { type, payload, id } = event.data;

    try {
        if (type === 'init') {
            if (!embeddingPipeline) {
                embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            }
            self.postMessage({ type: 'init_complete', id });
        } 
        else if (type === 'load_vectors') {
            // Load existing vectors into worker memory for fast search
            vectorStore = payload;
            self.postMessage({ type: 'load_complete', count: vectorStore.length, id });
        }
        else if (type === 'embed_chunk') {
            if (!embeddingPipeline) throw new Error("Pipeline not initialized");
            const output = await embeddingPipeline(payload.text, { pooling: 'mean', normalize: true });
            const embedding = Array.from(output.data);
            const vecItem = { ...payload, embedding };
            
            // Add to local store
            vectorStore.push(vecItem);
            
            self.postMessage({ type: 'embed_result', payload: vecItem, id });
        }
        else if (type === 'search') {
            if (!embeddingPipeline) throw new Error("Pipeline not initialized");
            const { query, limit = 20 } = payload;
            
            // Embed query
            const output = await embeddingPipeline(query, { pooling: 'mean', normalize: true });
            const queryEmbedding = Array.from(output.data);

            // Cosine Similarity
            const results = vectorStore.map(vec => {
                let dot = 0;
                let normA = 0;
                let normB = 0;
                for (let i = 0; i < queryEmbedding.length; i++) {
                    dot += queryEmbedding[i] * vec.embedding[i];
                    normA += queryEmbedding[i] * queryEmbedding[i];
                    normB += vec.embedding[i] * vec.embedding[i];
                }
                const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
                return { item: vec, score };
            });

            // Exact match boost
            const lowerQuery = query.toLowerCase();
            results.forEach(r => {
                if (r.item.text.toLowerCase().includes(lowerQuery)) {
                    r.score += 1.0; // Boost exact matches
                }
            });

            // Sort
            results.sort((a, b) => b.score - a.score);
            
            self.postMessage({ type: 'search_result', payload: results.slice(0, limit), id });
        }
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message, id });
    }
};
`;

// --- Types & Globals ---

interface MemoryItem {
  id: string;
  sourceFile: string;
  content: any; 
  timestamp: number;
  type?: 'person' | 'emotion' | 'conversation' | 'text' | 'journal' | 'unknown';
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

interface VectorItem {
    id: string;
    text: string;
    embedding: number[];
    meta: {
        source: string;
        timestamp: number;
        sender?: string;
        originalId?: string; 
    };
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

// --- IndexedDB Layer (Updated for Vectors) ---
const DB_NAME = "MemoryOS_DB";
const STORE_NAME = "memories"; 
const VECTOR_STORE_NAME = "vectors";

const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 5); // Version bumped
  request.onupgradeneeded = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains(VECTOR_STORE_NAME)) {
        db.createObjectStore(VECTOR_STORE_NAME, { keyPath: "id" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// --- Storage Abstraction Layer ---

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
      const rows = items.map(item => ({
          id: item.id,
          source_file: item.sourceFile,
          content: item.content,
          timestamp: item.timestamp,
          type: item.type || 'unknown'
      }));
      const { error } = await sb.from('memories').upsert(rows);
      if (error) throw new Error("Cloud Sync Failed: " + error.message);
      return;
  } else {
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
      const { data, error } = await sb.from('memories').select('*');
      if (error) throw new Error("Fetch Failed: " + error.message);
      return (data || []).map((row: any) => ({
          id: row.id,
          sourceFile: row.source_file,
          content: row.content,
          timestamp: row.timestamp,
          type: row.type
      }));
  } else {
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
        const { error } = await sb.from('memories').delete().neq('id', '0'); 
        if (error) throw new Error("Cloud Wipe Failed: " + error.message);
    } else {
        const db = await dbPromise;
        const tx = db.transaction([STORE_NAME, VECTOR_STORE_NAME], "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.objectStore(VECTOR_STORE_NAME).clear();
        return new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
    }
}

async function saveVectors(items: VectorItem[]) {
    const db = await dbPromise;
    const tx = db.transaction(VECTOR_STORE_NAME, "readwrite");
    const store = tx.objectStore(VECTOR_STORE_NAME);
    items.forEach(item => store.put(item));
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
}

async function getAllVectors(): Promise<VectorItem[]> {
    const db = await dbPromise;
    const tx = db.transaction(VECTOR_STORE_NAME, "readonly");
    const store = tx.objectStore(VECTOR_STORE_NAME);
    return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
    });
}

// --- Parsing Logic ---

function parseWhatsAppLogs(text: string): any[] | null {
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

function parseGPTChatLog(text: string): any[] | null {
    const lines = text.split('\n');
    const messages: any[] = [];
    let currentSender: string | null = null;
    let currentBuffer: string[] = [];
    let matchCount = 0;

    for (const line of lines) {
        const trimmed = line.trim().toLowerCase();
        
        // Check for specific headers in copy-pasted ChatGPT logs
        if (trimmed === 'user') {
            if (currentSender) {
                messages.push({ sender: currentSender, message: currentBuffer.join('\n').trim(), date: null });
                matchCount++;
            }
            currentSender = 'user';
            currentBuffer = [];
        } else if (trimmed === 'chatgpt') {
            if (currentSender) {
                messages.push({ sender: currentSender, message: currentBuffer.join('\n').trim(), date: null });
                matchCount++;
            }
            currentSender = 'ChatGPT';
            currentBuffer = [];
        } else {
            if (currentSender) {
                currentBuffer.push(line);
            }
        }
    }

    if (currentSender && currentBuffer.length > 0) {
        messages.push({ sender: currentSender, message: currentBuffer.join('\n').trim(), date: null });
        matchCount++;
    }

    return matchCount > 0 ? messages : null;
}

function processFileContent(fileName: string, text: string): MemoryItem[] {
      const itemsToAdd: MemoryItem[] = [];
      const idBase = `${fileName}_${Date.now()}`;

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
              throw new Error(`Invalid JSON in ${fileName}: ${(e as Error).message}`);
          }
      } 
      
      try {
          const parsedBracketChat = parseBracketLogs(text);
          const parsedWhatsApp = !parsedBracketChat ? parseWhatsAppLogs(text) : null;
          const parsedGPT = (!parsedBracketChat && !parsedWhatsApp) ? parseGPTChatLog(text) : null;
          
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
          } else if (parsedGPT) {
              itemsToAdd.push({
                  id: idBase,
                  sourceFile: fileName,
                  content: parsedGPT,
                  timestamp: Date.now(),
                  type: 'conversation'
              });
          } else {
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
    const activityByDay = new Array(7).fill(0); 
    let positive = 0;
    let negative = 0;
    let neutral = 0;
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

    messages.forEach(msg => {
        const text = msg.message || msg.text || '';
        const sender = msg.sender || 'Unknown';
        senderCounts[sender] = (senderCounts[sender] || 0) + 1;

        if (text.includes('<Media omitted>') || text.includes('image omitted')) {
            mediaCount++;
            return;
        }

        const len = text.length;
        charCount += len;
        if (len > longest.length) {
            longest = { text: text.substring(0, 100) + (len > 100 ? '...' : ''), sender, length: len };
        }

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

        const emojis = text.match(emojiRegex);
        if (emojis) {
            emojis.forEach((e: string) => {
                emojiFreq[e] = (emojiFreq[e] || 0) + 1;
            });
        }

        try {
            let dateObj;
            if (msg.date && msg.time) {
                 const [day, month, year] = msg.date.split(/[\/.-]/).map(Number);
                 let timeStr = msg.time.toLowerCase();
                 let [hours, minutes] = timeStr.replace(/[ap]m/, '').split(':').map(Number);
                 if (timeStr.includes('pm') && hours < 12) hours += 12;
                 if (timeStr.includes('am') && hours === 12) hours = 0;
                 const fullYear = year < 100 ? 2000 + year : year;
                 dateObj = new Date(fullYear, month - 1, day, hours, minutes);
            } else if (msg.timestamp) {
                dateObj = new Date(msg.timestamp);
            }
            if (dateObj && !isNaN(dateObj.getTime())) {
                activityByHour[dateObj.getHours()]++;
                activityByDay[dateObj.getDay()]++;
            }
        } catch (e) {}
    });

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

// --- Worker Hook ---

const useWorker = () => {
    const workerRef = useRef<Worker | null>(null);
    const promisesRef = useRef<Map<string, { resolve: (data: any) => void, reject: (err: any) => void }>>(new Map());

    useEffect(() => {
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
        workerRef.current = worker;

        worker.onmessage = (e) => {
            const { id, type, payload, error } = e.data;
            if (id && promisesRef.current.has(id)) {
                const { resolve, reject } = promisesRef.current.get(id)!;
                if (error) reject(error);
                else resolve(payload);
                promisesRef.current.delete(id);
            }
        };

        return () => worker.terminate();
    }, []);

    const sendMessage = (type: string, payload?: any) => {
        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).substring(7);
            promisesRef.current.set(id, { resolve, reject });
            workerRef.current?.postMessage({ type, payload, id });
        });
    };

    return { sendMessage };
};

// --- Components ---

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
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-black text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 border border-zinc-800">
                        {labels[i]}: {val}
                    </div>
                </div>
            ))}
        </div>
    );
};

const KeywordBubble = ({ word, count, max, onClick }: { word: string, count: number, max: number, onClick: (word: string) => void }) => {
    const size = Math.max(0.8, Math.min(2.5, 0.8 + (count / max) * 2));
    const opacity = Math.max(0.4, Math.min(1, 0.4 + (count / max)));
    
    return (
        <button 
            onClick={() => onClick(word)}
            className="inline-block m-1 px-2 py-1 rounded-lg bg-zinc-800/50 hover:bg-indigo-900/50 hover:text-white transition-colors cursor-pointer border border-transparent hover:border-indigo-500/30"
            style={{ fontSize: `${size}rem`, opacity }}
        >
            {word}
            <span className="ml-1 text-[0.6em] opacity-50">{count}</span>
        </button>
    );
};

interface AnalyticsProps {
    memories: MemoryItem[];
    onWordClick: (word: string) => void;
}

const AnalyticsDashboard = ({ memories, onWordClick }: AnalyticsProps) => {
    const [selectedId, setSelectedId] = useState<string>("all");
    
    const conversations = useMemo(() => {
        return memories.filter(m => m.type === 'conversation' || (Array.isArray(m.content) && m.content[0]?.sender));
    }, [memories]);

    const stats = useMemo(() => {
        let msgsToAnalyze: any[] = [];
        if (selectedId === "all") {
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
    }, [conversations, selectedId]);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({length: 24}, (_, i) => i.toString());

    return (
        <div className="p-4 space-y-6 pb-24 overflow-y-auto h-full custom-scrollbar">
             <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-indigo-400" />
                    Deep Analytics
                </h2>
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
            </div>

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

            <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
                 <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                        <Hash className="w-4 h-4" /> Top Keywords
                        <span className="text-[10px] text-zinc-500 ml-2 font-normal">(Click word to see context)</span>
                </h3>
                <div className="flex flex-wrap justify-center">
                    {stats.topWords.map((w, i) => (
                        <KeywordBubble key={i} word={w.word} count={w.count} max={stats.topWords[0]?.count || 1} onClick={onWordClick} />
                    ))}
                </div>
            </div>

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
        </div>
    );
};

// --- Deep Search Component ---

interface DeepSearchProps {
    worker: { sendMessage: (type: string, payload?: any) => Promise<any> };
    onInitVectors: () => void;
    isLoadingVectors: boolean;
    initialQuery: string;
    onNavigateToMemory: (memoryId: string, highlightText: string) => void;
    indexingProgress: number;
}

const DeepSearch = ({ worker, onInitVectors, isLoadingVectors, initialQuery, onNavigateToMemory, indexingProgress }: DeepSearchProps) => {
    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<{item: VectorItem, score: number, snippet: string}[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (initialQuery) {
            setQuery(initialQuery);
            performSearch(initialQuery);
        }
    }, [initialQuery]);

    const getContextSnippet = (fullText: string, searchTerm: string) => {
        const lowerText = fullText.toLowerCase();
        const lowerTerm = searchTerm.toLowerCase();
        const index = lowerText.indexOf(lowerTerm);
        
        if (index === -1) return fullText.substring(0, 150) + "..."; 

        const start = Math.max(0, index - 50);
        const end = Math.min(fullText.length, index + lowerTerm.length + 100);
        
        return (start > 0 ? "..." : "") + fullText.substring(start, end) + (end < fullText.length ? "..." : "");
    };

    const performSearch = async (term: string) => {
        if (!term.trim()) return;
        setIsSearching(true);
        setResults([]);

        try {
            // Offload search to worker
            const workerResults: any[] = await worker.sendMessage('search', { query: term });
            
            // Format results
            const formatted = workerResults.map(r => ({
                item: r.item,
                score: r.score,
                snippet: getContextSnippet(r.item.text, term)
            }));
            
            setResults(formatted);
        } catch (e) {
            console.error("Search failed", e);
        } finally {
            setIsSearching(false);
        }
    };

    const highlightText = (text: string, highlight: string) => {
        if (!highlight.trim()) return text;
        const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) => 
                    part.toLowerCase() === highlight.toLowerCase() 
                        ? <span key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">{part}</span> 
                        : part
                )}
            </span>
        );
    };

    return (
        <div className="flex flex-col h-full bg-zinc-950 p-4 md:p-8 animate-fade-in">
             <div className="max-w-3xl mx-auto w-full space-y-8">
                {/* Search Header */}
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 shadow-xl mb-2">
                        <Search className="w-6 h-6 text-indigo-500" />
                    </div>
                    <h2 className="text-3xl font-light text-white tracking-tight">Deep Search</h2>
                    <p className="text-zinc-500 text-sm">
                        Semantic & exact search across your entire memory bank.
                    </p>
                </div>

                {/* Search Input */}
                <div className="relative group">
                    <input 
                        type="text" 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && performSearch(query)}
                        placeholder="Search for moments, people, or feelings..."
                        className="w-full bg-zinc-900/50 border border-zinc-800 text-lg px-6 py-4 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all shadow-lg group-hover:bg-zinc-900"
                    />
                    <button 
                        onClick={() => performSearch(query)}
                        disabled={isSearching}
                        className="absolute right-3 top-3 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-50"
                    >
                        {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                    </button>
                </div>

                {/* Engine Status */}
                <div className="flex flex-col items-center gap-4">
                     {isLoadingVectors && (
                         <div className="w-full max-w-md bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                             <div className="bg-yellow-500 h-full transition-all duration-300" style={{ width: `${indexingProgress}%` }}></div>
                         </div>
                     )}
                     
                     <button 
                         onClick={onInitVectors}
                         disabled={isLoadingVectors}
                         className={`flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm ${isLoadingVectors ? 'opacity-50 cursor-not-allowed' : ''}`}
                     >
                         {isLoadingVectors ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Indexing... {Math.round(indexingProgress)}%</span>
                            </>
                         ) : (
                            <>
                                <Zap className="w-4 h-4 text-yellow-500" />
                                <span>{indexingProgress === 100 ? "Re-sync Index" : "Wake up Engine"}</span>
                            </>
                         )}
                     </button>
                </div>

                {/* Results List */}
                <div className="space-y-4 pb-20">
                    {results.map((res, idx) => (
                        <div 
                            key={`${res.item.id}_${idx}`}
                            onClick={() => onNavigateToMemory(res.item.meta.originalId || res.item.id, query)}
                            className="bg-zinc-900/50 border border-zinc-800 hover:border-indigo-500/30 p-5 rounded-xl cursor-pointer group transition-all hover:bg-zinc-900"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
                                    <span className="text-xs font-mono text-zinc-500">{res.item.meta.source}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-zinc-600">{new Date(res.item.meta.timestamp).toLocaleDateString()}</span>
                                    {res.score > 0.8 && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 rounded">Match: {Math.round(res.score * 100)}%</span>}
                                </div>
                            </div>
                            
                            <p className="text-sm text-zinc-300 leading-relaxed font-serif opacity-90">
                                {highlightText(res.snippet, query)}
                            </p>
                        </div>
                    ))}
                    
                    {results.length === 0 && query && !isSearching && (
                        <div className="text-center text-zinc-600 py-10">
                            No matching memories found.
                        </div>
                    )}
                </div>
             </div>
        </div>
    )
}

// Journal Component
const JournalEditor = ({ memories, onSave }: { memories: MemoryItem[], onSave: (item: MemoryItem) => Promise<boolean> }) => {
    const [entry, setEntry] = useState("");
    const [mood, setMood] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [dateStr, setDateStr] = useState("");

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        setDateStr(today);
        const id = `journal_${today}`;
        const existing = memories.find(m => m.id === id);
        if (existing && existing.content) {
            setEntry(existing.content.entry || "");
            setMood(existing.content.mood || "");
        }
    }, [memories]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (entry.trim()) {
                handleSave();
            }
        }, 3000); 
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

// --- Main App Component ---

function App() {
  const [activeView, setActiveView] = useState<'upload' | 'memories' | 'analytics' | 'search' | 'journal' | 'settings'>('upload');
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  
  // Worker & Vector State
  const { sendMessage } = useWorker();
  const [isLoadingVectors, setIsLoadingVectors] = useState(false);
  const [indexingProgress, setIndexingProgress] = useState(0);

  // Search Navigation State
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedMemoryId, setExpandedMemoryId] = useState<string | null>(null);
  const [highlightTerm, setHighlightTerm] = useState<string>("");

  // Settings State
  const [userName, setUserName] = useState("User");
  
  // Supabase State
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>({
      url: "",
      key: "",
      enabled: false
  });

  const addToast = (type: ToastType, title: string, message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  useEffect(() => {
    const savedName = localStorage.getItem("memory_os_name");
    const savedSupabase = localStorage.getItem("memory_os_supabase");

    if (savedName) setUserName(savedName);
    if (savedSupabase) {
        try {
            setSupabaseConfig(JSON.parse(savedSupabase));
        } catch(e) {}
    }
    loadData();
    initWorker();
  }, []);

  const initWorker = async () => {
      try {
        await sendMessage('init');
        // Preload existing vectors into worker
        const existingVectors = await getAllVectors();
        if (existingVectors.length > 0) {
             await sendMessage('load_vectors', existingVectors);
             setIndexingProgress(100);
        }
      } catch (e) {
          console.error("Worker Init Failed", e);
      }
  };

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
            setMemories(prev => [...prev, ...newItems]); 
            addToast('success', 'Import Complete', `Imported ${successCount} files.`);
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
          addToast('error', 'Save Failed', (e as Error).message);
          return false;
      }
  };
  
  const handleClearData = async () => {
      if(!confirm("Are you sure? This will delete all memories.")) return;
      try {
          await clearMemories(supabaseConfig.enabled ? supabaseConfig : undefined);
          setMemories([]);
          // Also clear worker vectors
          await sendMessage('load_vectors', []);
          setIndexingProgress(0);
          addToast('success', 'Cleared', 'All memories deleted.');
      } catch (e) {
          addToast('error', 'Error', (e as Error).message);
      }
  };

  // --- Optimized Background Indexing ---
  const initializeEngine = async () => {
      if (isLoadingVectors) return;
      setIsLoadingVectors(true);
      setIndexingProgress(0);

      try {
          // 1. Get existing vectors from DB
          const existingVectors = await getAllVectors();
          const existingIds = new Set(existingVectors.map(v => v.id));

          // 2. Identify missing chunks
          const chunksToEmbed: any[] = [];
          
          memories.forEach(mem => {
              if (mem.type === 'conversation') {
                  const msgs = Array.isArray(mem.content) ? mem.content : mem.content?.messages || [];
                  // Larger chunk size for speed (50 messages)
                  for (let i = 0; i < msgs.length; i += 50) {
                      const chunkId = `${mem.id}_chunk_${i}`;
                      if (!existingIds.has(chunkId)) {
                          const batch = msgs.slice(i, i + 50);
                          const text = batch.map((m: any) => `${m.sender}: ${m.message}`).join('\n');
                          if (text.length > 50) { 
                              chunksToEmbed.push({
                                  id: chunkId,
                                  text: text,
                                  meta: { 
                                      source: mem.sourceFile, 
                                      timestamp: msgs[i]?.date || mem.timestamp,
                                      sender: batch[0]?.sender,
                                      originalId: mem.id
                                  }
                              });
                          }
                      }
                  }
              } else if (mem.type === 'journal') {
                  if (!existingIds.has(mem.id)) {
                    chunksToEmbed.push({
                        id: mem.id,
                        text: mem.content.entry,
                        meta: { source: 'Journal', timestamp: mem.timestamp, originalId: mem.id }
                    });
                  }
              }
          });

          if (chunksToEmbed.length === 0) {
              addToast('info', 'Engine', 'Index is up to date.');
              setIndexingProgress(100);
              setIsLoadingVectors(false);
              return;
          }

          console.log(`Embedding ${chunksToEmbed.length} new chunks...`);
          
          // 3. Process in worker
          for (let i = 0; i < chunksToEmbed.length; i++) {
              const chunk = chunksToEmbed[i];
              // Send to worker to embed
              const result = (await sendMessage('embed_chunk', chunk)) as VectorItem;
              // Save result to IndexedDB immediately so we don't lose progress
              await saveVectors([result]);
              
              setIndexingProgress(Math.round(((i + 1) / chunksToEmbed.length) * 100));
          }

          setIsLoadingVectors(false);
          addToast('success', 'Engine Ready', `Indexed ${chunksToEmbed.length} new memory blocks.`);
      } catch (e) {
          console.error(e);
          setIsLoadingVectors(false);
          addToast('error', 'Engine Failed', 'Could not complete indexing.');
      }
  };

  // --- View Rendering ---

  // Helper for simple markdown formatting (Bold, Italic, Header)
  const formatText = (text: string) => {
    if (!text) return "";
    
    // Simple split by newline for paragraphs
    const lines = text.split('\n');
    
    return lines.map((line, idx) => {
        let content = line;
        
        // Headers (### )
        if (content.startsWith('### ')) {
            return <h3 key={idx} className="text-lg font-semibold text-white mt-4 mb-2">{content.replace('### ', '')}</h3>;
        }
        if (content.startsWith('## ')) {
            return <h2 key={idx} className="text-xl font-bold text-white mt-6 mb-3 border-b border-zinc-800 pb-2">{content.replace('## ', '')}</h2>;
        }

        // Bold (**text**)
        const parts = content.split(/(\*\*.*?\*\*)/g);
        
        return (
            <div key={idx} className={`min-h-[1em] ${content.startsWith('-') ? 'ml-4' : ''}`}>
                {parts.map((part, pIdx) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={pIdx} className="text-indigo-200 font-semibold">{part.slice(2, -2)}</strong>;
                    }
                    // Handle bullet points color
                    if (part.startsWith('- ')) {
                       return <span key={pIdx}><span className="text-zinc-500 mr-2">•</span>{part.substring(2)}</span>;
                    }
                    return <span key={pIdx}>{part}</span>;
                })}
            </div>
        );
    });
  };

  const MemoriesView = () => {
      const scrollRef = useRef<HTMLDivElement>(null);
      const [displayCount, setDisplayCount] = useState(20);

      // Simple infinite scroll trigger
      const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
          const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop === e.currentTarget.clientHeight;
          if (bottom) {
              setDisplayCount(prev => prev + 20);
          }
      };

      // Auto-scroll to highlight when opening a specific memory
      useEffect(() => {
          if (expandedMemoryId && highlightTerm && scrollRef.current) {
               // Give DOM time to render
               setTimeout(() => {
                   const elements = scrollRef.current?.querySelectorAll("div[data-message-text]");
                   if (elements) {
                       for(let i=0; i<elements.length; i++) {
                           if(elements[i].textContent?.toLowerCase().includes(highlightTerm.toLowerCase())) {
                               elements[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
                               break;
                           }
                       }
                   }
               }, 500);
          }
      }, [expandedMemoryId, highlightTerm]);

      // If viewing a single memory file
      if (expandedMemoryId) {
          const mem = memories.find(m => m.id === expandedMemoryId);
          if (!mem) return <div>Memory not found</div>;
          
          return (
              <div className="p-4 md:p-8 h-full overflow-y-auto custom-scrollbar bg-zinc-950" ref={scrollRef}>
                  <div className="max-w-4xl mx-auto pb-20">
                      <button 
                          onClick={() => setExpandedMemoryId(null)}
                          className="flex items-center gap-2 text-zinc-500 hover:text-white mb-6 transition-colors sticky top-0 bg-zinc-950/80 backdrop-blur-sm py-2 z-20 w-full"
                      >
                          <ArrowRight className="w-4 h-4 rotate-180" /> Back to list
                      </button>
                      
                      <div className="mb-8 border-b border-zinc-800 pb-4">
                        <h2 className="text-3xl font-light text-white mb-1 tracking-tight">{mem.sourceFile.replace('.json', '').replace('.txt', '')}</h2>
                        <div className="text-sm text-zinc-500 font-mono">{new Date(mem.timestamp).toLocaleDateString()} • {Array.isArray(mem.content) ? mem.content.length + ' messages' : 'Text Entry'}</div>
                      </div>

                      <div className="space-y-6">
                          {mem.type === 'conversation' && Array.isArray(mem.content) ? (
                              mem.content.map((msg: any, i: number) => {
                                  const isUser = msg.sender && (
                                    msg.sender.toLowerCase() === 'user' || 
                                    USER_ALIASES.has(msg.sender.toLowerCase())
                                  );
                                  
                                  return (
                                  <div 
                                    key={i} 
                                    className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
                                    data-message-text="true"
                                  >
                                      <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl p-5 shadow-sm relative group transition-all
                                        ${isUser 
                                            ? 'bg-gradient-to-br from-indigo-900/30 to-indigo-800/20 border border-indigo-500/20 rounded-tr-sm' 
                                            : 'bg-zinc-900/80 border border-zinc-800 rounded-tl-sm'
                                        }
                                      `}>
                                          <div className={`text-[10px] uppercase tracking-wider font-bold mb-2 flex items-center gap-2 ${isUser ? 'text-indigo-400 justify-end' : 'text-zinc-500'}`}>
                                              {isUser ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                                              {msg.sender}
                                          </div>
                                          
                                          <div className={`text-base md:text-lg leading-8 ${isUser ? 'text-indigo-50' : 'text-zinc-300'}`}>
                                              {/* Smart highlighting if search term exists, otherwise format text */}
                                              {highlightTerm ? (
                                                  msg.message.split(new RegExp(`(${highlightTerm})`, 'gi')).map((part: string, idx: number) => 
                                                      part.toLowerCase() === highlightTerm.toLowerCase() && highlightTerm
                                                      ? <span key={idx} className="bg-yellow-500/40 text-yellow-100 rounded px-1">{part}</span> 
                                                      : formatText(part)
                                                  )
                                              ) : (
                                                  formatText(msg.message)
                                              )}
                                          </div>
                                      </div>
                                  </div>
                                  );
                              })
                          ) : (
                              <div className="whitespace-pre-wrap text-zinc-300 font-mono bg-zinc-900 p-6 rounded-xl border border-zinc-800">
                                  {JSON.stringify(mem.content, null, 2)}
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          )
      }

      // List View
      const sortedMemories = useMemo(() => memories.slice().reverse(), [memories]);
      const visibleMemories = sortedMemories.slice(0, displayCount);

      return (
          <div className="p-4 md:p-8 h-full overflow-y-auto custom-scrollbar" onScroll={handleScroll}>
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
                {visibleMemories.map((mem) => (
                    <div 
                        key={mem.id} 
                        onClick={() => setExpandedMemoryId(mem.id)}
                        className="group bg-zinc-900/50 border border-zinc-800/50 p-5 rounded-xl hover:border-indigo-500/30 transition-all hover:bg-zinc-900 relative overflow-hidden cursor-pointer"
                    >
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
                    </div>
                ))}
                </div>
            )}
             {displayCount < memories.length && (
                 <div className="py-4 text-center text-zinc-600 text-xs">
                     Loading more memories...
                 </div>
             )}
          </div>
      );
  };

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
        return <MemoriesView />;

      case 'analytics':
          return (
            <AnalyticsDashboard 
                memories={memories} 
                onWordClick={(word) => {
                    setSearchQuery(word);
                    setActiveView('search');
                }}
            />
          );

      case 'search':
        return (
            <DeepSearch 
                worker={{ sendMessage }} 
                onInitVectors={initializeEngine} 
                isLoadingVectors={isLoadingVectors} 
                initialQuery={searchQuery}
                indexingProgress={indexingProgress}
                onNavigateToMemory={(id, highlight) => {
                    setExpandedMemoryId(id);
                    setHighlightTerm(highlight);
                    setActiveView('memories');
                }}
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
                onClick={() => { setActiveView('search'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'search' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            >
                <Search className="w-5 h-5" />
                <span className="text-sm font-medium">Deep Search</span>
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
                v1.3.0 • Local Intelligence
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