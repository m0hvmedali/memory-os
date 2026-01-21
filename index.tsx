import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import {
  Book,
  Search,
  Users,
  Calendar,
  Sparkles,
  Database,
  Upload,
  FileText,
  Loader2,
  Cpu,
  HardDrive,
  Brain,
  Menu,
  X,
  Clock,
  Hash
} from "lucide-react";

// --- Types ---

interface Chunk {
  id: string;
  fileId: string;
  fileName: string;
  content: string;
  timestamp: number;
  wordCount: number; // Added wordCount
}

interface SearchResult {
  id: string;
  score: number;
  matchType: 'exact' | 'fuzzy';
}

// --- Worker Code (Inlined) ---
// This acts as the "Search Engine Backend" running in a separate thread.
const WORKER_CODE = `
  // --- Constants ---
  const STOP_WORDS = new Set(["a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from", "further", "had", "has", "have", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "it", "it's", "its", "itself", "let's", "me", "more", "most", "my", "myself", "nor", "of", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "she", "she'd", "she'll", "she's", "should", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "we'd", "we'll", "we're", "we've", "were", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "would", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"]);

  // --- State ---
  // Inverted Index: Map<Word, Map<ChunkID, Frequency>>
  let index = new Map();
  // Document Lengths: Map<ChunkID, WordCount> (for normalization)
  let docLengths = new Map();
  // Total number of chunks indexed
  let totalDocs = 0;

  // --- Helpers ---
  function tokenize(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\\s]/g, '') // Remove punctuation
      .split(/\\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  }

  // --- Handlers ---
  self.onmessage = function(e) {
    const { type, payload, id } = e.data;

    try {
      if (type === 'INDEX_CHUNK') {
        const { chunkId, content } = payload;
        const tokens = tokenize(content);
        
        if (docLengths.has(chunkId)) {
           // Already indexed, naive update: skip or clear first
           // For MVP we assume immutable chunks or simple append
           return; 
        }

        docLengths.set(chunkId, tokens.length);
        totalDocs++;

        const termFreqs = new Map(); // Term -> Freq in this doc
        tokens.forEach(t => {
          termFreqs.set(t, (termFreqs.get(t) || 0) + 1);
        });

        // Update Global Index
        for (const [term, freq] of termFreqs) {
          if (!index.has(term)) {
            index.set(term, new Map());
          }
          index.get(term).set(chunkId, freq);
        }

        self.postMessage({ type: 'INDEX_COMPLETE', id });
      } 
      
      else if (type === 'SEARCH') {
        const query = payload;
        const queryTokens = tokenize(query);
        const chunkScores = new Map(); // ChunkID -> Score

        if (queryTokens.length === 0) {
           self.postMessage({ type: 'SEARCH_RESULTS', payload: [], id });
           return;
        }

        // TF-IDF Scoring
        for (const token of queryTokens) {
          if (index.has(token)) {
            const docsWithTerm = index.get(token); // Map<ChunkID, Freq>
            const idf = Math.log(totalDocs / (docsWithTerm.size || 1));

            for (const [chunkId, freq] of docsWithTerm) {
              const tf = freq / (docLengths.get(chunkId) || 1);
              const score = tf * idf;
              chunkScores.set(chunkId, (chunkScores.get(chunkId) || 0) + score);
            }
          }
        }

        // Convert to array and sort
        const results = Array.from(chunkScores.entries())
          .map(([id, score]) => ({ id, score, matchType: 'fuzzy' }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 50); // Top 50

        self.postMessage({ type: 'SEARCH_RESULTS', payload: results, id });
      }

      else if (type === 'RESET') {
        index = new Map();
        docLengths = new Map();
        totalDocs = 0;
        self.postMessage({ type: 'RESET_COMPLETE', id });
      }
    } catch (err) {
      console.error("Worker Error:", err);
    }
  };
`;

// --- IndexedDB Layer ---
const DB_NAME = "MemoryOS_DB";
const STORE_NAME = "chunks";

const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 2); // Incremented version for schema changes if needed
  request.onupgradeneeded = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function saveChunks(chunks: Chunk[]) {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  chunks.forEach(chunk => store.put(chunk));
  return new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
  });
}

async function getChunks(ids: string[]): Promise<Chunk[]> {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const promises = ids.map(id => 
    new Promise<Chunk | undefined>((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
    })
  );
  const results = await Promise.all(promises);
  return results.filter((c): c is Chunk => !!c);
}

async function getAllChunks(): Promise<Chunk[]> {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

// --- Hooks ---

function useWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    workerRef.current = new Worker(URL.createObjectURL(blob));
    
    // Load existing data into worker on startup
    getAllChunks().then(chunks => {
      chunks.forEach(chunk => {
        workerRef.current?.postMessage({
          type: 'INDEX_CHUNK',
          payload: { chunkId: chunk.id, content: chunk.content }
        });
      });
      console.log(`Initialized index with ${chunks.length} chunks`);
    });

    return () => workerRef.current?.terminate();
  }, []);

  const search = useCallback((query: string): Promise<SearchResult[]> => {
    return new Promise((resolve) => {
      if (!workerRef.current) return resolve([]);
      const id = Math.random().toString(36);
      
      const handler = (e: MessageEvent) => {
        if (e.data.id === id && e.data.type === 'SEARCH_RESULTS') {
          workerRef.current?.removeEventListener('message', handler);
          resolve(e.data.payload);
        }
      };
      
      workerRef.current.addEventListener('message', handler);
      workerRef.current.postMessage({ type: 'SEARCH', payload: query, id });
    });
  }, []);

  const indexChunk = useCallback((chunk: Chunk) => {
    workerRef.current?.postMessage({
      type: 'INDEX_CHUNK',
      payload: { chunkId: chunk.id, content: chunk.content }
    });
  }, []);

  return { search, indexChunk };
}

// --- Components ---

const FileUpload = ({ onProcessed }: { onProcessed: (count: number) => void }) => {
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setProcessing(true);
    let count = 0;

    const chunksToAdd: Chunk[] = [];

    for (let i = 0; i < e.target.files.length; i++) {
      const file = e.target.files[i];
      if (!file.name.match(/\.(txt|md|json|log)$/i)) continue;

      const text = await file.text();
      // Simple chunking strategy: paragraphs
      const paragraphs = text.split(/\n\s*\n/);
      
      paragraphs.forEach((para, idx) => {
        const cleanPara = para.trim();
        if (cleanPara.length < 50) return; // Skip tiny noises
        
        chunksToAdd.push({
          id: `${file.name}_${idx}_${Date.now()}`,
          fileId: file.name,
          fileName: file.name,
          content: cleanPara.substring(0, 2000), // Hard limit
          timestamp: Date.now(),
          wordCount: cleanPara.split(/\s+/).length // Calculate word count
        });
      });
    }

    await saveChunks(chunksToAdd);
    onProcessed(chunksToAdd.length);
    // Reload page to re-index (simple solution for now) or callback to index
    window.location.reload(); 
    setProcessing(false);
  };

  return (
    <div className="p-8 border-2 border-zinc-800 border-dashed rounded-2xl bg-zinc-900/30 text-center hover:bg-zinc-900/50 hover:border-indigo-500/50 transition-all duration-300">
      <input 
        type="file" 
        multiple 
        // @ts-ignore - directory selection is non-standard but supported in Chrome
        webkitdirectory=""
        directory=""
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFiles} 
      />
      <button 
        onClick={() => fileInputRef.current?.click()}
        disabled={processing}
        className="flex flex-col items-center justify-center gap-4 w-full h-full text-zinc-400 hover:text-indigo-400 transition-colors"
      >
        {processing ? (
          <div className="relative">
             <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
             <Loader2 className="w-12 h-12 animate-spin relative z-10" />
          </div>
        ) : (
          <Upload className="w-12 h-12" />
        )}
        <div className="space-y-1">
          <span className="text-lg font-medium block text-zinc-200">
            {processing ? "Ingesting Brain..." : "Import Memory Folder"}
          </span>
          <span className="text-xs text-zinc-500 block">
             Supports .txt, .md, .json (Recursively)
          </span>
        </div>
      </button>
    </div>
  );
};

const MemoryCard = ({ chunk, query }: { chunk: Chunk, query: string }) => {
  // Enhanced highlight logic: highlights ALL occurrences
  const renderContent = () => {
    if (!query.trim()) return chunk.content;

    // Create a generic regex pattern from search terms
    const terms = query
      .split(/\s+/)
      .filter(t => t.length > 2)
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Escape regex chars

    if (terms.length === 0) return chunk.content;

    // Join terms with OR operator (|) for regex, 'g' for global, 'i' for case-insensitive
    const pattern = new RegExp(`(${terms.join('|')})`, 'gi');
    const parts = chunk.content.split(pattern);

    return parts.map((part, i) => {
      // Check if this part matches any of our terms
      const isMatch = terms.some(term => new RegExp(`^${term}$`, 'i').test(part));
      
      if (isMatch) {
         return (
            <span key={i} className="bg-indigo-500/30 text-indigo-200 rounded px-1 font-semibold box-decoration-clone">
              {part}
            </span>
         );
      }
      return part;
    });
  };

  return (
    <div className="bg-[#0f0f11] border border-zinc-800 rounded-2xl p-6 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300 group">
      <div className="flex items-center justify-between mb-3 border-b border-zinc-900 pb-3">
        <div className="flex items-center gap-2">
           <div className="p-1.5 bg-zinc-900 rounded-lg text-indigo-400 group-hover:text-indigo-300 transition-colors">
              <FileText className="w-4 h-4" />
           </div>
           <span className="text-sm font-medium text-zinc-300 truncate max-w-[200px]">{chunk.fileName}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono">
           <span className="flex items-center gap-1">
             <Hash className="w-3 h-3" /> {chunk.wordCount || 0} words
           </span>
           <span className="flex items-center gap-1">
             <Clock className="w-3 h-3" /> {new Date(chunk.timestamp).toLocaleDateString()}
           </span>
        </div>
      </div>
      <p className="text-zinc-400 leading-relaxed text-base font-light font-sans">
        {renderContent()}
      </p>
    </div>
  );
};

const IntelligenceView = () => {
    const [analysis, setAnalysis] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const analyze = async () => {
        setLoading(true);
        setError(null);
        try {
            // Get a random sampling of memories for context
            const allChunks = await getAllChunks();
            const sample = allChunks.sort(() => 0.5 - Math.random()).slice(0, 5).map(c => c.content).join("\n\n");

            if (!sample) {
                throw new Error("Not enough data to analyze.");
            }

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: "gemini-3-pro-preview",
                config: {
                    systemInstruction: "You are Memory OS. Analyze these random memory fragments. Find connections, recurring themes, or psychological insights."
                },
                contents: `Fragments:\n${sample}`
            });

            setAnalysis(response.text ?? null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-2xl mx-auto h-full overflow-y-auto">
            <div className="flex items-center gap-3 mb-6">
                <Sparkles className="w-6 h-6 text-indigo-400" />
                <h2 className="text-xl font-semibold text-zinc-100">Deep Memory Scan</h2>
            </div>
            
            {!analysis && !loading && (
                <div className="text-center py-12 border border-zinc-800 rounded-2xl bg-zinc-900/30">
                    <p className="text-zinc-400 mb-6 max-w-md mx-auto">
                        Let the AI dream through your uploaded memories to find patterns you might have missed.
                    </p>
                    <button 
                        onClick={analyze}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-full font-medium transition-all shadow-lg shadow-indigo-500/20"
                    >
                        Start Analysis
                    </button>
                    {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}
                </div>
            )}

            {loading && (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                    <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
                    <p className="animate-pulse">Connecting disparate dots...</p>
                </div>
            )}

            {analysis && (
                <div className="prose prose-invert prose-indigo max-w-none animate-in fade-in duration-700 bg-zinc-900/30 p-6 rounded-2xl border border-zinc-800">
                    <div className="whitespace-pre-wrap text-zinc-300 leading-7">
                        {analysis}
                    </div>
                    <button onClick={() => setAnalysis(null)} className="mt-8 text-sm text-zinc-500 hover:text-white">
                        Reset Analysis
                    </button>
                </div>
            )}
        </div>
    );
};

// --- Main App ---

function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'import' | 'ai'>('search');
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Chunk[]>([]);
  const { search } = useWorker();
  const [isSearching, setIsSearching] = useState(false);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      const searchResults = await search(query);
      const ids = searchResults.map(r => r.id);
      const chunks = await getChunks(ids);
      setResults(chunks);
      setIsSearching(false);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-200 font-sans selection:bg-indigo-500/30">
      {/* Sidebar */}
      <div className="w-16 md:w-64 bg-[#09090b] border-r border-zinc-800 flex flex-col py-6 z-50">
        <div className="px-4 mb-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
             <Brain className="w-6 h-6 text-indigo-500" />
          </div>
          <span className="hidden md:inline font-bold text-xl tracking-tight text-zinc-100">Memory OS</span>
        </div>
        
        <nav className="flex-1 space-y-2 px-3">
          {[
            { id: 'search', icon: Search, label: 'Recall' },
            { id: 'import', icon: HardDrive, label: 'Ingest' },
            { id: 'ai', icon: Cpu, label: 'Intelligence' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 group ${
                activeTab === item.id 
                ? 'bg-zinc-800/80 text-white shadow-lg shadow-black/20' 
                : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
              }`}
            >
              <item.icon className={`w-5 h-5 transition-colors ${activeTab === item.id ? 'text-indigo-400' : 'text-zinc-600 group-hover:text-zinc-400'}`} />
              <span className="hidden md:block font-medium tracking-wide text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
        
        <div className="px-4 mt-auto">
            <div className="hidden md:block p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>System Online</span>
                </div>
                <div className="text-[10px] text-zinc-700 font-mono">
                    Local Encryption Active
                </div>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative bg-[#09090b]">
        {/* Decorative Background */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
            <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px]"></div>
        </div>

        {activeTab === 'search' && (
          <div className="h-full flex flex-col p-6 md:p-12 max-w-5xl mx-auto relative z-10">
             <div className="mb-8">
               <div className="relative group max-w-3xl mx-auto">
                 <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl opacity-20 blur transition duration-1000 group-hover:opacity-40 group-hover:duration-200"></div>
                 <input 
                    type="text" 
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search your external brain..." 
                    className="relative w-full bg-[#0c0c0e] border border-zinc-800 focus:border-indigo-500/50 rounded-2xl py-6 pl-14 pr-6 text-xl text-zinc-100 placeholder:text-zinc-600 outline-none shadow-2xl transition-all"
                    autoFocus
                 />
                 <div className="absolute left-5 top-1/2 -translate-y-1/2">
                    {isSearching ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500" /> : <Search className="w-6 h-6 text-zinc-500" />}
                 </div>
               </div>
             </div>

             <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                {results.length === 0 && query && !isSearching && (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-600 animate-in fade-in slide-in-from-bottom-4">
                    <FileText className="w-12 h-12 mb-4 opacity-20" />
                    <p>No matching memory fragments found.</p>
                  </div>
                )}
                {results.length === 0 && !query && (
                   <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-700 animate-in fade-in duration-700">
                      <div className="p-6 bg-zinc-900/30 rounded-full mb-6 border border-zinc-800/50">
                        <Database className="w-12 h-12 opacity-40 text-indigo-400" />
                      </div>
                      <p className="text-lg font-light text-zinc-500">Type to recall forgotten moments.</p>
                      <p className="text-sm text-zinc-700 mt-2">Local • Private • Instant</p>
                   </div>
                )}
                <div className="grid grid-cols-1 gap-4 pb-10">
                    {results.map(chunk => (
                    <MemoryCard key={chunk.id} chunk={chunk} query={query} />
                    ))}
                </div>
             </div>
          </div>
        )}

        {activeTab === 'import' && (
           <div className="h-full flex flex-col items-center justify-center p-8">
              <div className="max-w-xl w-full">
                 <h2 className="text-3xl font-light text-zinc-100 mb-2 text-center">Ingest Data</h2>
                 <p className="text-zinc-500 mb-10 text-center">Upload a folder containing your notes. The system will slice them into semantic chunks and index them locally.</p>
                 <FileUpload onProcessed={(n) => alert(`Indexed ${n} memory fragments.`)} />
              </div>
           </div>
        )}

        {activeTab === 'ai' && <IntelligenceView />}
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);