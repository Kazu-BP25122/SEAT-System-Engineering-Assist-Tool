// 感度分析：評価基準のウエイトを 0 〜 1 で動かしたときの総合評価の変化をグラフで表示する

import { escapeHtml } from '../utils';
import { OVERFLOW_COLOR, SERIES_COLORS, chartXFromPointer, renderLineChart } from '../diagram/lineChart';
import type { ChartFrame, ChartMarker, RenderedChart } from '../diagram/lineChart';
import { mountDiagramPanel } from '../diagram/panel';
import { reversalPoints, scoresAt, shiftWeights } from './calc';
import type { SensitivityAnalysis } from './calc';
import { analyzeCalcData, analyzeCalcSensitivity } from './data';
import type { AhpCalcData, SensitivityState } from './data';

/** ポインタで読み取るウエイトの刻み */
const CURSOR_STEP = 0.01;

export function seriesColor(k: number): string {
    return SERIES_COLORS[k] ?? OVERFLOW_COLOR;
}

/** 縦軸の範囲と目盛。fitY のときは結果の範囲に合わせて拡大する */
function yScale(s: SensitivityAnalysis, fitY: boolean): { domain: [number, number]; ticks: number[] } {
    let [lo, hi, step] = [0, 1, 0.1];
    if (fitY) {
        const values = [...s.start, ...s.end];
        const range = Math.max(...values) - Math.min(...values);
        step = range <= 0.3 ? 0.05 : 0.1;
        lo = Math.max(0, Math.floor(Math.min(...values) / step) * step);
        hi = Math.min(1, Math.ceil(Math.max(...values) / step) * step);
        if (hi - lo < step) hi = Math.min(1, lo + step);
    }
    const ticks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
    return { domain: [lo, hi], ticks };
}

function buildChart(data: AhpCalcData, s: SensitivityAnalysis, cursor: number | null): RenderedChart {
    const reversals = reversalPoints(s);
    const isReversal = (w: number) => reversals.some(r => Math.abs(r - w) < 1e-9);
    const markers: ChartMarker[] = s.crossings.map(c => (isReversal(c.w)
        ? { x: c.w, y: c.score, label: `逆転 w=${c.w.toFixed(2)}`, kind: 'emphasis' }
        : { x: c.w, y: c.score, kind: 'normal' }));
    const y = yScale(s, data.sensitivity.fitY);

    return renderLineChart({
        xLabel: `評価基準「${data.criteria[s.target]}」のウエイト w`,
        yLabel: '総合評価',
        xDomain: [0, 1],
        yDomain: y.domain,
        xTicks: Array.from({ length: 11 }, (_, i) => i / 10),
        yTicks: y.ticks,
        formatX: v => v.toFixed(1),
        formatY: v => (y.ticks.some(t => Math.round(t * 100) % 10 !== 0) ? v.toFixed(2) : v.toFixed(1)),
        series: data.alternatives.map((name, k) => ({
            name,
            color: seriesColor(k),
            points: [[0, s.start[k]], [1, s.end[k]]],
        })),
        guides: [
            { x: s.current, label: `現在 ${s.current.toFixed(2)}`, style: 'solid' },
            ...reversals.map(w => ({ x: w, label: '', style: 'dotted' as const })),
        ],
        markers,
        cursorX: cursor,
    });
}

/** 線の色を示す短い線（凡例と同じ形） */
function lineKey(color: string): string {
    return `<svg class="ahp-sens-key" width="18" height="6" aria-hidden="true"><line x1="1" y1="3" x2="17" y2="3" stroke="${color}" stroke-width="3" stroke-linecap="round"/></svg>`;
}

/** 読み取り位置の総合評価（値の大きい順）と、そのときの各基準のウエイト */
function readoutHtml(data: AhpCalcData, s: SensitivityAnalysis, w: number, isCurrent: boolean): string {
    const scores = scoresAt(s, w);
    const order = data.alternatives.map((_, k) => k).sort((a, b) => scores[b] - scores[a]);
    const weights = shiftWeights(analyzeCalcData(data).criteria.weights, s.target, w);
    return `
        <div class="ahp-sens-readout-title">w = ${w.toFixed(2)}${isCurrent ? '（現在のウエイト）' : ''} のときの総合評価</div>
        <ol class="ahp-sens-scores">${order.map(k => `
            <li>${lineKey(seriesColor(k))}<strong>${scores[k].toFixed(3)}</strong><span>${escapeHtml(data.alternatives[k])}</span></li>
        `).join('')}</ol>
        <p class="ahp-sens-weights">各基準のウエイト: ${data.criteria.map((c, i) => `${escapeHtml(c)} ${weights[i].toFixed(3)}`).join(' / ')}</p>
    `;
}

function summaryHtml(data: AhpCalcData, s: SensitivityAnalysis): string {
    const name = (k: number) => escapeHtml(data.alternatives[k]);
    if (s.intervals.length <= 1) {
        return `<p class="ahp-sens-summary">w を 0 〜 1 で動かしても、最適案（${name(s.intervals[0]?.best ?? 0)}）は入れ替わりません。</p>`;
    }
    const items = s.intervals.slice(1).map((iv, i) =>
        `<li>w = <strong>${iv.from.toFixed(3)}</strong> で ${name(s.intervals[i].best)} → ${name(iv.best)}</li>`).join('');
    return `<div class="ahp-sens-summary">最適案の逆転ポイント<ul>${items}</ul></div>`;
}

export interface SensitivityOptions {
    /** 表示状態（対象の基準・読み取り位置・縦軸）が変わったときに呼ばれる */
    onChange?: (state: SensitivityState) => void;
}

/**
 * 感度分析の表示領域を初期化し、描画関数を返す。
 * root には data-sens-* の要素と DiagramPanel（.diagram-panel）を置いておく
 */
export function mountSensitivity(root: HTMLElement, options: SensitivityOptions = {}): (data: AhpCalcData) => void {
    const select = root.querySelector<HTMLSelectElement>('[data-sens-criterion]');
    const fitCheckbox = root.querySelector<HTMLInputElement>('[data-sens-fit]');
    const slider = root.querySelector<HTMLInputElement>('[data-sens-cursor]');
    const sliderValue = root.querySelector<HTMLElement>('[data-sens-cursor-value]');
    const resetButton = root.querySelector<HTMLButtonElement>('[data-sens-reset]');
    const message = root.querySelector<HTMLElement>('[data-sens-message]');
    const body = root.querySelector<HTMLElement>('[data-sens-body]');
    const readout = root.querySelector<HTMLElement>('[data-sens-readout]');
    const summary = root.querySelector<HTMLElement>('[data-sens-summary]');
    const panelRoot = root.querySelector<HTMLElement>('.diagram-panel');
    const canvas = root.querySelector<HTMLElement>('[data-diagram-canvas]');
    const renderPanel = panelRoot ? mountDiagramPanel(panelRoot, { filename: 'ahp_sensitivity' }) : () => {};

    let data: AhpCalcData | null = null;
    let analysis: SensitivityAnalysis | null = null;
    /** ポインタを乗せている位置（保存しない） */
    let hoverX: number | null = null;
    let frame: ChartFrame | null = null;

    function draw(): void {
        if (!data || !analysis) return;
        const current = data, s = analysis;
        const cursor = hoverX ?? current.sensitivity.cursor;
        const w = cursor ?? s.current;

        renderPanel({
            render: () => {
                const chart = buildChart(current, s, cursor);
                frame = chart.frame;
                return chart;
            },
        });
        if (slider) slider.value = String(w);
        if (sliderValue) sliderValue.textContent = w.toFixed(2);
        if (resetButton) resetButton.disabled = current.sensitivity.cursor === null;
        if (readout) readout.innerHTML = readoutHtml(current, s, w, cursor === null);
        if (summary) summary.innerHTML = summaryHtml(current, s);
    }

    function update(change: Partial<SensitivityState>): void {
        if (!data) return;
        data.sensitivity = { ...data.sensitivity, ...change };
        options.onChange?.(data.sensitivity);
        analysis = analyzeCalcSensitivity(data);
        draw();
    }

    select?.addEventListener('change', () => update({ criterion: Number(select.value), cursor: null }));
    fitCheckbox?.addEventListener('change', () => update({ fitY: fitCheckbox.checked }));
    slider?.addEventListener('input', () => update({ cursor: Number(slider.value) }));
    resetButton?.addEventListener('click', () => update({ cursor: null }));

    // グラフにポインタを乗せると、その位置の総合評価を読み取れる。クリックでその位置に固定する
    const pointerX = (e: MouseEvent): number | null => {
        const svg = canvas?.querySelector('svg');
        if (!svg || !frame) return null;
        return Math.round(chartXFromPointer(svg, frame, e.clientX) / CURSOR_STEP) * CURSOR_STEP;
    };
    canvas?.addEventListener('pointermove', e => {
        const x = pointerX(e);
        if (x === null || x === hoverX) return;
        hoverX = x;
        draw();
    });
    canvas?.addEventListener('pointerleave', () => {
        hoverX = null;
        draw();
    });
    canvas?.addEventListener('click', e => {
        const x = pointerX(e);
        if (x === null) return;
        hoverX = null;
        update({ cursor: x });
    });

    return next => {
        data = next;
        analysis = analyzeCalcSensitivity(next);

        if (select) {
            select.innerHTML = next.criteria.map((c, i) => `<option value="${i}">${escapeHtml(c)}</option>`).join('');
            select.value = String(analysis?.target ?? 0);
        }
        if (fitCheckbox) fitCheckbox.checked = next.sensitivity.fitY;

        const reason = next.criteria.length < 2
            ? '感度分析には評価基準が 2 つ以上必要です。'
            : next.alternatives.length === 0 ? '代替案を追加してください。' : '';
        if (message) message.textContent = reason;
        if (body) body.hidden = Boolean(reason);
        draw();
    };
}
