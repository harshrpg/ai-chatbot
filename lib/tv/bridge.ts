/**
 * This bridge exposes an API for the Trading View chart
 * Using this bridge we can control the chart with a controller
 * 
 * Author: Harsh Gupta
 */

// lib/tradingview/bridge.ts
"use client";
import type { IChartingLibraryWidget, IChartWidgetApi } from "@/public/charting_library/charting_library";

let widgetRef: IChartingLibraryWidget | null = null;
let chartRef: IChartWidgetApi | null = null;

// A promise that resolves when the widget is ready
let _resolve!: () => void;
export const ready = new Promise<void>((res) => (_resolve = res));

// Types for indicator management
export interface IndicatorConfig {
    name: string;
    parameters: Record<string, any>;
    visible: boolean;
    style?: StyleConfig;
}

export interface StyleConfig {
    color?: string;
    lineWidth?: number;
    plotType?: string;
}

export interface IndicatorResult {
    name: string;
    values: number[];
    parameters: Record<string, any>;
    interpretation: string;
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface TimeframeConfig {
    interval: string;
    period: number;
}

// Pattern drawing types
export interface ChartCoordinate {
    time: number;
    price: number;
}

export interface PatternResult {
    type: PatternType;
    confidence: number;
    coordinates: ChartCoordinate[];
    description: string;
    implications: string[];
    priceTargets: PriceTarget[];
}

export interface PriceTarget {
    level: number;
    type: 'ENTRY' | 'TARGET' | 'STOP_LOSS';
    confidence: number;
    reasoning: string;
}

export interface SupportResistanceLevel {
    level: number;
    strength: number;
    type: 'SUPPORT' | 'RESISTANCE';
    touches: number;
    description: string;
}

export interface ChartAnnotation {
    type: 'LINE' | 'SHAPE' | 'TEXT' | 'INDICATOR';
    coordinates: ChartCoordinate[];
    style: StyleConfig;
    label?: string;
    description?: string;
}

export type PatternType =
    | 'TRIANGLE_ASCENDING'
    | 'TRIANGLE_DESCENDING'
    | 'TRIANGLE_SYMMETRICAL'
    | 'HEAD_AND_SHOULDERS'
    | 'DOUBLE_TOP'
    | 'DOUBLE_BOTTOM'
    | 'CHANNEL_UP'
    | 'CHANNEL_DOWN'
    | 'TREND_LINE'
    | 'SUPPORT_LEVEL'
    | 'RESISTANCE_LEVEL';

// Store applied indicators and patterns for management
const appliedIndicators = new Map<string, any>();
const appliedPatterns = new Map<string, any>();
const appliedAnnotations = new Map<string, any>();
const appliedPriceTargets = new Map<string, any>();

export function registerWidget(widget: IChartingLibraryWidget) {
    widgetRef = widget;
    chartRef = widget.activeChart();
    console.log(`Chart Ref registered: ${chartRef}`)
    _resolve?.();
}

export function unregisterWidget() {
    widgetRef = null;
    chartRef = null;
    appliedIndicators.clear();
    appliedPatterns.clear();
    appliedAnnotations.clear();
    appliedPriceTargets.clear();
}

// ---- public, awaitable actions ----
export async function addMACD(params?: Record<string, any>) {
    await ready;
    console.log('--------Chartref: ', chartRef)
    const study = chartRef?.createStudy("MACD", false, false, params ?? { in_0: 12, in_1: 26, in_2: 9, in_3: "close" });
    if (study) {
        appliedIndicators.set("MACD", study);
    }
    return study;
}

export async function setSymbol(symbol: string, interval: string = "1D") {
    await ready;
    // New Charting Library API expects options/callback as 2nd arg; interval must be set via setResolution.
    if (!chartRef) return;
    await chartRef.setSymbol(symbol);
    if (interval) {
        await chartRef.setResolution(interval as any);
    }
}

export async function addRSI(length = 14) {
    await ready;
    const study = chartRef?.createStudy("Relative Strength Index", false, false, { length });
    if (study) {
        appliedIndicators.set("RSI", study);
    }
    return study;
}

export async function resetChart() {
    await ready;
    chartRef?.resetData();
    appliedIndicators.clear();
    appliedPatterns.clear();
    appliedAnnotations.clear();
    appliedPriceTargets.clear();
}

// ---- Enhanced Indicator Management ----

/**
 * Apply a technical indicator with optimized parameters based on timeframe
 */
export async function applyIndicator(config: IndicatorConfig): Promise<any> {
    await ready;
    if (!chartRef) throw new Error("Chart not available");

    const optimizedParams = optimizeIndicatorParameters(config.name, config.parameters);
    const study = chartRef.createStudy(config.name, false, config.visible, optimizedParams);

    if (study) {
        appliedIndicators.set(config.name, study);
    }

    return study;
}

/**
 * Apply multiple indicators at once
 */
export async function applyMultipleIndicators(configs: IndicatorConfig[]): Promise<any[]> {
    await ready;
    const results = [];

    for (const config of configs) {
        try {
            const study = await applyIndicator(config);
            results.push(study);
        } catch (error) {
            console.error(`Failed to apply indicator ${config.name}:`, error);
            results.push(null);
        }
    }

    return results;
}

/**
 * Remove an indicator by name
 */
export async function removeIndicator(indicatorName: string): Promise<void> {
    await ready;
    const study = appliedIndicators.get(indicatorName);
    if (study && chartRef) {
        chartRef.removeEntity(study);
        appliedIndicators.delete(indicatorName);
    }
}

/**
 * Get list of currently applied indicators
 */
export function getAppliedIndicators(): string[] {
    return Array.from(appliedIndicators.keys());
}

/**
 * Clear all applied indicators
 */
export async function clearAllIndicators(): Promise<void> {
    await ready;
    if (!chartRef) return;

    for (const [name, study] of appliedIndicators) {
        try {
            chartRef.removeEntity(study);
        } catch (error) {
            console.error(`Failed to remove indicator ${name}:`, error);
        }
    }
    appliedIndicators.clear();
}

/**
 * Remove all studies/indicators from the chart, including ones not added via this bridge.
 * Uses Charting Library API if available.
 */
export async function removeAllStudies(): Promise<void> {
    await ready;
    if (!chartRef) return;
    try {
        // Call underlying Charting Library API (not typed), if present
        (chartRef as any)?.removeAllStudies?.();
    } catch (error) {
        console.error('Failed to remove all studies:', error);
    }
    appliedIndicators.clear();
}

/**
 * Apply Moving Average with optimized parameters
 */
export async function addMovingAverage(period: number = 20, type: 'SMA' | 'EMA' = 'SMA'): Promise<any> {
    await ready;
    const studyName = type === 'EMA' ? 'Moving Average Exponential' : 'Moving Average';
    const params = { length: period };

    const study = chartRef?.createStudy(studyName, false, true, params);
    if (study) {
        appliedIndicators.set(`${type}_${period}`, study);
    }
    return study;
}

/**
 * Apply Bollinger Bands with optimized parameters
 */
export async function addBollingerBands(period: number = 20, stdDev: number = 2): Promise<any> {
    await ready;
    const params = { length: period, mult: stdDev };

    const study = chartRef?.createStudy('Bollinger Bands', false, true, params);
    if (study) {
        appliedIndicators.set('BB', study);
    }
    return study;
}

/**
 * Apply Stochastic oscillator
 */
export async function addStochastic(kPeriod: number = 14, dPeriod: number = 3): Promise<any> {
    await ready;
    const params = { k: kPeriod, d: dPeriod };

    const study = chartRef?.createStudy('Stochastic', false, true, params);
    if (study) {
        appliedIndicators.set('Stochastic', study);
    }
    return study;
}

/**
 * Optimize indicator parameters based on timeframe and market conditions
 */
function optimizeIndicatorParameters(indicatorName: string, baseParams: Record<string, any>): Record<string, any> {
    // Get current timeframe (this would need to be tracked or retrieved from chart)
    // For now, we'll use default optimizations

    const optimizations: Record<string, Record<string, any>> = {
        'RSI': {
            // Shorter periods for intraday, longer for daily+
            length: baseParams.length || 14
        },
        'MACD': {
            in_0: baseParams.in_0 || 12,
            in_1: baseParams.in_1 || 26,
            in_2: baseParams.in_2 || 9,
            in_3: baseParams.in_3 || 'close'
        },
        'Moving Average': {
            length: baseParams.length || 20
        },
        'Bollinger Bands': {
            length: baseParams.length || 20,
            mult: baseParams.mult || 2
        },
        'Stochastic': {
            k: baseParams.k || 14,
            d: baseParams.d || 3
        }
    };

    return { ...baseParams, ...(optimizations[indicatorName] || {}) };
}

/**
 * Interpret indicator signals and extract trading signals
 */
export async function interpretIndicatorSignals(): Promise<IndicatorResult[]> {
    await ready;
    const results: IndicatorResult[] = [];

    // This is a simplified interpretation - in a real implementation,
    // you would need to access the actual indicator values from the chart
    for (const [name] of appliedIndicators) {
        const result: IndicatorResult = {
            name,
            values: [], // Would be populated with actual values
            parameters: {},
            interpretation: getIndicatorInterpretation(name),
            signal: getIndicatorSignal(name)
        };
        results.push(result);
    }

    return results;
}

/**
 * Get basic interpretation for an indicator
 */
function getIndicatorInterpretation(indicatorName: string): string {
    const interpretations: Record<string, string> = {
        'RSI': 'Measures momentum - values above 70 suggest overbought, below 30 suggest oversold',
        'MACD': 'Shows relationship between two moving averages - crossovers indicate potential trend changes',
        'Moving Average': 'Smooths price data to identify trend direction',
        'Bollinger Bands': 'Shows volatility and potential support/resistance levels',
        'Stochastic': 'Momentum oscillator comparing closing price to price range'
    };

    return interpretations[indicatorName] || 'Technical indicator for market analysis';
}

/**
 * Get basic signal for an indicator (simplified)
 */
function getIndicatorSignal(indicatorName: string): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    // This is a placeholder - real implementation would analyze actual values
    return 'NEUTRAL';
}

// ---- Pattern Drawing Capabilities ----

/**
 * Draw a trend line on the chart
 */
export async function drawTrendLine(
    startPoint: ChartCoordinate,
    endPoint: ChartCoordinate,
    style: StyleConfig = {},
    label?: string
): Promise<any> {
    await ready;
    if (!chartRef) throw new Error("Chart not available");

    const lineStyle = {
        color: style.color || '#2196F3',
        lineWidth: style.lineWidth || 2,
        ...style
    };

    // Create trend line using TradingView's drawing tools
    const shape = chartRef.createShape(
        { time: startPoint.time, price: startPoint.price },
        {
            shape: 'horizontal_line',
            overrides: lineStyle,
            text: label || ''
        }
    );

    if (shape) {
        const patternId = `trendline_${Date.now()}`;
        appliedPatterns.set(patternId, shape);
        return { id: patternId, shape };
    }

    return null;
}

/**
 * Draw support or resistance level
 */
export async function drawSupportResistanceLevel(
    level: SupportResistanceLevel,
    style: StyleConfig = {}
): Promise<any> {
    await ready;
    if (!chartRef) throw new Error("Chart not available");

    const lineStyle = {
        color: level.type === 'SUPPORT' ? '#4CAF50' : '#F44336',
        lineWidth: Math.max(1, Math.min(5, level.strength)),
        lineStyle: level.strength > 3 ? 0 : 1, // Solid for strong levels, dashed for weak
        ...style
    };

    // Create horizontal line for support/resistance
    const shape = chartRef.createShape(
        { time: Date.now() / 1000, price: level.level },
        {
            shape: 'horizontal_line',
            overrides: lineStyle,
            text: `${level.type} ${level.level.toFixed(2)} (${level.touches} touches)`
        }
    );

    if (shape) {
        const patternId = `${level.type.toLowerCase()}_${level.level}`;
        appliedPatterns.set(patternId, shape);
        return { id: patternId, shape };
    }

    return null;
}

/**
 * Draw a chart pattern (triangle, channel, etc.)
 */
export async function drawPattern(pattern: PatternResult): Promise<any> {
    await ready;
    if (!chartRef) throw new Error("Chart not available");

    const results = [];
    const patternStyle = getPatternStyle(pattern.type, pattern.confidence);

    // Draw pattern based on type
    switch (pattern.type) {
        case 'TRIANGLE_ASCENDING':
        case 'TRIANGLE_DESCENDING':
        case 'TRIANGLE_SYMMETRICAL':
            results.push(await drawTrianglePattern(pattern, patternStyle));
            break;
        case 'CHANNEL_UP':
        case 'CHANNEL_DOWN':
            results.push(await drawChannelPattern(pattern, patternStyle));
            break;
        case 'HEAD_AND_SHOULDERS':
            results.push(await drawHeadAndShouldersPattern(pattern, patternStyle));
            break;
        case 'DOUBLE_TOP':
        case 'DOUBLE_BOTTOM':
            results.push(await drawDoubleTopBottomPattern(pattern, patternStyle));
            break;
        default:
            // Draw as generic trend lines
            for (let i = 0; i < pattern.coordinates.length - 1; i++) {
                const line = await drawTrendLine(
                    pattern.coordinates[i],
                    pattern.coordinates[i + 1],
                    patternStyle,
                    pattern.description
                );
                results.push(line);
            }
    }

    // Add pattern annotation
    if (pattern.coordinates.length > 0) {
        const annotation = await addPatternAnnotation(pattern);
        results.push(annotation);
    }

    return results;
}

/**
 * Draw multiple patterns at once
 */
export async function drawMultiplePatterns(patterns: PatternResult[]): Promise<any[]> {
    const results = [];

    for (const pattern of patterns) {
        try {
            const patternResult = await drawPattern(pattern);
            results.push(patternResult);
        } catch (error) {
            console.error(`Failed to draw pattern ${pattern.type}:`, error);
            results.push(null);
        }
    }

    return results;
}

/**
 * Remove a pattern by ID
 */
export async function removePattern(patternId: string): Promise<void> {
    await ready;
    const pattern = appliedPatterns.get(patternId);
    if (pattern && chartRef) {
        chartRef.removeEntity(pattern);
        appliedPatterns.delete(patternId);
    }
}

/**
 * Clear all patterns
 */
export async function clearAllPatterns(): Promise<void> {
    await ready;
    if (!chartRef) return;

    for (const [id, pattern] of appliedPatterns) {
        try {
            chartRef.removeEntity(pattern);
        } catch (error) {
            console.error(`Failed to remove pattern ${id}:`, error);
        }
    }
    appliedPatterns.clear();
}

/**
 * Get applied patterns list
 */
export function getAppliedPatterns(): string[] {
    return Array.from(appliedPatterns.keys());
}

// ---- Helper Functions for Pattern Drawing ----

function getPatternStyle(patternType: PatternType, confidence: number): StyleConfig {
    const baseStyle: StyleConfig = {
        lineWidth: Math.max(1, Math.min(4, Math.floor(confidence * 4))),
    };

    const colorMap: Record<PatternType, string> = {
        'TRIANGLE_ASCENDING': '#4CAF50',
        'TRIANGLE_DESCENDING': '#F44336',
        'TRIANGLE_SYMMETRICAL': '#FF9800',
        'HEAD_AND_SHOULDERS': '#9C27B0',
        'DOUBLE_TOP': '#F44336',
        'DOUBLE_BOTTOM': '#4CAF50',
        'CHANNEL_UP': '#2196F3',
        'CHANNEL_DOWN': '#2196F3',
        'TREND_LINE': '#607D8B',
        'SUPPORT_LEVEL': '#4CAF50',
        'RESISTANCE_LEVEL': '#F44336'
    };

    return {
        ...baseStyle,
        color: colorMap[patternType] || '#607D8B'
    };
}

async function drawTrianglePattern(pattern: PatternResult, style: StyleConfig): Promise<any> {
    if (pattern.coordinates.length < 4) return null;

    // Draw upper and lower trend lines for triangle
    const upperLine = await drawTrendLine(
        pattern.coordinates[0],
        pattern.coordinates[2],
        style,
        `${pattern.type} Upper`
    );

    const lowerLine = await drawTrendLine(
        pattern.coordinates[1],
        pattern.coordinates[3],
        style,
        `${pattern.type} Lower`
    );

    return [upperLine, lowerLine];
}

async function drawChannelPattern(pattern: PatternResult, style: StyleConfig): Promise<any> {
    if (pattern.coordinates.length < 4) return null;

    // Draw parallel lines for channel
    const upperLine = await drawTrendLine(
        pattern.coordinates[0],
        pattern.coordinates[2],
        style,
        `${pattern.type} Upper`
    );

    const lowerLine = await drawTrendLine(
        pattern.coordinates[1],
        pattern.coordinates[3],
        style,
        `${pattern.type} Lower`
    );

    return [upperLine, lowerLine];
}

async function drawHeadAndShouldersPattern(pattern: PatternResult, style: StyleConfig): Promise<any> {
    if (pattern.coordinates.length < 5) return null;

    const results = [];

    // Draw neckline
    const neckline = await drawTrendLine(
        pattern.coordinates[1],
        pattern.coordinates[3],
        { ...style, color: '#FF5722' },
        'Head and Shoulders Neckline'
    );
    results.push(neckline);

    // Connect the peaks
    for (let i = 0; i < pattern.coordinates.length - 1; i++) {
        const line = await drawTrendLine(
            pattern.coordinates[i],
            pattern.coordinates[i + 1],
            { ...style, lineWidth: 1 }
        );
        results.push(line);
    }

    return results;
}

async function drawDoubleTopBottomPattern(pattern: PatternResult, style: StyleConfig): Promise<any> {
    if (pattern.coordinates.length < 3) return null;

    const results = [];

    // Draw connecting lines
    for (let i = 0; i < pattern.coordinates.length - 1; i++) {
        const line = await drawTrendLine(
            pattern.coordinates[i],
            pattern.coordinates[i + 1],
            style
        );
        results.push(line);
    }

    return results;
}

async function addPatternAnnotation(pattern: PatternResult): Promise<any> {
    await ready;
    if (!chartRef || pattern.coordinates.length === 0) return null;

    // Add text annotation at the center of the pattern
    const centerCoord = pattern.coordinates[Math.floor(pattern.coordinates.length / 2)];

    const annotation = chartRef.createShape(
        { time: centerCoord.time, price: centerCoord.price },
        {
            shape: 'text',
            text: `${pattern.type}\nConfidence: ${(pattern.confidence * 100).toFixed(0)}%`,
            overrides: {
                color: '#FFFFFF',
                backgroundColor: 'rgba(0,0,0,0.7)',
                fontSize: 12
            }
        }
    );

    if (annotation) {
        const annotationId = `annotation_${pattern.type}_${Date.now()}`;
        appliedAnnotations.set(annotationId, annotation);
        return { id: annotationId, annotation };
    }

    return null;
}
// ---- Price Target Visualization ----

/**
 * Draw a single price target line with label
 */
export async function drawPriceTarget(
    target: PriceTarget,
    style: StyleConfig = {}
): Promise<any> {
    await ready;
    if (!chartRef) throw new Error("Chart not available");

    const targetStyle = getPriceTargetStyle(target.type, target.confidence);
    const finalStyle = { ...targetStyle, ...style };

    // Create horizontal line for price target
    const line = chartRef.createShape(
        { time: Date.now() / 1000, price: target.level },
        {
            shape: 'horizontal_line',
            overrides: finalStyle,
            text: formatPriceTargetLabel(target)
        }
    );

    if (line) {
        const targetId = `${target.type.toLowerCase()}_${target.level}`;
        appliedPriceTargets.set(targetId, line);

        // Add tooltip/label for the price target
        const label = await addPriceTargetLabel(target);

        return { id: targetId, line, label };
    }

    return null;
}

/**
 * Draw multiple price targets at once
 */
export async function drawMultiplePriceTargets(targets: PriceTarget[]): Promise<any[]> {
    const results = [];

    for (const target of targets) {
        try {
            const targetResult = await drawPriceTarget(target);
            results.push(targetResult);
        } catch (error) {
            console.error(`Failed to draw price target ${target.type} at ${target.level}:`, error);
            results.push(null);
        }
    }

    return results;
}

/**
 * Update an existing price target
 */
export async function updatePriceTarget(
    targetId: string,
    newTarget: PriceTarget
): Promise<any> {
    await ready;

    // Remove existing target
    await removePriceTarget(targetId);

    // Draw new target
    return await drawPriceTarget(newTarget);
}

/**
 * Remove a price target by ID
 */
export async function removePriceTarget(targetId: string): Promise<void> {
    await ready;
    const target = appliedPriceTargets.get(targetId);
    if (target && chartRef) {
        chartRef.removeEntity(target);
        appliedPriceTargets.delete(targetId);
    }
}

/**
 * Clear all price targets
 */
export async function clearAllPriceTargets(): Promise<void> {
    await ready;
    if (!chartRef) return;

    for (const [id, target] of appliedPriceTargets) {
        try {
            chartRef.removeEntity(target);
        } catch (error) {
            console.error(`Failed to remove price target ${id}:`, error);
        }
    }
    appliedPriceTargets.clear();
}

/**
 * Get list of applied price targets
 */
export function getAppliedPriceTargets(): string[] {
    return Array.from(appliedPriceTargets.keys());
}

/**
 * Draw buy/sell/stop-loss levels with different styling
 */
export async function drawTradingLevels(
    entryLevel: number,
    targetLevel: number,
    stopLossLevel: number,
    reasoning: string = ''
): Promise<any[]> {
    const targets: PriceTarget[] = [
        {
            level: entryLevel,
            type: 'ENTRY',
            confidence: 0.8,
            reasoning: `Entry point: ${reasoning}`
        },
        {
            level: targetLevel,
            type: 'TARGET',
            confidence: 0.7,
            reasoning: `Price target: ${reasoning}`
        },
        {
            level: stopLossLevel,
            type: 'STOP_LOSS',
            confidence: 0.9,
            reasoning: `Stop loss: ${reasoning}`
        }
    ];

    return await drawMultiplePriceTargets(targets);
}

/**
 * Create dynamic price targets that update based on market changes
 */
export async function createDynamicPriceTargets(
    baseTargets: PriceTarget[],
    updateCallback?: (targets: PriceTarget[]) => void
): Promise<any[]> {
    // Draw initial targets
    const results = await drawMultiplePriceTargets(baseTargets);

    // Set up dynamic updates (simplified - would need real market data integration)
    if (updateCallback) {
        // This would be connected to real-time price updates
        setTimeout(() => {
            const updatedTargets = baseTargets.map(target => ({
                ...target,
                // Simulate dynamic adjustment
                level: target.level * (1 + (Math.random() - 0.5) * 0.01)
            }));
            updateCallback(updatedTargets);
        }, 5000);
    }

    return results;
}

// ---- Helper Functions for Price Target Visualization ----

function getPriceTargetStyle(targetType: PriceTarget['type'], confidence: number): StyleConfig {
    const baseStyle: StyleConfig = {
        lineWidth: Math.max(1, Math.min(3, Math.floor(confidence * 3))),
        // lineStyle: confidence > 0.7 ? 0 : 1, // Solid for high confidence, dashed for low
    };

    const styleMap: Record<PriceTarget['type'], Partial<StyleConfig>> = {
        'ENTRY': {
            color: '#2196F3',
            lineWidth: 2
        },
        'TARGET': {
            color: '#4CAF50',
            lineWidth: 2
        },
        'STOP_LOSS': {
            color: '#F44336',
            lineWidth: 3
        }
    };

    return {
        ...baseStyle,
        ...styleMap[targetType]
    };
}

function formatPriceTargetLabel(target: PriceTarget): string {
    const typeLabels = {
        'ENTRY': 'Entry',
        'TARGET': 'Target',
        'STOP_LOSS': 'Stop Loss'
    };

    const confidence = `${(target.confidence * 100).toFixed(0)}%`;
    return `${typeLabels[target.type]}: ${target.level.toFixed(2)} (${confidence})`;
}

async function addPriceTargetLabel(target: PriceTarget): Promise<any> {
    await ready;
    if (!chartRef) return null;

    const label = chartRef.createShape(
        { time: Date.now() / 1000, price: target.level },
        {
            shape: 'text',
            text: formatPriceTargetLabel(target),
            overrides: {
                color: '#FFFFFF',
                backgroundColor: getPriceTargetStyle(target.type, target.confidence).color,
                fontSize: 11,
                bold: true
            }
        }
    );

    if (label) {
        const labelId = `label_${target.type.toLowerCase()}_${target.level}`;
        appliedAnnotations.set(labelId, label);
        return { id: labelId, label };
    }

    return null;
}

/**
 * Add tooltip with detailed reasoning for price target
 */
export async function addPriceTargetTooltip(
    target: PriceTarget,
    position: ChartCoordinate
): Promise<any> {
    await ready;
    if (!chartRef) return null;

    const tooltip = chartRef.createShape(
        { time: position.time, price: position.price },
        {
            shape: 'flag',
            text: `${formatPriceTargetLabel(target)}\n\nReasoning:\n${target.reasoning}`,
            overrides: {
                color: '#333333',
                backgroundColor: 'rgba(255,255,255,0.95)',
                fontSize: 10,
                borderColor: getPriceTargetStyle(target.type, target.confidence).color,
                borderWidth: 2
            }
        }
    );

    if (tooltip) {
        const tooltipId = `tooltip_${target.type.toLowerCase()}_${Date.now()}`;
        appliedAnnotations.set(tooltipId, tooltip);
        return { id: tooltipId, tooltip };
    }

    return null;
}