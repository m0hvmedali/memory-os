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
  Filter,
  Zap,
  Heart,
  Users,
  Crown,
  Sparkles,
  Copy,
  Check,
  Download,
  Loader2,
  HardDrive,
  Cpu,
  Database
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

// --- IndexedDB Layer ---
const DB_NAME = "MemoryOS_DB";
const STORE_NAME = "memories"; // Renamed from chunks to memories for clarity

const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 3); // Increment version
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
        pattern.test(part) ? <span key={index} className="px-1 font-bold text-indigo-950 rounded bg-amber-400">{part}</span> : part
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

        {emotion.branches && emotion.branches.length > 0 && (
          <div className="mb-6 relative z-10">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-rose-400">Branches</h4>
            <div className="flex flex-wrap gap-2">
              {emotion.branches.map((branch: string, index: number) => (
                <span key={index} className="px-3 py-1.5 text-xs text-rose-100 rounded-lg bg-rose-600/30 border border-rose-500/30">
                  {highlightText(branch, query)}
                </span>
              ))}
            </div>
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

    // Search Matching Logic
    const matchedIndices: number[] = [];
    messages.forEach((msg, index) => {
      const msgText = JSON.stringify(msg).toLowerCase();
      if (msgText.includes(searchTerm.toLowerCase())) {
        matchedIndices.push(index);
      }
    });

    let displayIndices = new Set<number>();
    matchedIndices.forEach(idx => {
      const start = Math.max(0, idx - 2);
      const end = Math.min(messages.length - 1, idx + 2);
      for (let i = start; i <= end; i++) displayIndices.add(i);
    });

    let displayMessages = Array.from(displayIndices).sort((a,b)=>a-b).map(i => messages[i]);

    if (displayMessages.length === 0 && messages.length > 0) {
      displayMessages = messages.slice(0, 5); // Show first 5 if no match
    }

    if (showAll) displayMessages = messages;
    if (windowMessages) displayMessages = windowMessages;

    const showContextAround = (msg: any) => {
      const idx = messages.indexOf(msg);
      const start = Math.max(0, idx - 5);
      const end = Math.min(messages.length, idx + 6);
      setWindowMessages(messages.slice(start, end));
    };

    const clearWindow = () => setWindowMessages(null);

    const formatTime = (timeStr: string) => {
      if (!timeStr) return '';
      return timeStr.replace(/T/, ' ').slice(0, 16);
    };

    return (
      <div className="mt-4 bg-[#0c0c0e] rounded-2xl border border-zinc-800 overflow-hidden" data-report-content>
        <div 
            className="flex justify-between items-center p-4 bg-zinc-900/80 border-b border-zinc-800 cursor-pointer hover:bg-zinc-900 transition-colors"
            onClick={() => setExpanded(!expanded)}
        >
          <h3 className="flex gap-2 items-center font-medium text-emerald-400">
            <MessageCircle className="w-4 h-4" /> {title}
          </h3>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded-full">{messages.length} msgs</span>
            {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </div>
        </div>

        {expanded && (
          <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar bg-zinc-950/50">
            {displayMessages.map((msg, index) => {
              const isMatch = JSON.stringify(msg).toLowerCase().includes(searchTerm.toLowerCase());
              // Generic sender check - customize based on your data "me" vs others
              const isMe = msg.sender && ['me', 'self', 'user', 'mohamed'].some(s => msg.sender.toLowerCase().includes(s));
              const messageText = msg.text || msg.message || msg.content || JSON.stringify(msg);

              return (
                <div key={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group animate-in slide-in-from-bottom-2`}>
                   {!isMe && (
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center mr-2 flex-shrink-0 text-xs text-zinc-400 font-bold">
                          {msg.sender ? msg.sender[0].toUpperCase() : '?'}
                      </div>
                   )}
                  <div className={`max-w-[85%] md:max-w-[70%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-md ${
                      isMe 
                      ? 'bg-emerald-700/20 border border-emerald-600/20 text-emerald-100 rounded-br-sm' 
                      : 'bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-bl-sm'
                    } ${isMatch ? 'ring-2 ring-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : ''}`}>
                    
                    {!isMe && <div className="text-[10px] font-bold text-zinc-500 mb-1">{msg.sender}</div>}

                    <div className="whitespace-pre-wrap break-words">
                      {highlightText(messageText, searchTerm)}
                    </div>
                    
                    <div className="flex items-center justify-between gap-4 mt-2 pt-2 border-t border-white/5">
                        <span className="text-[10px] text-white/30 font-mono">
                           {formatTime(msg.time || msg.date)}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isMatch && (
                                <button onClick={(e) => { e.stopPropagation(); showContextAround(msg); }} className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30">Context</button>
                            )}
                            <CopyButton text={messageText} fileName="msg.txt" />
                        </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {!showAll && !windowMessages && messages.length > displayMessages.length && (
                <button 
                    onClick={() => setShowAll(true)} 
                    className="w-full py-3 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-900/50 hover:bg-zinc-800 rounded-xl transition-all border border-dashed border-zinc-800"
                >
                  Load full conversation ({messages.length - displayMessages.length} more)
                </button>
            )}
             {windowMessages && (
              <div className="text-center">
                <button onClick={clearWindow} className="px-3 py-1 text-sm bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700">
                  Back to filtered view
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
};

const SmartSearchResults = ({ data, query }: { data: MemoryItem[], query: string }) => {
    if (!query) return null;

    const lowerQuery = query.toLowerCase().trim();
    const dossiers: any[] = [];

    // --- Scoring Algorithm ---
    data.forEach(item => {
        let relevance = 0;
        const content = item.content;
        
        // Handle array content (Chats)
        if (Array.isArray(content)) {
            // Check if any message matches
            const matches = content.filter(msg => JSON.stringify(msg).toLowerCase().includes(lowerQuery));
            if (matches.length > 0) {
                relevance += matches.length; // More matches = higher score
                dossiers.push({
                    subject: item.sourceFile.replace(/\.(json|txt)$/i, ''),
                    content: content, // Pass the full array
                    sourceFile: item.sourceFile,
                    relevanceScore: relevance + 10, // Bonus for being a chat with matches
                    type: 'conversation'
                });
            }
            return;
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

        // Generic string search in object
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
    });

    dossiers.sort((a, b) => b.relevanceScore - a.relevanceScore);

    if (dossiers.length === 0) {
        return (
            <div className="p-8 text-center rounded-2xl border border-amber-900/30 bg-amber-900/10 mt-10">
                <Shield className="w-12 h-12 text-amber-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-amber-500 mb-2">No Intel Found</h3>
                <p className="text-amber-200/60">No matching records for "<span className="text-amber-400">{query}</span>" in the memory bank.</p>
            </div>
        );
    }

    // Group by File/Category
    const sections: Record<string, any[]> = {};
    dossiers.forEach(d => {
        if (!sections[d.sourceFile]) sections[d.sourceFile] = [];
        sections[d.sourceFile].push(d);
    });

    return (
        <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
             {/* Summary Header */}
             <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center justify-between backdrop-blur-sm sticky top-0 z-20 shadow-xl">
                 <div className="flex items-center gap-3">
                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                     <span className="text-zinc-400 text-sm font-mono">
                         Found <span className="text-white font-bold">{dossiers.length}</span> records in <span className="text-white font-bold">{Object.keys(sections).length}</span> files
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
                         // Determine renderer based on content shape
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
                         if (Array.isArray(content) || item.type === 'conversation') {
                             return <ConversationView key={idx} messages={Array.isArray(content) ? content : (content.messages || [])} searchTerm={query} title={`Chat Log: ${item.subject}`} />;
                         }
                         
                         // GENERIC / TEXT
                         // Fallback for generic objects or text files
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
              
              // HEURISTIC: Is this a list of messages (Chat Log)?
              const isChatLog = Array.isArray(json) && json.length > 0 && (json[0].sender || json[0].message);
              
              if (isChatLog) {
                  // Save as ONE conversation item
                  itemsToAdd.push({
                      id: idBase,
                      sourceFile: file.name,
                      content: json,
                      timestamp: Date.now(),
                      type: 'conversation'
                  });
              } else if (Array.isArray(json)) {
                  // It's a list of items (e.g. People, Emotions)
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
                  // Single Object
                  itemsToAdd.push({
                      id: idBase,
                      sourceFile: file.name,
                      content: json,
                      timestamp: Date.now(),
                      type: 'unknown'
                  });
              }
          } else {
              // Plain Text / MD
              // Store as one big chunk or split? User prefers detailed reports.
              // Let's store as one item for now, simpler for "FileText" view
              itemsToAdd.push({
                  id: idBase,
                  sourceFile: file.name,
                  content: { text: text },
                  timestamp: Date.now(),
                  type: 'text'
              });
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
            Upload a folder of your <strong>.json</strong> data files (People, Chats, Journals) or <strong>.txt</strong> notes.
          </p>
        </div>
        <div className="px-4 py-2 bg-zinc-800 rounded-full text-xs font-mono text-zinc-400 group-hover:bg-indigo-900/20 group-hover:text-indigo-300 transition-colors">
            Local Parsing • No Cloud Upload
        </div>
      </div>
    </div>
  );
};

// --- Intelligence View (AI) ---

const IntelligenceView = () => {
    const [analysis, setAnalysis] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const analyze = async () => {
        setLoading(true);
        setError(null);
        try {
            const allMemories = await getAllMemories();
            // Random sample of text content for AI
            const sample = allMemories
                .sort(() => 0.5 - Math.random())
                .slice(0, 8)
                .map(m => {
                    if (m.type === 'conversation') return `Chat Log: ${JSON.stringify(m.content).slice(0, 200)}...`;
                    if (typeof m.content === 'string') return m.content;
                    return JSON.stringify(m.content);
                })
                .join("\n---\n");

            if (!sample) throw new Error("Memory bank is empty.");

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: "gemini-3-pro-preview",
                config: {
                    systemInstruction: "You are the Intelligence Officer of a Memory OS. Analyze these random data fragments from the user's life. Construct a psychological profile or find hidden connections. Be deep, slightly cryptic, and very insightful."
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
                        The system is ready to dream. Initiate a deep scan to find correlations between your chats, people, and emotions.
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
                            placeholder="Enter keyword to generate report..." 
                            className="w-full bg-transparent border-none py-5 px-4 text-lg text-white placeholder:text-zinc-600 focus:ring-0 outline-none font-medium"
                            autoFocus
                        />
                         {query && (
                            <button onClick={() => setQuery('')} className="mr-4 text-zinc-500 hover:text-white">
                                <span className="sr-only">Clear</span>
                                <div className="bg-zinc-800 rounded-full p-1"><Check className="w-3 h-3" /></div>
                            </button>
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
                             <div className="flex items-center justify-center h-64">
                                 <Loader2 className="w-8 h-8 animate-spin text-zinc-600" />
                             </div>
                        ) : (
                            <>
                                {query ? (
                                    <SmartSearchResults data={allMemories} query={query} />
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
                                 <p className="text-zinc-400">Load your external brain. Supports JSON dumps of chats, people lists, and journals.</p>
                             </div>
                             <FileUpload onProcessed={() => {}} />
                             <div className="mt-12 grid grid-cols-2 gap-4">
                                 <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                     <div className="text-emerald-400 font-mono text-xs mb-2">SUPPORTED FORMATS</div>
                                     <div className="text-zinc-300 text-sm">.JSON, .TXT, .MD</div>
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
