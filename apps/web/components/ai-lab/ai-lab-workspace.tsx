"use client";

import {
  ArrowRight,
  BookOpenText,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  FlaskConical,
  Lightbulb,
  Microscope,
  ScanSearch,
  Send,
  ShieldQuestion,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";
import type { AiLabResultSection, AiLabWorkspaceData } from "@/lib/api/types";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

const ACCENT_STYLES = {
  cyan: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  violet: "border-violet-500/25 bg-violet-500/10 text-violet-300",
} as const;

const RESULT_ICONS: Record<AiLabResultSection["icon"], LucideIcon> = {
  sparkles: Sparkles,
  microscope: Microscope,
  "book-open-text": BookOpenText,
  "check-circle": CheckCircle2,
  "shield-question": ShieldQuestion,
  target: Target,
};

interface AiLabWorkspaceProps {
  data: AiLabWorkspaceData;
}

export function AiLabWorkspace({ data }: AiLabWorkspaceProps) {
  const { promptContext, suggestedPrompts } = data;
  const [prompt, setPrompt] = useState(promptContext.prompt);
  const [results, setResults] = useState(data.results);
  const [sources, setSources] = useState(data.sources);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function applyPromptSuggestion(title: string, detail: string) {
    setPrompt(`${title}: ${detail}`);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextPrompt = prompt.trim();

    if (!nextPrompt) {
      setError("Enter a research prompt before running synthesis.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await apiClient.aiLab.analyze({
        prompt: nextPrompt,
        context: promptContext.tags,
      });

      setResults([
        response.summary,
        response.findings,
        response.evidence,
        response.confidence,
        response.uncertainty,
        response.suggestedNextActions,
      ]);
      setSources(response.sources);
    } catch {
      setError("Unable to run mock synthesis right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">
            AI Research Lab
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">
            Guided prompt workspace for marine research synthesis
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Compose research prompts, review structured AI outputs, and keep source context visible
            while analysis remains grounded in the current dark ocean workflow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Mock mode" className="border-amber-500/25 bg-amber-500/10 text-amber-300" />
          <StatusBadge label="Sources attached" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_340px]">
        <div className="space-y-6">
          <Panel
            title="Research Prompt Composer"
            subtitle="Draft the next marine intelligence query with structured context."
            action={<BrainCircuit size={14} className="text-violet-400" />}
          >
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-violet-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(167,139,250,0.14),_rgba(2,13,24,0)_38%),linear-gradient(180deg,rgba(6,27,48,0.94),rgba(4,20,37,0.98))] p-5">
                <p className="text-[10px] uppercase tracking-[0.26em] text-violet-300">Active Prompt</p>
                <div className="mt-3 rounded-xl border border-surface-borderSubtle bg-ocean-900/75 p-4">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={5}
                    className="w-full resize-none bg-transparent text-sm leading-relaxed text-slate-200 outline-none placeholder:text-slate-500"
                    placeholder="Enter a research prompt for the AI Lab."
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {promptContext.tags.map((tag, index) => (
                    <StatusBadge
                      key={tag}
                      label={tag}
                      className={
                        index === 0
                          ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-300"
                          : index === 1
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                            : "border-violet-500/25 bg-violet-500/10 text-violet-300"
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                  <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-500/15 disabled:cursor-wait disabled:opacity-70"
                >
                  <Send size={13} />
                  {isSubmitting ? "Running..." : "Run synthesis"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100"
                >
                  <ClipboardList size={13} className="text-cyan-400" />
                  Save as template
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100"
                >
                  <FlaskConical size={13} className="text-cyan-400" />
                  Open experiment log
                </button>
              </div>
              {(isSubmitting || error) && (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {isSubmitting && (
                    <StatusBadge
                      label="Generating mock analysis"
                      className="border-violet-500/25 bg-violet-500/10 text-violet-300"
                    />
                  )}
                  {error && (
                    <StatusBadge
                      label={error}
                      className="border-rose-500/25 bg-rose-500/10 text-rose-300"
                    />
                  )}
                </div>
              )}
            </form>
          </Panel>

          <Panel
            title="Suggested Prompts"
            subtitle="Starter prompts tuned for the current case context."
            action={<Lightbulb size={14} className="text-amber-400" />}
          >
            <div className="grid gap-3 lg:grid-cols-3">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt.title}
                  type="button"
                  onClick={() => applyPromptSuggestion(prompt.title, prompt.detail)}
                  className="group rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4 text-left transition-colors hover:border-cyan-500/25 hover:bg-ocean-850"
                >
                  <p className="text-sm font-medium text-slate-100">{prompt.title}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{prompt.detail}</p>
                  <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-cyan-400">
                    Use prompt
                    <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel
            title="Structured Results"
            subtitle="Mock AI output organized for quick review and downstream action."
            action={<ScanSearch size={14} className="text-cyan-400" />}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {results.map((section) => {
                const Icon = RESULT_ICONS[section.icon];

                return (
                <div key={section.title} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className={cn("rounded-lg border p-2", ACCENT_STYLES[section.accent])}>
                        <Icon size={14} />
                      </div>
                      <p className="text-sm font-medium text-slate-100">{section.title}</p>
                    </div>
                    <StatusBadge label="Structured" className={ACCENT_STYLES[section.accent]} />
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{section.body}</p>
                </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <Panel
          title="Source Context"
          subtitle="Supporting references attached to the current prompt."
          action={<FileText size={14} className="text-cyan-400" />}
          className="h-fit"
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-400">Reference Stack</p>
              <p className="mt-2 text-sm font-medium text-slate-100">{sources.length} active sources in context</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                The current synthesis is constrained to mock evidence references that mirror the active investigation flow.
              </p>
            </div>

            {sources.map((source) => (
              <div key={source.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] text-slate-500">{source.id}</p>
                    <p className="mt-1 text-sm font-medium text-slate-100">{source.title}</p>
                  </div>
                  <StatusBadge
                    label={source.type}
                    className={
                      source.type === "Dataset"
                        ? ACCENT_STYLES.cyan
                        : source.type === "Field Report"
                          ? ACCENT_STYLES.emerald
                          : source.type === "Model"
                            ? ACCENT_STYLES.violet
                            : ACCENT_STYLES.amber
                    }
                  />
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{source.note}</p>
                <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-slate-500">
                  <span>{source.freshness}</span>
                  <button className="inline-flex items-center gap-1 font-medium text-cyan-400 transition-colors hover:text-cyan-300">
                    Open reference
                    <ArrowRight size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          </Panel>
      </div>
    </div>
  );
}
