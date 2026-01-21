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

// Smart chunking for unstructured text
function chunkTextSmartly(text: string, maxChars = 1000): string[] {
    // 1. Split by paragraphs (double newlines often indicate semantic breaks)
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = "";

    for (const para of paragraphs) {
        const cleanPara = para.trim();
        if (!cleanPara) continue;

        // If simple addition exceeds maxChars
        if (currentChunk.length + cleanPara.length > maxChars && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
        }

        // Handle massive paragraphs (longer than maxChars)
        if (cleanPara.length > maxChars) {
            // Push any pending content first
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = "";
            }
            
            // Split massive paragraph by sentences using regex
            // This regex looks for punctuation (.!?) followed by space or end of string
            const sentences = cleanPara.match(/[^.!?]+[.!?]+(\s+|$)/g) || [cleanPara];
            
            for (const sentence of sentences) {
                if (currentChunk.length + sentence.length > maxChars && currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = "";
                }
                currentChunk += sentence;
            }
        } else {
            currentChunk += cleanPara + "\n\n";
        }
    }

    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
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
              // Dynamic chunking for plain text files
              const chunks = chunkTextSmartly(text);
              chunks.forEach((chunk, index) => {
                   itemsToAdd.push({
                      id: `${idBase}_part_${index}`,
                      sourceFile: fileName,
                      content: { 
                          text: chunk,
                          chunkIndex: index,
                          totalChunks: chunks.length
                      },
                      timestamp: Date.now(),
                      type: 'text'
                  });
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