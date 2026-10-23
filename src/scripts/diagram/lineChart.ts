// 折れ線グラフ（SVG）の共通部品：軸・目盛・凡例・系列の線・縦の補助線・点の印

import { escapeHtml } from '../utils';
import { LINE_HEIGHT, MARGIN, svgDocument, textWidth, wrapText } from './svg';
import type { RenderedSvg } from './svg';

/**
 * 系列の色（この順に割り当て、使い回さない）。
 * 隣り合う色どうしが色覚の多様性を考慮しても区別できる並び。
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
/** SERIES_COLORS を使い切った系列の色（凡例と線の端のラベルで区別する） */
export const OVERFLOW_COLOR = '#898781';

const INK = '#0b0b0b';
const INK_SECONDARY = '#52514e';
const INK_MUTED = '#898781';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';
const SURFACE = '#ffffff';

const TICK_FONT = 12;
const PLOT_WIDTH = 560;
const PLOT_HEIGHT = 320;
const AXIS_LEFT = 64;
const AXIS_BOTTOM = 48;
const LEGEND_KEY = 18;
const LEGEND_GAP = 18;
/** 線の端のラベルの最大幅 */
const END_LABEL_WIDTH = 140;

export interface LineSeries {
    name: string;
    color: string;
    /** [x, y] の並び（x の昇順） */
    points: [number, number][];
}

/** 縦の補助線（現在値・読み取り位置など） */
export interface ChartGuide {
    x: number;
    label: string;
    /** solid: 実線 / dotted: 点線 */
    style: 'solid' | 'dotted';
}

/** 点の印（交点など） */
export interface ChartMarker {
    x: number;
    y: number;
    label?: string;
    /** emphasis: 塗りつぶした大きな印 / normal: 小さな白抜きの印 */
    kind: 'emphasis' | 'normal';
}

export interface LineChartSpec {
    xLabel: string;
    yLabel: string;
    xDomain: [number, number];
    yDomain: [number, number];
    xTicks: number[];
    yTicks: number[];
    formatX: (v: number) => string;
    formatY: (v: number) => string;
    series: LineSeries[];
    guides?: ChartGuide[];
    markers?: ChartMarker[];
    /** 読み取り位置。各系列の線の上に点を打つ */
    cursorX?: number | null;
}

/** グラフの座標と SVG の座標の対応（ポインタ位置から x を求めるときにも使う） */
export interface ChartFrame {
    left: number;
    top: number;
    width: number;
    height: number;
    xDomain: [number, number];
}

export interface RenderedChart extends RenderedSvg {
    frame: ChartFrame;
}

/** 長い名前は 1 行に収まるところで切って「…」を付ける */
function truncate(text: string, maxWidth: number): string {
    const [first] = wrapText(text, maxWidth);
    return first.length < text.length ? `${first.slice(0, -1)}…` : text;
}

function interpolate(points: [number, number][], x: number): number | null {
    for (let i = 0; i < points.length - 1; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        if (x >= x0 && x <= x1) return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return null;
}

/** 凡例を幅に収まるよう折り返して並べる */
function layoutLegend(series: LineSeries[], width: number): { items: { s: LineSeries; x: number; y: number; label: string }[]; height: number } {
    const items: { s: LineSeries; x: number; y: number; label: string }[] = [];
    let x = 0;
    let y = 0;
    series.forEach(s => {
        const label = truncate(s.name, END_LABEL_WIDTH);
        const itemWidth = LEGEND_KEY + 6 + textWidth(label);
        if (x > 0 && x + itemWidth > width) {
            x = 0;
            y += LINE_HEIGHT;
        }
        items.push({ s, x, y, label });
        x += itemWidth + LEGEND_GAP;
    });
    return { items, height: series.length > 0 ? y + LINE_HEIGHT : 0 };
}

export function renderLineChart(spec: LineChartSpec): RenderedChart {
    const multi = spec.series.length > 1;
    const endLabelWidth = Math.min(END_LABEL_WIDTH, Math.max(0, ...spec.series.map(s => textWidth(s.name)))) + 12;
    const legend = multi ? layoutLegend(spec.series, PLOT_WIDTH + endLabelWidth) : { items: [], height: 0 };

    const frame: ChartFrame = {
        left: MARGIN + AXIS_LEFT,
        top: MARGIN + legend.height + (legend.height > 0 ? 16 : 0) + 20,
        width: PLOT_WIDTH,
        height: PLOT_HEIGHT,
        xDomain: spec.xDomain,
    };
    const width = frame.left + frame.width + endLabelWidth + MARGIN;
    const height = frame.top + frame.height + AXIS_BOTTOM + MARGIN;

    const [x0, x1] = spec.xDomain;
    const [y0, y1] = spec.yDomain;
    const sx = (v: number) => frame.left + ((v - x0) / (x1 - x0)) * frame.width;
    const sy = (v: number) => frame.top + frame.height - ((v - y0) / (y1 - y0)) * frame.height;
    const bottom = frame.top + frame.height;
    const right = frame.left + frame.width;

    const parts: string[] = [];

    // 凡例（線の形のキー）
    legend.items.forEach(({ s, x, y, label }) => {
        const lx = frame.left + x;
        const ly = MARGIN + y + LINE_HEIGHT / 2;
        parts.push(`<line x1="${lx}" y1="${ly}" x2="${lx + LEGEND_KEY}" y2="${ly}" stroke="${s.color}" stroke-width="3" stroke-linecap="round"/>`);
        parts.push(`<text x="${lx + LEGEND_KEY + 6}" y="${ly}" fill="${INK_SECONDARY}" dominant-baseline="central">${escapeHtml(label)}</text>`);
    });

    // 目盛と格子線
    spec.yTicks.forEach(v => {
        const y = sy(v);
        parts.push(`<line x1="${frame.left}" y1="${y}" x2="${right}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`);
        parts.push(`<text x="${frame.left - 8}" y="${y}" fill="${INK_MUTED}" font-size="${TICK_FONT}" text-anchor="end" dominant-baseline="central">${escapeHtml(spec.formatY(v))}</text>`);
    });
    spec.xTicks.forEach(v => {
        const x = sx(v);
        parts.push(`<line x1="${x}" y1="${frame.top}" x2="${x}" y2="${bottom}" stroke="${GRID}" stroke-width="1"/>`);
        parts.push(`<text x="${x}" y="${bottom + 16}" fill="${INK_MUTED}" font-size="${TICK_FONT}" text-anchor="middle">${escapeHtml(spec.formatX(v))}</text>`);
    });
    parts.push(`<line x1="${frame.left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="${AXIS}" stroke-width="1"/>`);
    parts.push(`<line x1="${frame.left}" y1="${frame.top}" x2="${frame.left}" y2="${bottom}" stroke="${AXIS}" stroke-width="1"/>`);

    // 軸の名前
    parts.push(`<text x="${frame.left + frame.width / 2}" y="${bottom + 40}" fill="${INK_SECONDARY}" text-anchor="middle">${escapeHtml(spec.xLabel)}</text>`);
    const yLabelX = MARGIN + 6;
    const yLabelY = frame.top + frame.height / 2;
    parts.push(`<text x="${yLabelX}" y="${yLabelY}" fill="${INK_SECONDARY}" text-anchor="middle" dominant-baseline="central" transform="rotate(-90 ${yLabelX} ${yLabelY})">${escapeHtml(spec.yLabel)}</text>`);

    // 縦の補助線（ラベルはグラフの上端の外に置く）
    (spec.guides ?? []).forEach(g => {
        const x = sx(g.x);
        const dash = g.style === 'dotted' ? ' stroke-dasharray="2 3"' : '';
        parts.push(`<line x1="${x}" y1="${frame.top}" x2="${x}" y2="${bottom}" stroke="${INK_SECONDARY}" stroke-width="1"${dash}/>`);
        parts.push(`<text x="${x}" y="${frame.top - 8}" fill="${INK_SECONDARY}" font-size="${TICK_FONT}" text-anchor="middle">${escapeHtml(g.label)}</text>`);
    });

    // 系列の線
    spec.series.forEach(s => {
        const d = s.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
        parts.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    });

    // 線の右端のラベル。重なるときは付けない（凡例で区別する）
    const ends = spec.series
        .filter(s => s.points.length > 0)
        .map(s => ({ s, y: sy(s.points[s.points.length - 1][1]) }))
        .sort((a, b) => a.y - b.y);
    const separated = ends.every((e, i) => i === 0 || e.y - ends[i - 1].y >= TICK_FONT + 2);
    if (multi && separated) {
        ends.forEach(({ s, y }) => {
            parts.push(`<text x="${right + 8}" y="${y}" fill="${INK_SECONDARY}" font-size="${TICK_FONT}" dominant-baseline="central">${escapeHtml(truncate(s.name, END_LABEL_WIDTH))}</text>`);
        });
    }

    // 交点などの印（線と重なっても見えるよう白い縁を付ける）
    (spec.markers ?? []).forEach(m => {
        const [cx, cy] = [sx(m.x), sy(m.y)];
        parts.push(m.kind === 'emphasis'
            ? `<circle cx="${cx}" cy="${cy}" r="5" fill="${INK}" stroke="${SURFACE}" stroke-width="2"/>`
            : `<circle cx="${cx}" cy="${cy}" r="4" fill="${SURFACE}" stroke="${INK_SECONDARY}" stroke-width="1.5"/>`);
        if (m.label) {
            parts.push(`<text x="${cx}" y="${cy - 12}" fill="${INK}" font-size="${TICK_FONT}" font-weight="bold" text-anchor="middle" stroke="${SURFACE}" stroke-width="3" paint-order="stroke">${escapeHtml(m.label)}</text>`);
        }
    });

    // 読み取り位置：縦線と各系列の点
    if (spec.cursorX !== undefined && spec.cursorX !== null) {
        const x = sx(spec.cursorX);
        parts.push(`<line x1="${x}" y1="${frame.top}" x2="${x}" y2="${bottom}" stroke="${INK}" stroke-width="1"/>`);
        spec.series.forEach(s => {
            const y = interpolate(s.points, spec.cursorX as number);
            if (y !== null) parts.push(`<circle cx="${x}" cy="${sy(y)}" r="4.5" fill="${s.color}" stroke="${SURFACE}" stroke-width="2"/>`);
        });
    }

    const doc = svgDocument(width, height, parts.join(''));
    return { ...doc, frame };
}

/** SVG 上のポインタ位置から x の値を求める（グラフの外なら端の値に揃える） */
export function chartXFromPointer(svg: SVGSVGElement, frame: ChartFrame, clientX: number): number {
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / (svg.viewBox.baseVal?.width || rect.width);
    const px = (clientX - rect.left) / scale;
    const [x0, x1] = frame.xDomain;
    const ratio = Math.min(1, Math.max(0, (px - frame.left) / frame.width));
    return x0 + ratio * (x1 - x0);
}
