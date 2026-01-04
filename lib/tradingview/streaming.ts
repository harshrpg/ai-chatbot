import { apiKey, parseFullSymbol } from './helpers';

// Coindesk Streaming Endpoint
const COINDESK_WS_URL = `wss://data-streamer.coindesk.com?api_key=${apiKey ?? ''}`;

type Bar = {
    time: number; // milliseconds
    open: number;
    high: number;
    low: number;
    close: number;
};

type SubscriptionHandler = {
    id: string;
    callback: (bar: Bar) => void;
};

type SubscriptionItem = {
    instrument: string; // e.g., BTC-USD
    resolution: string;
    lastDailyBar: Bar;
    handlers: SubscriptionHandler[];
};

// Map instrument -> subscription item
const instrumentToSubscription: Map<string, SubscriptionItem> = new Map();

// Queue of instruments to subscribe when socket opens
const pendingInstruments: Set<string> = new Set();

function getNextDailyBarTimeMs(barTimeMs: number): number {
    const date = new Date(barTimeMs);
    date.setDate(date.getDate() + 1);
    return date.getTime();
}

function makeSocket(): WebSocket {
    return new WebSocket(COINDESK_WS_URL);
}

let socket: WebSocket = makeSocket();

function sendOrQueueSubscribe(instrument: string): void {
    const payload = {
        action: 'SUBSCRIBE',
        type: 'index_cc_v1_latest_tick',
        groups: ['VALUE', 'CURRENT_HOUR'],
        market: 'cadli',
        instruments: [instrument],
    };
    if (socket.readyState === WebSocket.OPEN) {
        console.log('[subscribeBars]: SUBSCRIBE payload:', payload);
        socket.send(JSON.stringify(payload));
    } else {
        pendingInstruments.add(instrument);
        console.log('[subscribeBars]: Socket not open. Queued instrument:', instrument);
    }
}

function sendUnsubscribe(instrument: string): void {
    const payload = {
        action: 'UNSUBSCRIBE',
        type: 'index_cc_v1_latest_tick',
        groups: ['VALUE', 'CURRENT_HOUR'],
        market: 'cadli',
        instruments: [instrument],
    };
    if (socket.readyState === WebSocket.OPEN) {
        console.log('[unsubscribeBars]: UNSUBSCRIBE payload:', payload);
        socket.send(JSON.stringify(payload));
    }
}

function extractPrice(data: any): number | null {
    if (typeof data?.value === 'number') return data.value;
    if (typeof data?.VALUE === 'number') return data.VALUE;
    if (typeof data?.price === 'number') return data.price;
    if (typeof data?.PRICE === 'number') return data.PRICE;
    if (typeof data?.c === 'number') return data.c;
    if (Array.isArray(data?.VALUE) && typeof data.VALUE[0] === 'number') return data.VALUE[0];
    return null;
}

function extractTimestampMs(data: any): number {
    const ts = data?.ts ?? data?.timestamp ?? data?.TS ?? Date.now();
    const n = typeof ts === 'number' ? ts : Date.now();
    // Heuristic: assume seconds if < 1e12
    return n < 1e12 ? n * 1000 : n;
}

socket.addEventListener('open', () => {
    console.log('[socket] Connected');
    for (const instrument of pendingInstruments) {
        sendOrQueueSubscribe(instrument);
        pendingInstruments.delete(instrument);
    }
});

socket.addEventListener('close', (reason) => {
    console.log('[socket] Disconnected. Reason: ', reason);
    setTimeout(() => {
        console.log('[socket] Reconnecting...');
        socket = makeSocket();
        attachSocketHandlers();
    }, 1000);
});

socket.addEventListener('error', (error) => {
    console.log('[socket] Error occurred: ', error);
});

socket.addEventListener('message', (event) => {
    try {
        const data = JSON.parse(event.data as string);
        // console.log('[socket] Message: ', data);

        if (data?.MESSAGE === 'INVALID_PARAMETER' || data?.s === 'error') {
            console.warn('[socket] Error message from server:', data);
            return;
        }

        const instrument: string | undefined = (data?.instrument || data?.INSTRUMENT) as string | undefined;
        if (!instrument) return;

        const subscriptionItem = instrumentToSubscription.get(instrument);
        if (!subscriptionItem) return;

        const tradePrice = extractPrice(data);
        if (tradePrice == null) return;

        const tradeTimeMs = extractTimestampMs(data);
        const lastDailyBar = subscriptionItem.lastDailyBar;
        const nextDailyBarTimeMs = getNextDailyBarTimeMs(lastDailyBar.time);
        let bar: Bar;
        if (tradeTimeMs >= nextDailyBarTimeMs) {
            bar = {
                time: nextDailyBarTimeMs,
                open: tradePrice,
                high: tradePrice,
                low: tradePrice,
                close: tradePrice,
            };
            // console.log('[socket] Generate new bar', bar);
        } else {
            bar = {
                ...lastDailyBar,
                high: Math.max(lastDailyBar.high, tradePrice),
                low: Math.min(lastDailyBar.low, tradePrice),
                close: tradePrice,
            };
            // console.log('[socket] Update the latest bar by price', tradePrice);
        }
        subscriptionItem.lastDailyBar = bar;
        subscriptionItem.handlers.forEach((handler) => handler.callback(bar));
    } catch (err) {
        console.error('[socket] Failed to process message', err);
    }
});

function attachSocketHandlers() {
    socket.addEventListener('open', () => {
        console.log('[socket] Connected');
        for (const instrument of pendingInstruments) {
            sendOrQueueSubscribe(instrument);
            pendingInstruments.delete(instrument);
        }
    });

    socket.addEventListener('close', (reason) => {
        console.log('[socket] Disconnected. Reason: ', reason);
        setTimeout(() => {
            console.log('[socket] Reconnecting...');
            socket = makeSocket();
            attachSocketHandlers();
        }, 1000);
    });

    socket.addEventListener('error', (error) => {
        console.log('[socket] Error occurred: ', error);
    });

    socket.addEventListener('message', (event) => {
        try {
            const data = JSON.parse(event.data as string);
            console.log('[socket] Message: ', data);

            if (data?.MESSAGE === 'INVALID_PARAMETER' || data?.s === 'error') {
                console.warn('[socket] Error message from server:', data);
                return;
            }

            const instrument: string | undefined = (data?.instrument || data?.INSTRUMENT) as string | undefined;
            if (!instrument) return;

            const subscriptionItem = instrumentToSubscription.get(instrument);
            if (!subscriptionItem) return;

            const tradePrice = extractPrice(data);
            if (tradePrice == null) return;

            const tradeTimeMs = extractTimestampMs(data);
            const lastDailyBar = subscriptionItem.lastDailyBar;
            const nextDailyBarTimeMs = getNextDailyBarTimeMs(lastDailyBar.time);
            let bar: Bar;
            if (tradeTimeMs >= nextDailyBarTimeMs) {
                bar = {
                    time: nextDailyBarTimeMs,
                    open: tradePrice,
                    high: tradePrice,
                    low: tradePrice,
                    close: tradePrice,
                };
                console.log('[socket] Generate new bar', bar);
            } else {
                bar = {
                    ...lastDailyBar,
                    high: Math.max(lastDailyBar.high, tradePrice),
                    low: Math.min(lastDailyBar.low, tradePrice),
                    close: tradePrice,
                };
                console.log('[socket] Update the latest bar by price', tradePrice);
            }
            subscriptionItem.lastDailyBar = bar;
            subscriptionItem.handlers.forEach((handler) => handler.callback(bar));
        } catch (err) {
            console.error('[socket] Failed to process message', err);
        }
    });
}

export function subscribeOnStream(
    symbolInfo: any,
    resolution: string,
    onRealtimeCallback: (bar: Bar) => void,
    subscriberUID: string,
    onResetCacheNeededCallback: () => void,
    lastDailyBar: Bar
): void {
    const parsedSymbol = parseFullSymbol(symbolInfo.full_name);
    if (!parsedSymbol) {
        console.warn('[subscribeBars]: Invalid symbol format', symbolInfo.full_name);
        return;
    }
    const instrument = `${parsedSymbol.fromSymbol}-${parsedSymbol.toSymbol}`; // BTC-USD
    const handler: SubscriptionHandler = { id: subscriberUID, callback: onRealtimeCallback };
    let subscriptionItem = instrumentToSubscription.get(instrument);
    if (subscriptionItem) {
        subscriptionItem.handlers.push(handler);
    } else {
        subscriptionItem = {
            instrument,
            resolution,
            lastDailyBar,
            handlers: [handler],
        };
        instrumentToSubscription.set(instrument, subscriptionItem);
    }
    console.log('[subscribeBars]: Subscribe instrument:', instrument);
    sendOrQueueSubscribe(instrument);
}

export function unsubscribeFromStream(subscriberUID: string): void {
    for (const [instrument, subscriptionItem] of instrumentToSubscription.entries()) {
        const handlerIndex = subscriptionItem.handlers.findIndex((h) => h.id === subscriberUID);
        if (handlerIndex !== -1) {
            subscriptionItem.handlers.splice(handlerIndex, 1);
            if (subscriptionItem.handlers.length === 0) {
                console.log('[unsubscribeBars]: Unsubscribe instrument:', instrument);
                sendUnsubscribe(instrument);
                instrumentToSubscription.delete(instrument);
            }
            break;
        }
    }
}