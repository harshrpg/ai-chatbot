'use client';

import { ready } from "./bridge";

export type StudyInputInformation = {
    id: string;
    name: string;
    localizedName: string;
    type: string;
}

export type StudySchema = {
    name: string;
    inputs: StudyInputInformation[];
}

function getWidget(): any | null {
    const w = (window as any)?.tvWidget
        ?? (window as any)?.widget
        ?? (window as any)?.TradingView?.widgetInstance
        ?? null;
    return w;
}

function keyOf(studyName: string) {
    return studyName.trim().toLowerCase();
}

type CacheEntry =
    | { ok: true; schema: StudySchema }
    | { ok: false; error: string };

const cache = new Map<string, CacheEntry>();

/**
 * Fetch StudyInputInformation[] from the widget, cache, and return a StudySchema.
 * Will throw on hard failures; caches both success and error states.
 */
export async function getStudySchema(studyName: string): Promise<StudySchema> {
    const k = keyOf(studyName);
    const cached = cache.get(k);
    if (cached?.ok) return cached.schema;
    if (cached && !cached.ok) throw new Error(cached.error);

    await ready;

    const w = getWidget();
    if (!w) {
        const err = "TradingView widget not available";
        cache.set(k, { ok: false, error: err });
        throw new Error(err);
    }

    let inputs: StudyInputInformation[] | undefined;

    try {
        if (typeof w.getStudyInputs === "function") {
            inputs = w.getStudyInputs(studyName);
        } else if (typeof w.activeChart === "function" && typeof w.activeChart()?.getStudyInputs === "function") {
            inputs = w.activeChart().getStudyInputs(studyName);
        }
    } catch (e) {
        const err = `getStudyInputs failed for "${studyName}": ${e instanceof Error ? e.message : String(e)}`;
        cache.set(k, { ok: false, error: err });
        throw new Error(err);
    }
    // Normalize & validate
    if (!Array.isArray(inputs)) inputs = [];
    const normalized = inputs.map((i) => ({
        id: String(i.id),
        name: String((i as any).name ?? ""),
        localizedName: String((i as any).localizedName ?? (i as any).name ?? ""),
        type: String((i as any).type ?? ""),
    })) as StudyInputInformation[];

    const schema: StudySchema = { name: studyName, inputs: normalized };
    cache.set(k, { ok: true, schema });
    return schema;
}

/** Check if we already cached a study (successfully). */
export function hasStudy(studyName: string): boolean {
    const c = cache.get(keyOf(studyName));
    return !!(c && c.ok);
}

/** Read from cache without fetching (undefined if missing or cached error). */
export function peekStudySchema(studyName: string): StudySchema | undefined {
    const c = cache.get(keyOf(studyName));
    return c?.ok ? c.schema : undefined;
}

/** Clear cache (all or single study). */
export function clearStudyCache(studyName?: string) {
    if (!studyName) cache.clear();
    else cache.delete(keyOf(studyName));
}

/**
 * Bulk prefetch with simple concurrency control.
 * Returns a summary including failures (but does not throw).
 */
export async function prefetchStudySchemas(
    studies: string[],
    opts: { concurrency?: number; onProgress?: (done: number, total: number, name: string) => void } = {}
): Promise<{
    total: number;
    success: string[];
    failed: Array<{ name: string; error: string }>;
}> {
    const total = studies.length;
    const success: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    const concurrency = Math.max(1, opts.concurrency ?? 8);
    let idx = 0;
    let done = 0;

    async function worker() {
        while (idx < total) {
            const current = studies[idx++];
            try {
                await getStudySchema(current);
                success.push(current);
            } catch (e) {
                failed.push({ name: current, error: e instanceof Error ? e.message : String(e) });
            } finally {
                done++;
                opts.onProgress?.(done, total, current);
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));

    return { total, success, failed };
}

/**
 * Produce a compact JSON safe for LLMs/UI:
 *  { name, inputs: [{ id, name, localizedName, type }] }
 */
export async function getSchemasForLLM(studies: string[]) {
    const results: Array<{ name: string; inputs: Array<Pick<StudyInputInformation, "id" | "name" | "localizedName" | "type">> }> = [];
    for (const s of studies) {
        try {
            const schema = await getStudySchema(s);
            results.push({
                name: schema.name,
                inputs: schema.inputs.map(({ id, name, localizedName, type }) => ({ id, name, localizedName, type })),
            });
        } catch {
            // skip missing/unsupported studies silently for LLM payloads
        }
    }
    return results;
}

/** Utility: search cached studies/inputs by substring (case-insensitive). */
export function searchCachedInputs(query: string) {
    const q = query.trim().toLowerCase();
    const hits: Array<{ study: string; input: StudyInputInformation }> = [];
    for (const [, entry] of cache) {
        if (!entry.ok) continue;
        const { name, inputs } = entry.schema;
        if (name.toLowerCase().includes(q)) {
            inputs.forEach((input) => hits.push({ study: name, input }));
            continue;
        }
        for (const input of inputs) {
            if (
                input.name.toLowerCase().includes(q) ||
                input.localizedName.toLowerCase().includes(q) ||
                input.id.toLowerCase().includes(q)
            ) {
                hits.push({ study: name, input });
            }
        }
    }
    return hits;
}