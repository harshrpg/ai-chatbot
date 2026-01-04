import { useState } from "react";
import { Artifact } from "@/components/create-artifact";
import { TradingViewChart } from "@/components/tradingview/chart";
import {
  addMACD,
  addMovingAverage,
  addRSI,
  removeAllStudies,
  removeIndicator,
} from "@/lib/tv/bridge";
import type { Suggestion } from "@/lib/db/schema";

type ChartMetadata = {
  symbol?: string;
};

type IndicatorState = "idle" | "pending" | "applied" | "error";

function ChartContent({
  content,
  metadata,
  suggestions,
  setMetadata,
}: {
  content: string;
  title: string;
  mode: "edit" | "diff";
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  status: "streaming" | "idle";
  suggestions: Suggestion[];
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  isInline: boolean;
  getDocumentContentById: (index: number) => string;
  isLoading: boolean;
  metadata: ChartMetadata;
  setMetadata: (value: ChartMetadata | ((current: ChartMetadata) => ChartMetadata)) => void;
}) {
  const symbol = (content || metadata?.symbol || "BTC/USDT").toUpperCase();
  const [isStrategyApplied, setIsStrategyApplied] = useState(false);
  const [indicatorState, setIndicatorState] = useState<Record<string, IndicatorState>>({
    MACD: "idle",
    RSI: "idle",
    "EMA(20)": "idle",
  });

  const setStates = (names: string[], state: IndicatorState) => {
    setIndicatorState((current) => {
      const next = { ...current };
      names.forEach((name) => {
        next[name] = state;
      });
      return next;
    });
  };

  const applyStrategy = async () => {
    let appliedAny = false;
    setStates(["MACD", "RSI", "EMA(20)"], "pending");

    try {
      await addMACD();
      appliedAny = true;
      setStates(["MACD"], "applied");
      console.info("Applied MACD");
    } catch (error) {
      setStates(["MACD"], "error");
      console.error("Failed to apply MACD", error);
    }

    try {
      await addRSI();
      appliedAny = true;
      setStates(["RSI"], "applied");
      console.info("Applied RSI");
    } catch (error) {
      setStates(["RSI"], "error");
      console.error("Failed to apply RSI", error);
    }

    try {
      await addMovingAverage(20, "EMA");
      appliedAny = true;
      setStates(["EMA(20)"], "applied");
      console.info("Applied EMA(20)");
    } catch (error) {
      setStates(["EMA(20)"], "error");
      console.error("Failed to apply EMA(20)", error);
    }

    setIsStrategyApplied(appliedAny);
  };

  const removeStrategy = async () => {
    setStates(["MACD", "RSI", "EMA(20)"], "pending");
    try {
      await removeAllStudies();
      setStates(["MACD", "RSI", "EMA(20)"], "idle");
      setIsStrategyApplied(false);
      console.info("Removed all studies");
    } catch (error) {
      console.error("Failed to remove studies", error);
      // fallback: attempt targeted removals
      try {
        await removeIndicator("MACD");
        await removeIndicator("RSI");
        await removeIndicator("EMA_20");
        setStates(["MACD", "RSI", "EMA(20)"], "idle");
        setIsStrategyApplied(false);
      } catch (innerError) {
        setStates(["MACD", "RSI", "EMA(20)"], "error");
        console.error("Fallback remove indicators failed", innerError);
      }
    }
  };

  const statusBadge = (state: IndicatorState) => {
    const colors: Record<IndicatorState, string> = {
      idle: "bg-muted text-muted-foreground",
      pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100",
      applied: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100",
      error: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100",
    };
    const labels: Record<IndicatorState, string> = {
      idle: "Idle",
      pending: "Adding...",
      applied: "Added",
      error: "Error",
    };
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[state]}`}
      >
        {labels[state]}
      </span>
    );
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="text-lg font-medium">{`Chart: ${symbol}`}</div>
      <div className="relative isolate h-[520px] w-full overflow-hidden rounded-xl border bg-card" style={{ zIndex: 0 }}>
        <TradingViewChart symbol={symbol} />
      </div>
      <div className="relative flex w-full flex-col gap-3" style={{ zIndex: 30 }}>
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Basic Strategy</div>
              <div className="text-xs text-muted-foreground">
                Applies MACD, RSI, and EMA(20) to this chart.
              </div>
            </div>
            <button
              className="cursor-pointer rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
              onClick={() =>
                isStrategyApplied ? removeStrategy() : applyStrategy()
              }
              type="button"
            >
              {isStrategyApplied ? "Remove Strategy" : "Add Strategy"}
            </button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {["MACD", "RSI", "EMA(20)"].map((name) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
              >
                <span>{name}</span>
                {statusBadge(indicatorState[name] ?? "idle")}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const chartArtifact = new Artifact<"chart", ChartMetadata>({
  kind: "chart",
  description: "Display crypto pairs with the TradingView widget.",
  initialize: ({ setMetadata }) => {
    setMetadata({ symbol: undefined });
  },
  onStreamPart: ({ streamPart, setArtifact, setMetadata }) => {
    if (streamPart.type === "data-id") {
      // Keep chart artifact non-persistent to avoid document fetches
      setArtifact((draft) => ({
        ...draft,
        documentId: "init",
      }));
      return;
    }

    if (streamPart.type === "data-chartSymbol") {
      setMetadata((current) => ({
        ...current,
        symbol: streamPart.data,
      }));
      setArtifact((draft) => ({
        ...draft,
        documentId: "init",
        content: streamPart.data,
        title: draft.title || `Chart ${streamPart.data}`,
        isVisible: true,
        status: "streaming",
      }));
    }
  },
  content: ChartContent,
  actions: [],
  toolbar: [],
});

