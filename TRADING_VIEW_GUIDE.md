# TradingView Integration Guide for AI-Driven Chatbots

This guide provides a blueprint for an AI agent to integrate the TradingView Charting Library into a chatbot project. It covers everything from basic setup to "agentic control"—allowing the chatbot to manipulate the chart (add indicators, change symbols, draw patterns) based on user conversations.

---

## 1. Overview & Prerequisites

### Architecture

1.  **Charting Library**: A static set of JS/HTML files that must be served from your `/public` directory.
2.  **Datafeed**: A JavaScript object you implement to provide data (history & realtime) to the library.
3.  **Widget**: The UI component that renders the chart.
4.  **The Bridge (Agentic Layer)**: A singleton or context-based API that lets your chatbot logic send commands to the chart.

### Prerequisites

- Access to the `charting_library` repository (TradingView requires a signed CLA for the Advanced Charts library).
- A data source (e.g., CryptoCompare, Binance API, or your own backend).

---

## 2. Infrastructure Setup

### Step 1: Library Deployment

The library must be in the `public/` folder. Add a script to your `package.json` to handle this automatically:

```json
{
  "scripts": {
    "postinstall": "npm run copy-tv-files",
    "copy-tv-files": "cp -R node_modules/charting_library/ public/charting_library"
  }
}
```

### Step 2: Typescript Configuration

TradingView types are usually provided within the library. Add them to your `tsconfig.json` include path or reference them directly in your files.

---

## 3. Implementing the Datafeed

The `Datafeed` is the heart of the integration. It follows a specific interface required by TradingView.

```typescript
// lib/tradingview/datafeed.ts
const Datafeed = {
  onReady: (callback) => {
    setTimeout(() => callback(configurationData));
  },
  searchSymbols: async (userInput, exchange, symbolType, onResultReadyCallback) => {
    // Fetch matching symbols from your API
  },
  resolveSymbol: async (symbolName, onSymbolResolvedCallback, onResolveErrorCallback) => {
    // Return symbol metadata (ticker, exchange, timezone, pricescale)
  },
  getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
    // Fetch historical OHLC data from your API
    // periodParams.from and periodParams.to are timestamps
  },
  subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscriberUID) => {
    // Set up WebSocket connection for real-time updates
  },
  unsubscribeBars: (subscriberUID) => {
    // Close WebSocket connection
  },
};
```

---

## 4. The React Chart Component

The component must handle dynamic script loading and widget lifecycle.

```tsx
// components/trading-view-chart.tsx
import { useEffect, useRef } from 'react';

export default function TradingViewChart({ symbol, theme = 'dark' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    const initWidget = () => {
      if (!containerRef.current || !window.TradingView) return;

      widgetRef.current = new window.TradingView.widget({
        container: containerRef.current,
        symbol: symbol,
        interval: '1D',
        library_path: '/charting_library/',
        datafeed: Datafeed, // Imported from step 3
        theme: theme,
        fullscreen: false,
        autosize: true,
      });

      // Register with the Bridge (see section 5)
      registerWidget(widgetRef.current);
    };

    // Ensure scripts are loaded before initializing
    if (!window.TradingView) {
      const script = document.createElement('script');
      script.src = '/charting_library/charting_library.js';
      script.onload = initWidget;
      document.head.appendChild(script);
    } else {
      initWidget();
    }

    return () => {
      if (widgetRef.current) widgetRef.current.remove();
    };
  }, [symbol, theme]);

  return <div ref={containerRef} className="h-full w-full" />;
}
```

---

## 5. Agentic Control: The Bridge

To allow a chatbot to control the chart, create a bridge file that exports async functions. The chatbot can call these functions as part of its "Tools" or "Actions".

```typescript
// lib/tv/bridge.ts
let chartApi: any = null;
let resolveReady: () => void;
export const chartReady = new Promise<void>((res) => (resolveReady = res));

export function registerWidget(widget: any) {
  widget.onChartReady(() => {
    chartApi = widget.activeChart();
    resolveReady();
  });
}

export async function setSymbol(symbol: string) {
  await chartReady;
  chartApi.setSymbol(symbol);
}

export async function addIndicator(name: string, params: any = {}) {
  await chartReady;
  // Names like "Relative Strength Index", "MACD", etc.
  return chartApi.createStudy(name, false, false, params);
}

export async function drawLine(
  p1: { time: number; price: number },
  p2: { time: number; price: number }
) {
  await chartReady;
  chartApi.createShape(p1, { shape: 'trend_line', overrides: { linecolor: '#ff0000' } });
}
```

---

## 6. Chatbot Integration Strategy

### Scenario A: Symbol Change

When the user says "Show me Bitcoin", the chatbot:

1.  Calls `setSymbol('BTCUSDT')` via the bridge.
2.  The chart updates instantly without a page reload.

### Scenario B: Technical Analysis

When the user says "Is it overbought?", the chatbot:

1.  Calls `addIndicator('Relative Strength Index')`.
2.  Optionally reads the RSI value (if your bridge supports data extraction) to answer the user.

### Scenario C: Visualizing Predictions

If the chatbot predicts a price target:

1.  It calls `drawPriceTarget({ level: 75000, type: 'TARGET' })`.
2.  The user sees the prediction visually on their chart.

---

## 7. Common Pitfalls for AI Agents

1.  **Hydration Mismatch**: In Next.js, the chart component should be wrapped in a "No SSR" component or only initialized in `useEffect`.
2.  **Path Resolution**: Ensure `library_path` in the widget config matches exactly where you copied the files in `public/`.
3.  **Script Loading**: If multiple charts are used, ensure the `charting_library.js` script is only appended to the document once.
4.  **Z-Index/Layout**: The chart requires a container with a defined height (e.g., `h-[600px]` or `h-full`).

---

## 8. Example AI Tool Definition (Vercel AI SDK)

```typescript
const chartTools = {
  updateChart: {
    description: 'Change the symbol or timeframe on the trading chart',
    parameters: z.object({
      symbol: z.string().describe('The ticker symbol, e.g. BTCUSDT'),
      interval: z.string().optional().describe('Timeframe, e.g. 1D, 1h'),
    }),
    execute: async ({ symbol, interval }) => {
      await setSymbol(symbol, interval);
      return `Chart updated to ${symbol}`;
    },
  },
  analyzeTechnicals: {
    description: 'Add technical indicators to the chart',
    parameters: z.object({
      indicator: z.enum(['RSI', 'MACD', 'Bollinger Bands']),
    }),
    execute: async ({ indicator }) => {
      await addIndicator(indicator);
      return `Added ${indicator} to the chart`;
    },
  },
};
```
