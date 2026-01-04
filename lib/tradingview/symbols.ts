import { generateSymbol, makeApiRequest } from './helpers'

export interface SymbolSearchItem {
    symbol: string
    ticker: string
    description: string
    exchange: string
    type: 'crypto'
}

interface AllExchangesResponse {
    Data: Record<string, { pairs: Record<string, string[]> }>
}

export async function fetchAllSymbols(): Promise<SymbolSearchItem[]> {
    const data = await makeApiRequest<AllExchangesResponse>('data/v3/all/exchanges')
    const exchanges = Object.keys(data.Data)
    let all: SymbolSearchItem[] = []
    for (const exchange of exchanges) {
        const pairs = data.Data[exchange].pairs
        for (const left of Object.keys(pairs)) {
            const symbols: SymbolSearchItem[] = pairs[left].map((right: string) => {
                const s = generateSymbol(exchange, left, right)
                return {
                    symbol: s.short,
                    ticker: s.short,
                    description: s.short,
                    exchange,
                    type: 'crypto'
                }
            })
            all = [...all, ...symbols]
        }
    }
    return all
} 