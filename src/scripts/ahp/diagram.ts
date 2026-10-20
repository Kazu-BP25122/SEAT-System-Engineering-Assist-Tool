// AHP階層図（SVG）の生成と、SVG / PNG 保存・Mermaid コードのコピー

import { escapeHtml } from '../utils';
import { getCriteria } from './data';
import type { AhpData } from './data';

// ---------- レイアウト定数 ----------

const FONT_SIZE = 14;
const LINE_HEIGHT = 20;
const PAD_X = 16;
const PAD_Y = 12;
const MAX_TEXT_WIDTH = 150;
const MIN_NODE_WIDTH = 120;
const H_GAP = 24;
const MARGIN = 20;
/** 段と段の間隔（総合目的→評価基準, 評価基準→代替案）。下段は線が交差するので広めにとる */
const LEVEL_GAPS = [60, 120];
const FONT_FAMILY = "'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif";
const PNG_SCALE = 2;

interface DiagramNode {
    lines: string[];
    /** ノード中心の x 座標 */
    cx: number;
}

interface Level {
    nodes: DiagramNode[];
    /** データが無く、仮のノードを表示している段 */
    placeholder: boolean;
    nodeWidth: number;
    nodeHeight: number;
    /** ノード上端の y 座標 */
    y: number;
}

interface DiagramLayout {
    width: number;
    height: number;
    levels: Level[];
}

export interface RenderedSvg {
    markup: string;
    width: number;
    height: number;
}

// ---------- テキストの折り返し ----------

/** 文字幅の概算（全角は 1em、半角は 0.6em とみなす） */
function charWidth(ch: string): number {
    return ch.charCodeAt(0) > 0xff ? FONT_SIZE : FONT_SIZE * 0.6;
}

function textWidth(text: string): number {
    return Array.from(text).reduce((sum, ch) => sum + charWidth(ch), 0);
}

/** 日本語は空白で区切れないため 1 文字単位で折り返す */
function wrapText(text: string): string[] {
    const lines: string[] = [];
    let line = '';
    let width = 0;
    for (const ch of Array.from(text)) {
        const w = charWidth(ch);
        if (line && width + w > MAX_TEXT_WIDTH) {
            lines.push(line);
            line = '';
            width = 0;
        }
        line += ch;
        width += w;
    }
    lines.push(line);
    return lines;
}

// ---------- レイアウト計算 ----------

function buildLevel(labels: string[], placeholderLabel: string): Level {
    const placeholder = labels.length === 0;
    const wrapped = (placeholder ? [placeholderLabel] : labels).map(wrapText);
    // 同じ段のノードは幅・高さを揃える
    const maxTextWidth = Math.max(...wrapped.flat().map(textWidth));
    const maxLines = Math.max(...wrapped.map(lines => lines.length));
    return {
        nodes: wrapped.map(lines => ({ lines, cx: 0 })),
        placeholder,
        nodeWidth: Math.max(MIN_NODE_WIDTH, maxTextWidth + PAD_X * 2),
        nodeHeight: maxLines * LINE_HEIGHT + PAD_Y * 2,
        y: 0,
    };
}

function rowWidth(level: Level): number {
    const n = level.nodes.length;
    return n * level.nodeWidth + (n - 1) * H_GAP;
}

function computeLayout(data: AhpData): DiagramLayout {
    const goal = data.goal.trim();
    const levels = [
        buildLevel(goal ? [goal] : [], '総合目的'),
        buildLevel(getCriteria(data), '評価基準'),
        buildLevel(data.alternatives, '代替案'),
    ];

    const width = Math.max(...levels.map(rowWidth)) + MARGIN * 2;

    let y = MARGIN;
    levels.forEach((level, i) => {
        level.y = y;
        y += level.nodeHeight + (LEVEL_GAPS[i] ?? 0);
        // 各段を中央揃えで配置する
        const startX = (width - rowWidth(level)) / 2;
        level.nodes.forEach((node, j) => {
            node.cx = startX + j * (level.nodeWidth + H_GAP) + level.nodeWidth / 2;
        });
    });

    return { width, height: y + MARGIN, levels };
}

// ---------- SVG 生成 ----------

/** 上の段の全ノードから下の段の全ノードへ線を引く（完全2部グラフ） */
function renderEdges(parent: Level, child: Level): string {
    const dashed = parent.placeholder || child.placeholder;
    const stroke = dashed ? 'stroke="#a0aec0" stroke-dasharray="4 4"' : 'stroke="#000"';
    const y1 = parent.y + parent.nodeHeight;
    return parent.nodes.flatMap(p => child.nodes.map(c =>
        `<line x1="${p.cx}" y1="${y1}" x2="${c.cx}" y2="${child.y}" ${stroke} stroke-width="1"/>`,
    )).join('');
}

function renderNodes(level: Level): string {
    const { nodeWidth: w, nodeHeight: h, y, placeholder } = level;
    const rectStyle = placeholder
        ? 'fill="#fff" stroke="#a0aec0" stroke-dasharray="4 4"'
        : 'fill="#fff" stroke="#000"';
    const textFill = placeholder ? '#a0aec0' : '#000';

    return level.nodes.map(node => {
        // 行数が少ないノードも縦方向の中央に揃える
        const offsetY = (h - node.lines.length * LINE_HEIGHT) / 2;
        const texts = node.lines.map((line, i) =>
            `<text x="${node.cx}" y="${y + offsetY + LINE_HEIGHT * (i + 0.5)}" fill="${textFill}" text-anchor="middle" dominant-baseline="central">${escapeHtml(line)}</text>`,
        ).join('');
        return `<g><rect x="${node.cx - w / 2}" y="${y}" width="${w}" height="${h}" ${rectStyle} stroke-width="1.5"/>${texts}</g>`;
    }).join('');
}

export function renderSvg(data: AhpData): RenderedSvg {
    const { width, height, levels } = computeLayout(data);

    const edges = levels.slice(1).map((child, i) => renderEdges(levels[i], child)).join('');
    const nodes = levels.map(renderNodes).join('');

    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}">`
        + `<rect width="${width}" height="${height}" fill="#fff"/>`
        + `<g>${edges}</g>${nodes}</svg>`;

    return { markup, width, height };
}

// ---------- Mermaid コード生成 ----------

/** ノードのラベル部分 ["..."] を作る。問題になる文字はエンティティに置き換える */
function mermaidLabel(text: string): string {
    return `["${text.replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;')}"]`;
}

export function buildMermaid(data: AhpData): string {
    const goal = data.goal.trim() || '総合目的';
    const criteria = getCriteria(data);
    const alternatives = data.alternatives;

    const lines = ['flowchart TD', '    %% 総合目的', `    G${mermaidLabel(goal)}`, '    %% 評価基準'];
    criteria.forEach((c, i) => lines.push(`    C${i}${mermaidLabel(c)}`));
    lines.push('    %% 代替案');
    alternatives.forEach((a, j) => lines.push(`    A${j}${mermaidLabel(a)}`));

    lines.push('');
    criteria.forEach((_, i) => lines.push(`    G --- C${i}`));
    criteria.forEach((_, i) => {
        alternatives.forEach((_, j) => lines.push(`    C${i} --- A${j}`));
    });

    return lines.join('\n');
}

// ---------- 保存・コピー ----------

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadSvg(svg: RenderedSvg): void {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${svg.markup}`;
    downloadBlob(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }), 'ahp_hierarchy.svg');
}

function downloadPng(svg: RenderedSvg): void {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = svg.width * PNG_SCALE;
        canvas.height = svg.height * PNG_SCALE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
            if (blob) downloadBlob(blob, 'ahp_hierarchy.png');
        }, 'image/png');
    };
    img.onerror = () => alert('PNG への変換に失敗しました。');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.markup)}`;
}

async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    // Clipboard API が使えない環境向けのフォールバック
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

/** ボタンの表示を一時的に変えて操作結果を知らせる */
function flashButton(btn: HTMLElement, message: string): void {
    const original = btn.dataset.label ?? btn.textContent ?? '';
    btn.dataset.label = original;
    btn.textContent = message;
    setTimeout(() => {
        btn.textContent = original;
    }, 1500);
}

/**
 * AhpDiagram コンポーネントを初期化し、描画関数を返す。
 * 返り値の関数にデータを渡すたびに図が再描画される。
 */
export function mountAhpDiagram(root: HTMLElement): (data: AhpData) => void {
    const canvas = root.querySelector<HTMLElement>('[data-ahp-canvas]');
    let current: AhpData | null = null;

    root.addEventListener('click', async e => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-ahp-action]');
        if (!btn || !current) return;

        switch (btn.dataset.ahpAction) {
            case 'download-svg':
                downloadSvg(renderSvg(current));
                break;
            case 'download-png':
                downloadPng(renderSvg(current));
                break;
            case 'copy-mermaid':
                try {
                    await copyText(buildMermaid(current));
                    flashButton(btn, 'コピーしました');
                } catch {
                    flashButton(btn, 'コピーに失敗しました');
                }
                break;
        }
    });

    return data => {
        current = data;
        if (canvas) canvas.innerHTML = renderSvg(data).markup;
    };
}
