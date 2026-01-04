import { generateSymbol, makeApiRequest, parseFullSymbol } from "./helpers";
import { subscribeOnStream, unsubscribeFromStream } from "./streaming";

// Types
interface SymbolSearchItem {
    symbol: string;
    ticker: string;
    description: string;
    exchange: string;
    type: 'crypto';
}

interface AllExchangesResponse {
    Data: Record<string, { pairs: Record<string, string[]> }>; // exchange -> { pairs: { BTC: [USD, EUR] } }
}

type Bar = {
    time: number; // milliseconds since epoch (TradingView expects ms)
    low: number;
    high: number;
    open: number;
    close: number;
};

// DatafeedConfiguration implementation
const configurationData = {
    // Represents the resolutions for bars supported by your datafeed
    supported_resolutions: ['1D', '1W', '1M'],
    // The `exchanges` arguments are used for the `searchSymbols` method if a user selects the exchange
    exchanges: [
        { value: 'Bitfinex', name: 'Bitfinex', desc: 'Bitfinex' },
        { value: 'Kraken', name: 'Kraken', desc: 'Kraken bitcoin exchange' },
    ],
    // The `symbols_types` arguments are used for the `searchSymbols` method if a user selects this symbol type
    symbols_types: [{ name: 'crypto', value: 'crypto' }],
};

const lastBarsCache: Map<string, Bar> = new Map();

// Obtains all symbols for all exchanges supported by CryptoCompare API
async function getAllSymbols(): Promise<SymbolSearchItem[]> {
    const data = await makeApiRequest<AllExchangesResponse>('data/v3/all/exchanges');
    let allSymbols: SymbolSearchItem[] = [];

    // Iterate ALL exchanges returned by the API (not only the small UI list)
    const exchanges = Object.keys(data.Data || {});
    for (const exchange of exchanges) {
        const exchangeData = data.Data[exchange];
        if (!exchangeData) continue;
        const pairs = exchangeData.pairs || {};

        for (const leftPairPart of Object.keys(pairs)) {
            const symbols: SymbolSearchItem[] = pairs[leftPairPart].map((rightPairPart: string) => {
                const symbol = generateSymbol(exchange, leftPairPart, rightPairPart);
                return {
                    symbol: symbol.short,
                    ticker: symbol.short, // TradingView resolves using this
                    description: symbol.short,
                    exchange,
                    type: 'crypto',
                };
            });
            allSymbols = [...allSymbols, ...symbols];
        }
    }

    return allSymbols;
}

const Datafeed = {
    onReady: (callback: (config: any) => void) => {
        console.log('[onReady]: Method call');
        setTimeout(() => callback(configurationData));
    },
    searchSymbols: async (
        userInput: string,
        exchange: string,
        symbolType: string,
        onResultReadyCallback: (symbols: SymbolSearchItem[]) => void
    ) => {
        console.log('[searchSymbols]: Method call');
        const symbols = await getAllSymbols();
        const newSymbols = symbols.filter((symbol) => {
            const isExchangeValid = exchange === '' || symbol.exchange === exchange;
            const fullName = `${symbol.exchange}:${symbol.ticker}`;
            const isFullSymbolContainsInput = fullName.toLowerCase().indexOf(userInput.toLowerCase()) !== -1;
            return isExchangeValid && isFullSymbolContainsInput;
        });
        onResultReadyCallback(newSymbols);
    },
    resolveSymbol: async (
        symbolName: string,
        onSymbolResolvedCallback: (symbolInfo: any) => void,
        onResolveErrorCallback: (reason: string) => void,
        extension: any
    ) => {
        console.log('[resolveSymbol]: Method call', symbolName);
        const symbols = await getAllSymbols();
        const symbolItem = symbols.find(({ ticker }) => ticker === symbolName);
        if (!symbolItem) {
            console.log('[resolveSymbol]: Cannot resolve symbol', symbolName);
            onResolveErrorCallback('Cannot resolve symbol');
            return;
        }
        // Symbol information object
        const symbolInfo = {
            ticker: symbolItem.ticker,
            full_name: symbolItem.ticker,
            name: symbolItem.symbol,
            description: symbolItem.description,
            type: symbolItem.type,
            session: '24x7',
            timezone: 'Etc/UTC',
            exchange: symbolItem.exchange,
            minmov: 1,
            pricescale: 100,
            has_intraday: false,
            visible_plots_set: 'ohlc',
            has_weekly_and_monthly: false,
            supported_resolutions: configurationData.supported_resolutions,
            volume_precision: 2,
            data_status: 'streaming',
        };
        console.log('[resolveSymbol]: Symbol resolved', symbolName);
        onSymbolResolvedCallback(symbolInfo);
    },
    getBars: async (
        symbolInfo: any,
        resolution: string,
        periodParams: { from: number; to: number; firstDataRequest: boolean },
        onHistoryCallback: (bars: Bar[], meta: { noData: boolean }) => void,
        onErrorCallback: (error: unknown) => void
    ) => {
        console.log('[getBars]: Method call', symbolInfo);
        const { from, to } = periodParams;
        console.log('[getBars]: Method call', symbolInfo, resolution, from, to);
        const parsedSymbol = parseFullSymbol(symbolInfo.full_name);
        if (!parsedSymbol) {
            onErrorCallback('Invalid symbol');
            return;
        }
        const params = new URLSearchParams({
            // Do not force exchange; let CryptoCompare aggregate (CCCAGG) for broader coverage
            fsym: parsedSymbol.fromSymbol,
            tsym: parsedSymbol.toSymbol,
            toTs: String(to),
            limit: String(2000),
        });
        try {
            interface HistDayBar { time: number; low: number; high: number; open: number; close: number }
            interface HistDayResponse { Response?: 'Success' | 'Error'; Data: HistDayBar[] }
            const data = await makeApiRequest<HistDayResponse>(`data/histoday?${params.toString()}`);
            let responseData = data;
            // Fallback: if no data for USDT/USDC quote, try USD
            if ((responseData.Response && responseData.Response === 'Error') || responseData.Data.length === 0) {
                if (['USDT', 'USDC'].includes(parsedSymbol.toSymbol.toUpperCase())) {
                    const fallbackParams = new URLSearchParams({
                        fsym: parsedSymbol.fromSymbol,
                        tsym: 'USD',
                        toTs: String(to),
                        limit: String(2000),
                    });
                    try {
                        const fallback = await makeApiRequest<HistDayResponse>(`data/histoday?${fallbackParams.toString()}`);
                        if (!fallback.Response || fallback.Response === 'Success') {
                            responseData = fallback;
                        }
                    } catch (_) {
                        // ignore fallback error
                    }
                }
            }
            if ((responseData.Response && responseData.Response === 'Error') || responseData.Data.length === 0) {
                // "noData" should be set if there is no data in the requested period
                onHistoryCallback([], { noData: true });
                return;
            }
            const bars: Bar[] = [];
            responseData.Data.forEach((bar) => {
                if (bar.time >= from && bar.time < to) {
                    bars.push({
                        time: bar.time * 1000, // convert to ms for TradingView
                        low: bar.low,
                        high: bar.high,
                        open: bar.open,
                        close: bar.close,
                    });
                }
            });
            console.log(`[getBars]: returned ${bars.length} bar(s)`);
            if (bars.length > 0) {
                lastBarsCache.set(symbolInfo.full_name, bars[bars.length - 1]);
            }
            onHistoryCallback(bars, { noData: false });
        } catch (error) {
            console.log('[getBars]: Get error', error);
            onErrorCallback(error);
        }
    },
    subscribeBars: (
        symbolInfo: any,
        resolution: string,
        onRealtimeCallback: (bar: Bar) => void,
        subscriberUID: string,
        onResetCacheNeededCallback: () => void
    ) => {
        console.log('[subscribeBars]: Method call with subscriberUID:', subscriberUID);
        subscribeOnStream(
            symbolInfo,
            resolution,
            onRealtimeCallback,
            subscriberUID,
            onResetCacheNeededCallback,
            lastBarsCache.get(symbolInfo.full_name) as Bar
        );
    },
    unsubscribeBars: (subscriberUID: string) => {
        console.log('[unsubscribeBars]: Method call with subscriberUID:', subscriberUID);
        unsubscribeFromStream(subscriberUID);
    },
};

export default Datafeed;