// 図表（SVG）を描くための共通部品：テキストの折り返し・箱・線・SVG 文書

import { escapeHtml } from '../utils';

/** 図の向き（vertical: 上→下, horizontal: 左→右） */
export type Orientation = 'vertical' | 'horizontal';

export const FONT_SIZE = 14;
export const LINE_HEIGHT = 20;
export const PAD_X = 16;
export const PAD_Y = 12;
export const MAX_TEXT_WIDTH = 150;
export const MIN_NODE_WIDTH = 120;
export const MARGIN = 20;
const FONT_FAMILY = "'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif";

const COLOR = '#000';
const PLACEHOLDER_COLOR = '#a0aec0';

/** 図中の箱（x, y は左上の座標） */
export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
    lines: string[];
    /** データが無く、仮の箱として表示する */
    placeholder?: boolean;
}

export interface RenderedSvg {
    markup: string;
    width: number;
    height: number;
}

// ---------- テキスト ----------

/** 文字幅の概算（全角は 1em、半角は 0.6em とみなす） */
function charWidth(ch: string): number {
    return ch.charCodeAt(0) > 0xff ? FONT_SIZE : FONT_SIZE * 0.6;
}

export function textWidth(text: string): number {
    return Array.from(text).reduce((sum, ch) => sum + charWidth(ch), 0);
}

/** 日本語は空白で区切れないため 1 文字単位で折り返す */
export function wrapText(text: string, maxWidth = MAX_TEXT_WIDTH): string[] {
    const lines: string[] = [];
    let line = '';
    let width = 0;
    for (const ch of Array.from(text)) {
        const w = charWidth(ch);
        if (line && width + w > maxWidth) {
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

// ---------- 描画 ----------

export function renderBox(box: Box): string {
    const { x, y, w, h, lines, placeholder } = box;
    const stroke = placeholder ? `stroke="${PLACEHOLDER_COLOR}" stroke-dasharray="4 4"` : `stroke="${COLOR}"`;
    const textFill = placeholder ? PLACEHOLDER_COLOR : COLOR;
    const cx = x + w / 2;
    // 行数が少ない箱も縦方向の中央に揃える
    const offsetY = (h - lines.length * LINE_HEIGHT) / 2;
    const texts = lines.map((line, i) =>
        `<text x="${cx}" y="${y + offsetY + LINE_HEIGHT * (i + 0.5)}" fill="${textFill}" text-anchor="middle" dominant-baseline="central">${escapeHtml(line)}</text>`,
    ).join('');
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" ${stroke} stroke-width="1.5"/>${texts}</g>`;
}

/** 親の箱から子の箱へ線を引く（縦向きは下辺→上辺、横向きは右辺→左辺の中央どうし） */
export function renderEdge(from: Box, to: Box, orientation: Orientation, dashed = false): string {
    const [x1, y1, x2, y2] = orientation === 'vertical'
        ? [from.x + from.w / 2, from.y + from.h, to.x + to.w / 2, to.y]
        : [from.x + from.w, from.y + from.h / 2, to.x, to.y + to.h / 2];
    const stroke = dashed ? `stroke="${PLACEHOLDER_COLOR}" stroke-dasharray="4 4"` : `stroke="${COLOR}"`;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${stroke} stroke-width="1"/>`;
}

/** 白背景つきの SVG 文書にまとめる */
export function svgDocument(width: number, height: number, body: string): RenderedSvg {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}">`
        + `<rect width="${width}" height="${height}" fill="#fff"/>${body}</svg>`;
    return { markup, width, height };
}
