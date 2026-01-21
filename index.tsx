import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
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
  RefreshCw
} from "lucide-react";

// --- Types ---

interface MemoryItem {
  id: string;
  sourceFile: string;
  // content can be a Person object, an Emotion object, a Conversation array, or a simple Text object
  content: any; 
  timestamp: number;
  type?: 'person' | 'emotion' | 'conversation' | 'text' | 'unknown';
}

interface IntelligenceDossier {
    subject: string;
    content: any;
    sourceFile: string;
    relevanceScore: number;
    type: string;
}

// --- IndexedDB Layer ---
const DB_NAME = "MemoryOS_DB";
const STORE_NAME = "memories"; 

const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 4); // Increment version for schema updates if needed
  request.onupgradeneeded = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function saveMemories(items: MemoryItem[]) {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  items.forEach(item => store.put(item));
  return new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
  });
}

async function getAllMemories(): Promise<MemoryItem[]> {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

async function clearMemories() {
    const db = await dbPromise;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    return new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
}

// --- Parsing Logic (WhatsApp) ---

function parseWhatsAppLogs(text: string): any[] | null {
    // Regex for: "14/08/24, 5:56 pm - Sender Name: Message Content"
    // Handles various date formats (dd/mm/yy, mm/dd/yy) and unicode characters in names
    const regex = /^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),\s*(\d{1,2}:\d{2}\s?(?:[aApP][mM])?)\s*-\s*([^:]+):\s*(.+)/;
    
    const lines = text.split('\n');
    const messages: any[] = [];
    let currentMessage: any = null;

    let matchCount = 0;

    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            matchCount++;
            // Save previous message if exists
            if (currentMessage) {
                messages.push(currentMessage);
            }
            // Start new message
            currentMessage = {
                date: match[1],
                time: match[2],
                sender: match[3].trim(),
                message: match[4].trim(),
                original: line
            };
        } else {
            // Multiline message support
            if (currentMessage) {
                currentMessage.message += "\n" + line;
            }
        }
    }
    
    if (currentMessage) {
        messages.push(currentMessage);
    }

    // Heuristic: If we parsed a significant number of lines successfully, it's a chat log
    if (matchCount > 0 && messages.length > 0) {
        return messages;
    }
    
    return null;
}

// --- Helper Components ---

const CopyButton = ({ text, fileName }: { text: string, fileName?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // If text is object, stringify it
    const val = typeof text === 'object' ? JSON.stringify(text, null, 2) : text;
    navigator.clipboard.writeText(val).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className={`px-3 py-1 text-xs rounded flex items-center gap-1 transition-all ${
        copied ? 'text-white bg-green-600' : 'text-white bg-blue-600 hover:bg-blue-500'
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};

// --- Smart Report Logic & Components ---

const highlightText = (text: any, highlight: string) => {
    if (text === null || text === undefined) return '';
    if (typeof text !== 'string') text = String(text);
    if (!highlight || !highlight.trim()) return text;

    try {
      const pattern = new RegExp(`(${String(highlight).replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\\\$&')})`, 'gi');
      const parts = text.split(pattern);
      return parts.map((part: string, index: number) =>
        pattern.test(part) ? <span key={index} className="bg-yellow-500/40 text-yellow-100 font-bold px-1 rounded">{part}</span> : part
      );
    } catch (e) {
      return text;
    }
};

const PersonCard = ({ person, query }: { person: any, query: string }) => {
    return (
      <div className="p-6 bg-gradient-to-br from-indigo-900/40 to-violet-900/40 rounded-2xl border border-indigo-500/30 shadow-lg relative overflow-hidden group" data-report-content>
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <User className="w-24 h-24 text-indigo-400" />
        </div>
        <div className="flex gap-4 items-center mb-6 relative z-10">
          <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-900/50">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white tracking-tight">{highlightText(person.name, query)}</h3>
            <p className="text-indigo-300 font-medium">{person.relationship_to_user || "Contact"}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 relative z-10">
          {person.age && (
            <div className="flex gap-2 items-center bg-indigo-950/50 p-2 rounded-lg border border-indigo-500/20">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span className="text-sm text-gray-300">Age: {person.age}</span>
            </div>
          )}
        </div>

        {person.traits && person.traits.length > 0 && (
          <div className="mb-6 relative z-10">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-indigo-400">Traits</h4>
            <div className="flex flex-wrap gap-2">
              {person.traits.map((trait: string, index: number) => (
                <span key={index} className="px-3 py-1.5 text-xs font-medium text-indigo-100 rounded-lg bg-indigo-600/30 border border-indigo-500/30">
                  {highlightText(trait, query)}
                </span>
              ))}
            </div>
          </div>
        )}

        {person.background && (
          <div className="mb-4 relative z-10">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-indigo-400">Background</h4>
            <p className="text-sm leading-relaxed text-indigo-100/80 bg-indigo-950/30 p-4 rounded-xl border border-indigo-500/10">
                {highlightText(person.background, query)}
            </p>
          </div>
        )}

        <div className="flex gap-2 mt-4 relative z-10">
          <CopyButton text={person} fileName={`person-${person.name}.json`} />
        </div>
      </div>
    );
};

const EmotionCard = ({ emotion, query }: { emotion: any, query: string }) => {
    return (
      <div className="p-6 bg-gradient-to-br from-rose-900/40 to-pink-900/40 rounded-2xl border border-rose-500/30 shadow-lg relative overflow-hidden group" data-report-content>
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Heart className="w-24 h-24 text-rose-400" />
        </div>
        <div className="flex gap-4 items-center mb-6 relative z-10">
          <div className="p-3 bg-rose-600 rounded-2xl shadow-lg shadow-rose-900/50">
            <Heart className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white tracking-tight">{highlightText(emotion.name, query)} <span className="text-lg opacity-70 font-normal">({emotion.english_name})</span></h3>
            <p className="text-rose-300 font-medium">{emotion.family} • {emotion.type}</p>
          </div>
        </div>

        {emotion.definition && (
          <div className="mb-6 relative z-10">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-rose-400">Definition</h4>
            <p className="text-sm leading-relaxed text-rose-100/90 italic bg-rose-950/30 p-4 rounded-xl border border-rose-500/10">
                "{highlightText(emotion.definition, query)}"
            </p>
          </div>
        )}

        <div className="flex gap-2 mt-4 relative z-10">
          <CopyButton text={emotion} fileName={`emotion-${emotion.name}.json`} />
        </div>
      </div>
    );
};

const ConversationView = ({ messages, searchTerm, title }: { messages: any[], searchTerm: string, title: string }) => {
    const [expanded, setExpanded] = useState(true);
    const [showAll, setShowAll] = useState(false);
    const [windowMessages, setWindowMessages] = useState<any[] | null>(null);

    // Filter messages that contain the search term
    const matchedIndices: number[] = [];
    messages.forEach((msg, index) => {
      const msgText = (msg.message || msg.text || JSON.stringify(msg)).toLowerCase();
      if (msgText.includes(searchTerm.toLowerCase())) {
        matchedIndices.push(index);
      }
    });

    // Create a set of indices to display (match + context)
    let displayIndices = new Set<number>();
    matchedIndices.forEach(idx => {
      const start = Math.max(0, idx - 2);
      const end = Math.min(messages.length - 1, idx + 2);
      for (let i = start; i <= end; i++) displayIndices.add(i);
    });

    let displayMessages = Array.from(displayIndices).sort((a,b)=>a-b).map(i => messages[i]);

    if (displayMessages.length === 0 && messages.length > 0) {
      // Fallback: Show latest messages if no match found
      displayMessages = messages.slice(-5);
    }

    if (showAll) displayMessages = messages;
    if (windowMessages) displayMessages = windowMessages;

    const showContextAround = (msg: any) => {
      const idx = messages.indexOf(msg);
      const start = Math.max(0, idx - 10);
      const end = Math.min(messages.length, idx + 10);
      setWindowMessages(messages.slice(start, end));
    };

    const clearWindow = () => setWindowMessages(null);

    return (
      <div className="mt-4 bg-[#0c0c0e] rounded-2xl border border-zinc-800 overflow-hidden" data-report-content>
        <div 
            className="flex justify-between items-center p-4 bg-zinc-900/80 border-b border-zinc-800 cursor-pointer hover:bg-zinc-900 transition-colors"
            onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
             <div className="bg-emerald-500/20 p-2 rounded-full">
                <MessageCircle className="w-4 h-4 text-emerald-400" />
             </div>
             <div>
                 <h3 className="font-medium text-zinc-200 text-sm">{title}</h3>
                 <p className="text-[10px] text-zinc-500">{messages.length} messages found</p>
             </div>
          </div>
          <div className="flex gap-2 items-center">
            {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </div>
        </div>

        {expanded && (
          <div className="p-4 space-y-3 bg-[#050505] max-h-[600px] overflow-y-auto custom-scrollbar">
            {displayMessages.map((msg, index) => {
               // Normalization
               const text = msg.message || msg.text || msg.content || "";
               const sender = msg.sender || "Unknown";
               const time = msg.time || msg.date || "";
               
               const isMatch = text.toLowerCase().includes(searchTerm.toLowerCase());
               // Heuristic to detect "Me"
               const isMe = ['me', 'self', 'user', 'mohamed'].some(s => sender.toLowerCase().includes(s));
               
              return (
                <div key={index} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'} group`}>
                   {!isMe && (
                      <div className="flex-shrink-0 mr-2 mt-auto">
                           <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                               {sender[0].toUpperCase()}
                           </div>
                      </div>
                   )}
                   
                  <div className={`relative max-w-[85%] md:max-w-[70%] px-4 py-2 rounded-2xl text-sm leading-relaxed shadow-sm transition-all ${
                      isMe 
                      ? 'bg-emerald-600 text-white rounded-br-sm' 
                      : 'bg-zinc-800 text-zinc-200 rounded-bl-sm'
                    } ${isMatch ? 'ring-2 ring-yellow-400/70 shadow-[0_0_15px_rgba(250,204,21,0.2)]' : ''}`}>
                    
                    {!isMe && <div className="text-[10px] font-bold text-zinc-400 mb-0.5 opacity-80">{sender}</div>}

                    <div className="whitespace-pre-wrap break-words">
                      {highlightText(text, searchTerm)}
                    </div>
                    
                    <div className={`flex items-center justify-end gap-2 mt-1 ${isMe ? 'text-emerald-200' : 'text-zinc-500'}`}>
                        <span className="text-[9px] font-mono opacity-70">
                           {time}
                        </span>
                    </div>

                    {/* Context Menu on Hover */}
                    <div className={`absolute top-0 ${isMe ? '-left-16' : '-right-16'} h-full flex items-center opacity-0 group-hover:opacity-100 transition-opacity px-2`}>
                        {isMatch && (
                             <button 
                                onClick={(e) => { e.stopPropagation(); showContextAround(msg); }} 
                                className="p-1.5 bg-zinc-800 rounded-full hover:bg-zinc-700 text-zinc-300"
                                title="Show Context"
                             >
                                <RefreshCw className="w-3 h-3" />
                             </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}

            {!showAll && !windowMessages && messages.length > displayMessages.length && (
                <div className="pt-4 flex justify-center">
                    <button 
                        onClick={() => setShowAll(true)} 
                        className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-full transition-all border border-zinc-800"
                    >
                    Load full conversation ({messages.length - displayMessages.length} remaining)
                    </button>
                </div>
            )}
             {windowMessages && (
              <div className="text-center sticky bottom-0 py-2">
                <button onClick={clearWindow} className="px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-full hover:bg-indigo-500 shadow-lg">
                  Return to Filtered View
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
};

// --- Report Generation Logic (Moved out of component for perf) ---

function generateIntelligenceReport(data: MemoryItem[], query: string): IntelligenceDossier[] {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return [];

    const dossiers: IntelligenceDossier[] = [];

    // --- Scoring Algorithm ---
    for (const item of data) {
        let relevance = 0;
        const content = item.content;
        
        // Handle array content (Chats)
        if (Array.isArray(content) || item.type === 'conversation') {
            const msgs = Array.isArray(content) ? content : (content.messages || []);
            // Check if any message matches
            const matchCount = msgs.reduce((acc: number, msg: any) => {
                const txt = msg.message || msg.text || "";
                return txt.toLowerCase().includes(lowerQuery) ? acc + 1 : acc;
            }, 0);

            if (matchCount > 0) {
                dossiers.push({
                    subject: item.sourceFile.replace(/\.(json|txt)$/i, ''),
                    content: msgs,
                    sourceFile: item.sourceFile,
                    relevanceScore: matchCount * 2 + 10,
                    type: 'conversation'
                });
            }
            continue;
        }

        // Handle Object content
        const subjectName = content.name || content.title || content.sender || item.sourceFile;
        const importantFields = { name: 10, title: 8, content: 7, message: 7, text: 6, definition: 8, background: 5 };

        Object.entries(importantFields).forEach(([field, weight]) => {
            if (content[field] && typeof content[field] === 'string') {
                const val = content[field].toLowerCase();
                if (val === lowerQuery) relevance += weight * 3;
                else if (val.startsWith(lowerQuery)) relevance += weight * 2;
                else if (val.includes(lowerQuery)) relevance += weight;
            }
        });

        const str = JSON.stringify(content).toLowerCase();
        if (str.includes(lowerQuery)) relevance += 1;

        if (relevance > 0) {
            dossiers.push({
                subject: subjectName,
                content: content,
                sourceFile: item.sourceFile,
                relevanceScore: relevance,
                type: item.type || 'unknown'
            });
        }
    }

    return dossiers.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

const SmartSearchResults = ({ results, query }: { results: IntelligenceDossier[], query: string }) => {
    if (!results || results.length === 0) {
        return (
            <div className="p-8 text-center rounded-2xl border border-zinc-800 bg-zinc-900/30 mt-10 animate-in fade-in zoom-in-95">
                <Shield className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-zinc-400 mb-2">No Intel Found</h3>
                <p className="text-zinc-600">No matching records for "<span className="text-zinc-300">{query}</span>"</p>
            </div>
        );
    }

    // Group by File/Category
    const sections: Record<string, IntelligenceDossier[]> = {};
    results.forEach(d => {
        if (!sections[d.sourceFile]) sections[d.sourceFile] = [];
        sections[d.sourceFile].push(d);
    });

    return (
        <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
             {/* Summary Header */}
             <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl flex items-center justify-between backdrop-blur-md sticky top-0 z-30 shadow-2xl">
                 <div className="flex items-center gap-3">
                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                     <span className="text-zinc-400 text-sm font-mono">
                         Found <span className="text-white font-bold">{results.length}</span> dossiers
                     </span>
                 </div>
                 <button onClick={() => {
                     const element = document.getElementById('report-end');
                     element?.scrollIntoView({ behavior: 'smooth' });
                 }} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                     <ChevronDown className="w-4 h-4" />
                 </button>
             </div>

             {/* Sections */}
             {Object.entries(sections).map(([fileName, items], sIdx) => (
                 <div key={fileName} className="space-y-4">
                     <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono uppercase tracking-widest pl-2 border-l-2 border-indigo-500/50">
                        <Folder className="w-3 h-3" />
                        {fileName}
                     </div>

                     {items.map((item, idx) => {
                         const content = item.content;
                         
                         // PERSON
                         if (content.name && (content.relationship_to_user || content.traits)) {
                             return <PersonCard key={idx} person={content} query={query} />;
                         }
                         // EMOTION
                         if (content.name && (content.family || content.english_name)) {
                            return <EmotionCard key={idx} emotion={content} query={query} />;
                         }
                         // CONVERSATION
                         if (item.type === 'conversation' || Array.isArray(content)) {
                             return <ConversationView key={idx} messages={content} searchTerm={query} title={`Chat Log: ${item.subject}`} />;
                         }
                         
                         // GENERIC / TEXT
                         const textVal = typeof content === 'string' ? content : (content.text || content.content || JSON.stringify(content, null, 2));
                         
                         return (
                            <div key={idx} className="p-5 bg-zinc-900 rounded-2xl border border-zinc-800 hover:border-zinc-700 transition-all group">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-zinc-800 rounded-lg">
                                        <FileText className="w-4 h-4 text-zinc-400" />
                                    </div>
                                    <span className="font-semibold text-zinc-300">{item.subject}</span>
                                </div>
                                <div className="text-sm text-zinc-400 leading-relaxed font-mono whitespace-pre-wrap bg-black/30 p-4 rounded-xl border border-white/5">
                                    {highlightText(textVal, query)}
                                </div>
                                <div className="mt-3 flex justify-end">
                                    <CopyButton text={textVal} />
                                </div>
                            </div>
                         );
                     })}
                 </div>
             ))}

             <div id="report-end" className="text-center py-8 opacity-50">
                 <div className="w-16 h-1 bg-zinc-800 mx-auto rounded-full mb-4" />
                 <p className="text-xs text-zinc-600">End of Intelligence Report</p>
             </div>
        </div>
    );
}

// --- File Upload Ingestion Logic ---

const FileUpload = ({ onProcessed }: { onProcessed: (count: number) => void }) => {
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setProcessing(true);
    
    const itemsToAdd: MemoryItem[] = [];

    for (let i = 0; i < e.target.files.length; i++) {
      const file = e.target.files[i];
      if (!file.name.match(/\.(txt|md|json|log)$/i)) continue;

      const text = await file.text();
      const idBase = `${file.name}_${Date.now()}`;

      try {
          if (file.name.endsWith('.json')) {
              const json = JSON.parse(text);
              // JSON logic... (same as before, mostly)
              const isChatLog = Array.isArray(json) && json.length > 0 && (json[0].sender || json[0].message);
              
              if (isChatLog) {
                  itemsToAdd.push({
                      id: idBase,
                      sourceFile: file.name,
                      content: json,
                      timestamp: Date.now(),
                      type: 'conversation'
                  });
              } else if (Array.isArray(json)) {
                  json.forEach((item, idx) => {
                       itemsToAdd.push({
                          id: `${idBase}_${idx}`,
                          sourceFile: file.name,
                          content: item,
                          timestamp: Date.now(),
                          type: item.name ? (item.relationship_to_user ? 'person' : 'emotion') : 'unknown'
                       });
                  });
              } else {
                  itemsToAdd.push({
                      id: idBase,
                      sourceFile: file.name,
                      content: json,
                      timestamp: Date.now(),
                      type: 'unknown'
                  });
              }
          } else {
              // Plain Text Handling
              
              // 1. Try Parsing as WhatsApp Log
              const parsedChat = parseWhatsAppLogs(text);
              
              if (parsedChat) {
                  console.log(`Parsed ${file.name} as WhatsApp Log with ${parsedChat.length} messages.`);
                  itemsToAdd.push({
                      id: idBase,
                      sourceFile: file.name,
                      content: parsedChat,
                      timestamp: Date.now(),
                      type: 'conversation'
                  });
              } else {
                  // 2. Fallback to generic text
                  itemsToAdd.push({
                      id: idBase,
                      sourceFile: file.name,
                      content: { text: text },
                      timestamp: Date.now(),
                      type: 'text'
                  });
              }
          }
      } catch (err) {
          console.warn(`Failed to parse ${file.name}, treating as text.`);
          itemsToAdd.push({
              id: idBase,
              sourceFile: file.name,
              content: { text: text },
              timestamp: Date.now(),
              type: 'text'
          });
      }
    }

    await saveMemories(itemsToAdd);
    onProcessed(itemsToAdd.length);
    window.location.reload(); 
    setProcessing(false);
  };

  return (
    <div className="p-10 border border-zinc-800 border-dashed rounded-3xl bg-zinc-900/30 text-center hover:bg-zinc-900/50 transition-all duration-300 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
      <input 
        type="file" 
        multiple 
        // @ts-ignore
        webkitdirectory=""
        directory=""
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFiles} 
      />
      <div className="flex flex-col items-center justify-center gap-6">
        <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform shadow-2xl shadow-black">
             {processing ? (
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
             ) : (
                <HardDrive className="w-8 h-8 text-indigo-400" />
             )}
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-medium text-white">Import Memory Bank</h3>
          <p className="text-zinc-500 max-w-sm mx-auto">
            Upload a folder of your <strong>.json</strong> data or <strong>WhatsApp exports (.txt)</strong>.
          </p>
        </div>
        <div className="px-4 py-2 bg-zinc-800 rounded-full text-xs font-mono text-zinc-400 group-hover:bg-indigo-900/20 group-hover:text-indigo-300 transition-colors">
            Auto-Detects Chats & People
        </div>
      </div>
    </div>
  );
};

// --- Intelligence View (AI) ---
// (No changes needed for AI view, keeping previous code implicitly)
const IntelligenceView = () => {
    const [analysis, setAnalysis] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const analyze = async () => {
        setLoading(true);
        setError(null);
        try {
            const allMemories = await getAllMemories();
            const sample = allMemories
                .sort(() => 0.5 - Math.random())
                .slice(0, 8)
                .map(m => {
                    if (m.type === 'conversation') {
                        // Handle array content safe check
                        const content = Array.isArray(m.content) ? m.content : [];
                        return `Chat Log: ${JSON.stringify(content.slice(0, 5))}...`;
                    }
                    if (typeof m.content === 'string') return m.content;
                    return JSON.stringify(m.content);
                })
                .join("\n---\n");

            if (!sample) throw new Error("Memory bank is empty.");

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: "gemini-3-pro-preview",
                config: {
                    systemInstruction: "You are the Intelligence Officer of a Memory OS. Analyze these random data fragments. Construct a psychological profile or find hidden connections."
                },
                contents: `Data Fragments:\n${sample}`
            });

            setAnalysis(response.text ?? null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-3xl mx-auto min-h-full flex flex-col">
            <div className="flex items-center gap-4 mb-8 pb-8 border-b border-zinc-800">
                <div className="p-3 bg-purple-900/20 rounded-xl border border-purple-500/20">
                    <Sparkles className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white">Neural Analysis</h2>
                    <p className="text-zinc-500">Pattern recognition across disparate memory nodes.</p>
                </div>
            </div>
            
            {!analysis && !loading && (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 opacity-80">
                    <Cpu className="w-24 h-24 text-zinc-800" />
                    <p className="text-zinc-500 max-w-md">
                        The system is ready to dream. Initiate a deep scan to find correlations.
                    </p>
                    <button 
                        onClick={analyze}
                        className="px-8 py-4 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform shadow-xl shadow-white/10"
                    >
                        Initiate Sequence
                    </button>
                </div>
            )}

            {loading && (
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-8"></div>
                    <p className="text-purple-400 animate-pulse font-mono">Running Inference...</p>
                </div>
            )}

            {analysis && (
                <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
                    <div className="prose prose-invert prose-purple max-w-none">
                        <div className="whitespace-pre-wrap leading-relaxed text-zinc-300 font-serif text-lg">
                            {analysis}
                        </div>
                    </div>
                    <div className="mt-8 pt-6 border-t border-zinc-800 flex justify-between items-center">
                         <span className="text-xs text-zinc-600 font-mono">Generated by Gemini 3 Pro</span>
                         <button onClick={() => setAnalysis(null)} className="text-zinc-400 hover:text-white text-sm">Clear Report</button>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Main App ---

function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'import' | 'ai'>('search');
  const [query, setQuery] = useState("");
  const [allMemories, setAllMemories] = useState<MemoryItem[]>([]);
  const [loadingDB, setLoadingDB] = useState(true);
  
  // Search States
  const [searchState, setSearchState] = useState<{ results: IntelligenceDossier[], isSearching: boolean }>({
      results: [],
      isSearching: false
  });
  
  // Debounce and Async Search Logic
  useEffect(() => {
      if (!query.trim()) {
          setSearchState({ results: [], isSearching: false });
          return;
      }

      setSearchState(prev => ({ ...prev, isSearching: true }));

      const timeoutId = setTimeout(() => {
          // Wrap heavy calculation in another timeout to allow UI to render the 'isSearching' state first
          setTimeout(() => {
              const results = generateIntelligenceReport(allMemories, query);
              setSearchState({ results, isSearching: false });
          }, 10);
      }, 600); // 600ms debounce

      return () => clearTimeout(timeoutId);
  }, [query, allMemories]);

  // Initial Load
  useEffect(() => {
      getAllMemories().then(data => {
          setAllMemories(data);
          setLoadingDB(false);
      });
  }, []);

  // Handle Tab Switch / Reload
  const handleTabChange = (tab: any) => {
      setActiveTab(tab);
      if (tab === 'search') {
         getAllMemories().then(setAllMemories); // Refresh in case of new imports
      }
  };

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-200 font-sans selection:bg-indigo-500/30 overflow-hidden">
      {/* Sidebar */}
      <div className="w-20 md:w-72 bg-[#09090b] border-r border-zinc-800 flex flex-col py-6 z-50 flex-shrink-0">
        <div className="px-6 mb-10 flex items-center gap-4">
          <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 shadow-inner">
             <Brain className="w-5 h-5 text-white" />
          </div>
          <div className="hidden md:block">
            <h1 className="font-bold text-lg tracking-tight text-white">Memory OS</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Personal Archives</p>
          </div>
        </div>
        
        <nav className="flex-1 space-y-2 px-4">
          {[
            { id: 'search', icon: Search, label: 'Investigation' },
            { id: 'import', icon: Database, label: 'Data Source' },
            { id: 'ai', icon: Cpu, label: 'Neural Core' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden ${
                activeTab === item.id 
                ? 'bg-white text-black shadow-xl shadow-white/10' 
                : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
              }`}
            >
              <item.icon className={`w-5 h-5 relative z-10 ${activeTab === item.id ? 'text-black' : ''}`} />
              <span className="hidden md:block font-medium tracking-wide text-sm relative z-10">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-6 mt-auto hidden md:block">
             <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                 <div className="flex justify-between items-center mb-2">
                     <span className="text-xs text-zinc-500">Storage</span>
                     <span className="text-xs text-white font-mono">{allMemories.length} items</span>
                 </div>
                 <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                     <div className="h-full bg-indigo-500 w-3/4 opacity-50"></div>
                 </div>
             </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        
        {/* Top Search Bar (Only visible in Search Tab) */}
        {activeTab === 'search' && (
            <div className="flex-shrink-0 p-6 md:p-8 z-20 bg-[#09090b]/80 backdrop-blur-xl border-b border-zinc-800/50">
                <div className="max-w-4xl mx-auto relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 rounded-2xl opacity-20 blur transition duration-500 group-hover:opacity-40"></div>
                    <div className="relative flex items-center bg-[#0c0c0e] rounded-xl border border-zinc-800 shadow-2xl">
                        <Search className="w-5 h-5 text-zinc-500 ml-5" />
                        <input 
                            type="text" 
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Enter keyword to investigate..." 
                            className="w-full bg-transparent border-none py-5 px-4 text-lg text-white placeholder:text-zinc-600 focus:ring-0 outline-none font-medium"
                            autoFocus
                        />
                         {searchState.isSearching ? (
                            <div className="mr-5">
                                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                            </div>
                         ) : (
                             query && (
                                <button onClick={() => setQuery('')} className="mr-4 text-zinc-500 hover:text-white">
                                    <div className="bg-zinc-800 rounded-full p-1"><Check className="w-3 h-3" /></div>
                                </button>
                            )
                         )}
                    </div>
                </div>
            </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative p-6 md:p-8">
            
            {/* Background Effects */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[120px] mix-blend-screen" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-600/5 rounded-full blur-[100px] mix-blend-screen" />
            </div>

            <div className="max-w-4xl mx-auto relative z-10 min-h-full">
                {activeTab === 'search' && (
                    <>
                        {loadingDB ? (
                             <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                                 <Loader2 className="w-8 h-8 animate-spin mb-4" />
                                 <p className="text-sm">Decrypting Archives...</p>
                             </div>
                        ) : (
                            <>
                                {query ? (
                                    searchState.isSearching ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 animate-in fade-in">
                                            <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                                            <p className="font-mono text-xs tracking-widest uppercase">Analyzing Data Stream...</p>
                                        </div>
                                    ) : (
                                        <SmartSearchResults results={searchState.results} query={query} />
                                    )
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-[50vh] text-center opacity-40">
                                        <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mb-6 border border-zinc-800">
                                            <Shield className="w-10 h-10 text-zinc-600" />
                                        </div>
                                        <h2 className="text-2xl font-bold text-zinc-300 mb-2">Secure Archives Locked</h2>
                                        <p className="text-zinc-500">Enter authorization keyword to access classified memories.</p>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                {activeTab === 'import' && (
                     <div className="flex flex-col items-center justify-center h-full">
                         <div className="w-full max-w-2xl">
                             <div className="text-center mb-12">
                                 <h2 className="text-3xl font-bold text-white mb-4">Ingest Data</h2>
                                 <p className="text-zinc-400">Load your external brain. Supports JSON dumps and <strong>WhatsApp .txt exports</strong>.</p>
                             </div>
                             <FileUpload onProcessed={() => {}} />
                             <div className="mt-12 grid grid-cols-2 gap-4">
                                 <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                     <div className="text-emerald-400 font-mono text-xs mb-2">SUPPORTED FORMATS</div>
                                     <div className="text-zinc-300 text-sm">.JSON, .TXT (WhatsApp)</div>
                                 </div>
                                 <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                     <div className="text-purple-400 font-mono text-xs mb-2">PRIVACY</div>
                                     <div className="text-zinc-300 text-sm">100% Client-Side</div>
                                 </div>
                             </div>
                             <div className="mt-8 text-center">
                                 <button onClick={async () => {
                                     if (confirm('Are you sure you want to wipe all memory?')) {
                                         await clearMemories();
                                         window.location.reload();
                                     }
                                 }} className="text-red-900/50 hover:text-red-500 text-xs font-mono transition-colors">
                                     Danger: Wipe All Data
                                 </button>
                             </div>
                         </div>
                     </div>
                )}

                {activeTab === 'ai' && <IntelligenceView />}
            </div>
        </div>
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
