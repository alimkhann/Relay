"use client";

import { useMemo } from "react";

interface DashboardAnalyticsBarProps {
  sessions: Array<{
    platform: string;
    capturedAt: string;
  }>;
  digestConfidenceScores: number[];
}

const platformLabels: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
  codex: "Codex",
  claude_code: "Claude Code",
};

export function DashboardAnalyticsBar({
  sessions,
  digestConfidenceScores,
}: DashboardAnalyticsBarProps) {
  const metrics = useMemo(() => {
    if (sessions.length === 0) return null;

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const capturesThisWeek = sessions.filter(
      (s) => new Date(s.capturedAt).getTime() >= oneWeekAgo
    ).length;

    const platformCounts = new Map<string, number>();
    for (const s of sessions) {
      platformCounts.set(s.platform, (platformCounts.get(s.platform) ?? 0) + 1);
    }
    let mostActivePlatform = sessions[0]?.platform ?? "unknown";
    let maxCount = 0;
    for (const [platform, count] of platformCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostActivePlatform = platform;
      }
    }

    const avgConfidence =
      digestConfidenceScores.length > 0
        ? Math.round(
            digestConfidenceScores.reduce((sum, s) => sum + s, 0) /
              digestConfidenceScores.length
          )
        : null;

    return { capturesThisWeek, mostActivePlatform, avgConfidence };
  }, [sessions, digestConfidenceScores]);

  if (!metrics) return null;

  const chips: string[] = [
    `${metrics.capturesThisWeek} captures this week`,
    `Most active: ${platformLabels[metrics.mostActivePlatform] ?? metrics.mostActivePlatform}`,
  ];

  if (metrics.avgConfidence !== null) {
    chips.push(`Avg confidence: ${metrics.avgConfidence}%`);
  }

  return (
    <div className="flex items-center gap-3 text-xs text-[var(--relay-muted)]">
      {chips.map((chip, i) => (
        <span key={chip} className="flex items-center gap-3">
          {i > 0 && <span>·</span>}
          <span>{chip}</span>
        </span>
      ))}
    </div>
  );
}
