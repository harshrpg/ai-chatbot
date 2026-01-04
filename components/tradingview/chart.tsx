"use client";

import { useEffect, useRef } from "react";
import Datafeed from "@/lib/tradingview/datafeed";
import { registerWidget, unregisterWidget } from "@/lib/tv/bridge";

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => {
        remove: () => void;
      };
    };
  }
}

const SCRIPT_ID = "tradingview-widget-script";
let scriptPromise: Promise<void> | null = null;

function ensureTradingViewScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.TradingView) {
    return Promise.resolve();
  }

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById(SCRIPT_ID) as
        | HTMLScriptElement
        | null;
      if (existing && window.TradingView) {
        resolve();
        return;
      }

      const script = existing ?? document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "/charting_library/charting_library/charting_library.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load TradingView"));
      if (!existing) {
        document.head.appendChild(script);
      }
    });
  }

  return scriptPromise;
}

type TradingViewChartProps = {
  symbol: string;
  interval?: string;
  theme?: "light" | "dark";
};

export function TradingViewChart({
  symbol,
  interval = "1D",
  theme = "dark",
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    let isCancelled = false;

    ensureTradingViewScript()
      .then(() => {
        if (isCancelled) return;
        if (!containerRef.current || !window.TradingView) {
          return;
        }

        if (widgetRef.current) {
          widgetRef.current.remove();
        }

        try {
          widgetRef.current = new window.TradingView.widget({
            container: containerRef.current,
            datafeed: Datafeed,
            interval,
            library_path: "/charting_library/charting_library/",
            symbol,
            theme,
            autosize: true,
            fullscreen: false,
            timezone: "Etc/UTC",
            locale: "en",
            disabled_features: ["use_localstorage_for_settings"],
          });

          if (typeof widgetRef.current.onChartReady === "function") {
            widgetRef.current.onChartReady(() => {
              registerWidget(widgetRef.current as any);
            });
          } else {
            // Fallback if onChartReady is not available
            registerWidget(widgetRef.current as any);
          }
        } catch (error) {
          console.error("Failed to initialize TradingView widget", error);
        }
      })
      .catch(() => {
        // Silently fail to keep UI lightweight
        console.error('Failed in TV Chart')
      });

    return () => {
      isCancelled = true;
      if (widgetRef.current) {
        try {
          unregisterWidget();
          widgetRef.current.remove?.();
        } catch (error) {
          console.error("Failed to cleanup TradingView widget", error);
        } finally {
          widgetRef.current = null;
        }
      }
    };
  }, [symbol, interval, theme]);

  return (
    <div ref={containerRef} className="h-full w-full" />
  );
}

