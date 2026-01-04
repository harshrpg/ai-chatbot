import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { Session } from "next-auth";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

type ShowChartProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

export const showChart = ({ dataStream }: ShowChartProps) =>
  tool({
    description: "Open a TradingView chart for a crypto pair (e.g., BTC/USDT).",
    inputSchema: z.object({
      symbol: z.string().describe("Pair like BTC/USDT"),
      title: z.string().optional(),
    }),
    execute: async ({ symbol, title }) => {
      const normalizedSymbol = symbol.trim().toUpperCase();
      const id = generateUUID();

      dataStream.write({ type: "data-kind", data: "chart", transient: true });
      dataStream.write({ type: "data-id", data: id, transient: true });
      dataStream.write({
        type: "data-title",
        data: title ?? `Chart ${normalizedSymbol}`,
        transient: true,
      });
      dataStream.write({ type: "data-clear", data: null, transient: true });
      dataStream.write({
        type: "data-chartSymbol",
        data: normalizedSymbol,
        transient: true,
      });
      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        symbol: normalizedSymbol,
        message: `Opened chart for ${normalizedSymbol}`,
      };
    },
  });

