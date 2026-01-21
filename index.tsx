import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import {
  Book,
  Search,
  Users,
  Calendar,
  MessageSquare,
  Brain,
  Sparkles,
  Menu,
  Save,
  Plus,
  Moon,
  Loader2,
  ChevronRight,
  Database
} from "lucide-react";

// --- Types ---

type MemoryType = 'journal' | 'person' | 'event' | 'conversation' | 'emotion';

interface Memory {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  tags: string[];
  date: string;
  meta?: any;
}

// --- Data Layer (OPFS Interface) ---

class MemoryEngine {
  private root: FileSystemDirectoryHandle | null = null;
  private index: Memory[] = [];

  async init() {
    try {
      this.root = await navigator.storage.getDirectory();
      await this.ensureDir('memory');
      await this.ensureDir('memory/journal');
      await this.ensureDir('memory/people');
      await this.ensureDir('memory/events');
      await this.ensureDir('memory/emotions');
      
      // Load index (naive implementation for demo, ideally would use SQLite WASM)
      await this.rebuildIndex();
      console.log("Memory OS Engine: Online");
    } catch (e) {
      console.error("Failed to init OPFS:", e);
    }
  }

  private async ensureDir(path: string) {
    if (!this.root) return;
    const parts = path.split('/');
    let current = this.root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }
    return current;
  }

  async saveMemory(memory: Memory) {
    if (!this.root) await this.init();
    
    // Path structure: /memory/{type}/{date}_{id}.json
    const fileName = `${memory.date}_${memory.id}.json`;
    const dirHandle = await this.ensureDir(`memory/${memory.type}`);
    
    if (dirHandle) {
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(memory, null, 2));
      await writable.close();
      
      // Update in-memory index
      const existingIdx = this.index.findIndex(m => m.id === memory.id);
      if (existingIdx >= 0) {
        this.index[existingIdx] = memory;
      } else {
        this.index.push(memory);
      }
      return true;
    }
    return false;
  }

  async getRecentJournal(): Promise<Memory | null> {
     // Naive sort for demo
     const journals = this.index
        .filter(m => m.type === 'journal')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
     return journals[0] || null;
  }

  async search(query: string): Promise<Memory[]> {
    if (!query) return this.index.slice(0, 20); // Return recent if empty
    const q = query.toLowerCase();
    // Full text search simulation
    return this.index.filter(m => 
      m.title.toLowerCase().includes(q) || 
      m.content.toLowerCase().includes(q) ||
      m.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  private async rebuildIndex() {
    // In a real app, we would crawl the OPFS. 
    // For this session storage simulation, we'll keep the array.
    // This method exists to show where SQLite indexing would trigger.
  }
}

const engine = new MemoryEngine();

// --- Components ---

const Sidebar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) => {
  const navItems = [
    { id: 'dashboard', icon: Database, label: 'Overview' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'journal', icon: Book, label: 'Journal' },
    { id: 'people', icon: Users, label: 'People' },
    { id: 'events', icon: Calendar, label: 'Events' },
    { id: 'ai', icon: Sparkles, label: 'Intelligence' }, // The special page
  ];

  return (
    <div className="w-16 md:w-64 bg-[#09090b] border-r border-zinc-800 flex flex-col items-center md:items-start py-6 transition-all duration-300 z-50">
      <div className="mb-8 px-4 flex items-center gap-3 text-zinc-100 font-bold text-xl tracking-tighter">
        <Brain className="w-8 h-8 text-indigo-500" />
        <span className="hidden md:inline">Memory OS</span>
      </div>
      
      <nav className="flex-1 w-full space-y-1 px-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
              activeTab === item.id 
                ? 'bg-zinc-800/50 text-indigo-400' 
                : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="hidden md:block font-medium">{item.label}</span>
            {activeTab === item.id && (
              <div className="ml-auto w-1 h-1 rounded-full bg-indigo-500 hidden md:block" />
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto px-4 w-full">
         <div className="text-xs text-zinc-700 hidden md:block text-center py-4">
            Offline • Secured
         </div>
      </div>
    </div>
  );
};

// --- Views ---

const JournalView = () => {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [mood, setMood] = useState("neutral");
  
  // Auto-save logic
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (content.length > 5) {
        setSaving(true);
        const today = new Date().toISOString().split('T')[0];
        const id = `entry_${today}`;
        
        await engine.saveMemory({
          id,
          type: 'journal',
          title: `Journal Entry ${today}`,
          content: content,
          tags: [mood],
          date: new Date().toISOString()
        });
        
        setSaving(false);
      }
    }, 3000); // 3 seconds debounce

    return () => clearTimeout(timeout);
  }, [content, mood]);

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto p-4 md:p-8 animate-in fade-in duration-500">
      <header className="mb-8 flex justify-between items-center">
        <div>
           <h2 className="text-3xl font-light text-zinc-100 mb-1">Daily Journal</h2>
           <p className="text-zinc-500 text-sm font-mono">{new Date().toDateString()}</p>
        </div>
        <div className="flex items-center gap-2">
           {saving && <span className="text-xs text-zinc-500 animate-pulse">Saving to OPFS...</span>}
           <div className={`w-2 h-2 rounded-full ${saving ? 'bg-yellow-500' : 'bg-green-500'}`} />
        </div>
      </header>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {['😊', '😐', '😔', '😡', '😰', '🤔'].map(emoji => (
          <button 
            key={emoji}
            onClick={() => setMood(emoji)}
            className={`p-3 rounded-full bg-zinc-900 border ${mood === emoji ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-800 hover:border-zinc-600'} transition-all`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind? (Auto-saving...)"
        className="flex-1 w-full bg-transparent border-none resize-none outline-none text-zinc-300 text-lg md:text-xl leading-relaxed placeholder:text-zinc-700 font-light"
        spellCheck={false}
      />
    </div>
  );
};

const IntelligenceView = () => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentEntry, setRecentEntry] = useState<Memory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get Context
      const entry = await engine.getRecentJournal();
      setRecentEntry(entry);
      
      if (!entry) {
        throw new Error("No recent journal entry found to analyze.");
      }

      // 2. Call AI
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({ 
        model: "gemini-3-pro-preview",
        config: {
          systemInstruction: "You are an advanced psychological intelligence unit called 'Memory OS Core'. Your goal is to analyze the user's latest journal entry. Provide a structured report covering: 1. Emotional State Analysis. 2. Hidden Patterns/Subtext. 3. Constructive Actionable Insight. Tone: Clinical but empathetic, concise, futuristic." 
        },
        contents: `Here is my latest journal entry:\n\n${entry.content}`
      });

      setAnalysis(response.text ?? null);

    } catch (e: any) {
      setError(e.message || "Intelligence system offline.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full p-6 md:p-12 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
           <div className="p-3 bg-indigo-500/10 rounded-full">
             <Sparkles className="w-8 h-8 text-indigo-400" />
           </div>
           <div>
             <h1 className="text-2xl font-bold text-white">Core Intelligence</h1>
             <p className="text-zinc-500">Psychological analysis engine</p>
           </div>
        </div>

        {!analysis && !loading && (
          <div className="border border-zinc-800 bg-zinc-900/50 rounded-2xl p-8 text-center">
            <p className="text-zinc-400 mb-6">
              Run a deep analysis on your most recent memory dump to uncover hidden patterns and emotional vectors.
            </p>
            <button 
              onClick={analyze}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-full font-medium transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 mx-auto"
            >
              <Brain className="w-4 h-4" />
              Initialize Analysis
            </button>
            {error && <p className="mt-4 text-red-400 text-sm bg-red-950/20 p-2 rounded">{error}</p>}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
             <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
             <p className="text-zinc-500 font-mono text-sm animate-pulse">READING MEMORY BLOCKS...</p>
          </div>
        )}

        {analysis && (
          <div className="animate-in slide-in-from-bottom-4 duration-700">
             <div className="flex justify-between items-end mb-4 border-b border-zinc-800 pb-2">
                <span className="text-xs font-mono text-zinc-500">REF: {recentEntry?.id}</span>
                <span className="text-xs font-mono text-indigo-400">ANALYSIS COMPLETE</span>
             </div>
             <div className="prose prose-invert prose-indigo max-w-none">
                <div className="whitespace-pre-wrap text-zinc-300 leading-7 font-light">
                  {analysis}
                </div>
             </div>
             <button onClick={() => setAnalysis(null)} className="mt-8 text-zinc-500 hover:text-white text-sm">
               Reset Terminal
             </button>
          </div>
        )}
      </div>
    </div>
  );
};

const SearchView = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Memory[]>([]);

  useEffect(() => {
    engine.search(query).then(setResults);
  }, [query]);

  return (
    <div className="h-full p-6 md:p-12 flex flex-col">
       <div className="relative max-w-2xl mx-auto w-full mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your external brain..."
            className="w-full bg-zinc-900/50 border border-zinc-800 focus:border-indigo-500/50 rounded-2xl py-4 pl-12 pr-4 text-zinc-200 outline-none transition-all text-lg"
          />
       </div>

       <div className="flex-1 overflow-y-auto max-w-4xl mx-auto w-full space-y-4">
          {results.length === 0 && query && (
             <div className="text-center text-zinc-600 mt-20">No traces found in memory.</div>
          )}
          {results.map((item, idx) => (
             <div key={item.id || idx} className="group bg-zinc-900/30 border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-900/80 rounded-xl p-5 transition-all cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                   <span className="text-xs font-mono text-indigo-400 uppercase tracking-wider bg-indigo-500/10 px-2 py-1 rounded">{item.type}</span>
                   <span className="text-xs text-zinc-600">{new Date(item.date).toLocaleDateString()}</span>
                </div>
                <h3 className="text-lg font-medium text-zinc-200 mb-2">{item.title}</h3>
                <p className="text-zinc-400 text-sm line-clamp-2">{item.content}</p>
             </div>
          ))}
       </div>
    </div>
  );
};

// --- Main App Layout ---

function App() {
  const [activeTab, setActiveTab] = useState('journal');

  useEffect(() => {
    // Init engine on mount
    engine.init();
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'journal': return <JournalView />;
      case 'ai': return <IntelligenceView />;
      case 'search': return <SearchView />;
      default: return (
        <div className="flex flex-col items-center justify-center h-full text-zinc-600">
           <Database className="w-16 h-16 mb-4 opacity-20" />
           <p>Module {activeTab} is under construction</p>
        </div>
      );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-200 font-sans selection:bg-indigo-500/30">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 h-full relative overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-zinc-900/20 via-[#09090b] to-[#09090b]">
        {renderContent()}
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);