export const apiKey: string | undefined = process.env.CRYPTO_COMPARE_API as string | undefined;

export async function makeApiRequest<T = unknown>(path: string): Promise<T> {
    try {
        const url = new URL(`https://min-api.cryptocompare.com/${path}`);
        if (apiKey) {
            url.searchParams.append('api_key', apiKey);
        }
        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        return (await response.json()) as T;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`CryptoCompare request error: ${message}`);
    }
}

export interface GeneratedSymbol {
    short: string;
}

export function generateSymbol(exchange: string, fromSymbol: string, toSymbol: string): GeneratedSymbol {
    const short = `${fromSymbol}/${toSymbol}`;
    return { short };
}

export interface ParsedFullSymbol {
    fromSymbol: string;
    toSymbol: string;
}

export function parseFullSymbol(fullSymbol: string): ParsedFullSymbol | null {
    const match = fullSymbol.match(/^(\w+)\/(\w+)$/);
    if (!match) {
        return null;
    }
    return { fromSymbol: match[1], toSymbol: match[2] };
}