"use client";

import { useState } from "react";
import {
  BrainCircuit,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  Send,
  MessageSquare,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InsightSeverity = "info" | "warning" | "discovery";

interface AiInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  confidence: number; // 0-100
  timestamp: string;
  tags: string[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Mock AI insights — replace with real API data
// ---------------------------------------------------------------------------

const MOCK_INSIGHTS: AiInsight[] = [
  {
    id: "1",
    severity: "warning",
    title: "Thermal anomaly detected",
    body: "SST 2.4 °C above seasonal mean in Pacific sector 14-C (34.5°N, 142°W). Possible coral bleaching risk within 72 h.",
    confidence: 87,
    timestamp: "3 min ago",
    tags: ["SST", "Coral", "Sector 14-C"],
  },
  {
    id: "2",
    severity: "discovery",
    title: "Unusual migration pattern",
    body: "Blue whale pod (ID #BW-0042) deviated 340 km from historical route. Cross-correlating with krill density data.",
    confidence: 73,
    timestamp: "28 min ago",
    tags: ["Migration", "Blue Whale", "Krill"],
  },
  {
    id: "3",
    severity: "info",
    title: "Chlorophyll bloom forecast",
    body: "Model predicts high-productivity bloom in North Atlantic (48°N) within 5 days. Recommended to deploy sample drones.",
    confidence: 91,
    timestamp: "1 hr ago",
    tags: ["Chlorophyll", "North Atlantic", "Bloom"],
  },
];

const SEVERITY_CONFIG: Record<
  InsightSeverity,
  { icon: LucideIcon; color: string; bg: string; border: string }
> = {
  info:      { icon: Lightbulb,      color: "text-cyan-400",   bg: "bg-cyan-500/10",   border: "border-cyan-500/25" },
  warning:   { icon: AlertTriangle,  color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/25" },
  discovery: { icon: TrendingUp,     color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/25" },
};

// ---------------------------------------------------------------------------
// Confidence bar
// ---------------------------------------------------------------------------

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 85 ? "bg-emerald-400" :
    value >= 65 ? "bg-cyan-400" :
    "bg-amber-400";

  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1 rounded-full bg-ocean-800 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-500 font-mono w-7 text-right">{value}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insight card
// ---------------------------------------------------------------------------

function InsightCard({ insight }: { insight: AiInsight }) {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, color, bg, border } = SEVERITY_CONFIG[insight.severity];

  return (
    <div className={cn("rounded-lg border p-3 space-y-2", bg, border)}>
      <div
        className="flex items-start gap-2 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <Icon size={14} className={cn("mt-0.5 shrink-0", color)} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-200 leading-snug">{insight.title}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{insight.timestamp}</p>
        </div>
        <ChevronDown
          size={12}
          className={cn(
            "text-slate-500 shrink-0 mt-0.5 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </div>

      {expanded && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400 leading-relaxed">{insight.body}</p>
          <ConfidenceBar value={insight.confidence} />
          <div className="flex flex-wrap gap-1 pt-1">
            {insight.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-400 bg-ocean-800 border border-surface-borderSubtle"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick-chat component
// ---------------------------------------------------------------------------

function QuickChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hello. I'm your ocean intelligence assistant. Ask me about any species, dataset, or anomaly." },
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
      { role: "assistant", content: "Analysing oceanic data… This is a demo response. Real integration would call your AI Research Lab endpoint." },
    ]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-48">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "text-[11px] leading-relaxed px-2.5 py-2 rounded-lg",
              msg.role === "user"
                ? "bg-cyan-500/15 text-cyan-100 border border-cyan-500/25 ml-4"
                : "bg-ocean-800 text-slate-300 border border-surface-borderSubtle mr-4"
            )}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-surface-borderSubtle">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the AI…"
          maxLength={500}
          className={cn(
            "flex-1 px-2.5 py-1.5 rounded-lg text-[11px]",
            "bg-ocean-800 border border-surface-borderSubtle",
            "text-slate-300 placeholder:text-slate-600",
            "focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
          )}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="p-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right AI Panel
// ---------------------------------------------------------------------------

export interface RightAIPanelProps {
  className?: string;
}

export function RightAIPanel({ className }: RightAIPanelProps) {
  const [activeTab, setActiveTab] = useState<"insights" | "chat">("insights");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  };

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col w-72 h-full bg-ocean-900 border-l border-surface-border overflow-hidden",
        className
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-surface-border shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30">
          <BrainCircuit size={14} className="text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-200 leading-none">AI Insights</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Real-time analysis</p>
        </div>
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-ocean-800 transition-colors"
          aria-label="Refresh AI insights"
        >
          <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-surface-borderSubtle shrink-0">
        {(["insights", "chat"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors",
              activeTab === tab
                ? "text-cyan-400 border-b-2 border-cyan-400"
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            {tab === "insights" ? (
              <>
                <Sparkles size={11} />
                Insights
              </>
            ) : (
              <>
                <MessageSquare size={11} />
                Quick Chat
              </>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "insights" ? (
          <div className="space-y-2.5">
            {/* Summary badge */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                {MOCK_INSIGHTS.length} active signals
              </span>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Monitoring
              </span>
            </div>
            {MOCK_INSIGHTS.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        ) : (
          <QuickChat />
        )}
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 px-3 py-2.5 border-t border-surface-borderSubtle bg-ocean-900/50">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-600 font-mono">Model: OceanGPT-4</span>
          <button className="text-[10px] text-cyan-500 hover:text-cyan-300 transition-colors">
            View full lab →
          </button>
        </div>
      </div>
    </aside>
  );
}
