// 表（見出し・説明文・罫線つきの表）を SVG で描く共通部品。表を PNG 画像として保存するときに使う

import { escapeHtml } from '../utils';
import { FONT_SIZE, LINE_HEIGHT, MARGIN, svgDocument, textWidth, wrapText } from './svg';
import type { RenderedSvg } from './svg';

export interface SvgTableRow {
    cells: string[];
    /** total: 合計などの集計行（太字） / best: 強調する行（背景色＋太字） */
    kind?: 'total' | 'best';
}

export interface SvgTable {
    caption: string;
    head: string[];
    rows: SvgTableRow[];
}

/** 見出し・説明文・表・結びの文をひとまとまりにしたもの */
export interface SvgTableBlock {
    title?: string;
    /** 表の前に置く文（長い文は折り返す） */
    paragraphs?: string[];
    tables: SvgTable[];
    /** 表の後に置く文（判定など） */
    footer?: string;
}

const INK = '#1a202c';
const INK_SECONDARY = '#4a5568';
const BORDER = '#999999';
const HEAD_FILL = '#f2f2f2';
const TOTAL_FILL = '#f7fafc';
const BEST_FILL = '#fefcbf';

const TITLE_SIZE = 18;
const CELL_PAD_X = 10;
const ROW_HEIGHT = LINE_HEIGHT + 10;
/** 太字は少し幅が広いので、幅の見積もりに余裕を持たせる */
const BOLD_RATIO = 1.08;
/** 文を折り返す幅の下限 */
const MIN_TEXT_WIDTH = 480;
const GAP_AFTER_TITLE = 12;
const GAP_AFTER_TABLE = 20;
const GAP_BETWEEN_BLOCKS = 32;

function columnWidths(table: SvgTable): number[] {
    const columns = Math.max(table.head.length, ...table.rows.map(r => r.cells.length));
    return Array.from({ length: columns }, (_, c) => {
        const head = textWidth(table.head[c] ?? '') * BOLD_RATIO;
        const body = Math.max(0, ...table.rows.map(r => textWidth(r.cells[c] ?? '') * (r.kind ? BOLD_RATIO : 1)));
        return Math.ceil(Math.max(head, body)) + CELL_PAD_X * 2;
    });
}

/** 数値（「1 位」「0.004 OK」のような単位・判定つきも含む）だけの列なら右に揃える */
function isNumericColumn(table: SvgTable, c: number): boolean {
    const values = table.rows.map(r => r.cells[c] ?? '').filter(v => v !== '');
    return values.length > 0 && values.every(v => /^[-+]?\d/.test(v));
}

function text(x: number, y: number, value: string, attrs = '', fill = INK): string {
    return `<text x="${x}" y="${y}" fill="${fill}" dominant-baseline="central" ${attrs}>${escapeHtml(value)}</text>`;
}

/** 表 1 つを (x, y) から描き、描いた部分と高さを返す */
function renderTable(table: SvgTable, x: number, y: number): { markup: string; height: number } {
    const widths = columnWidths(table);
    const width = widths.reduce((s, w) => s + w, 0);
    const numeric = widths.map((_, c) => c > 0 && isNumericColumn(table, c));
    const parts: string[] = [];

    parts.push(text(x, y + LINE_HEIGHT / 2, table.caption, 'font-weight="bold"', INK_SECONDARY));
    let rowY = y + LINE_HEIGHT + 6;

    const rows: (SvgTableRow & { head?: boolean })[] = [{ cells: table.head, head: true }, ...table.rows];
    rows.forEach(row => {
        const fill = row.head ? HEAD_FILL : row.kind === 'best' ? BEST_FILL : row.kind === 'total' ? TOTAL_FILL : '';
        if (fill) parts.push(`<rect x="${x}" y="${rowY}" width="${width}" height="${ROW_HEIGHT}" fill="${fill}"/>`);
        let cellX = x;
        widths.forEach((w, c) => {
            const value = row.cells[c] ?? '';
            const bold = row.head || row.kind ? ' font-weight="bold"' : '';
            // 見出しは中央、数値の列は右、それ以外は左に揃える
            const [tx, anchor] = row.head ? [cellX + w / 2, 'middle'] : numeric[c] ? [cellX + w - CELL_PAD_X, 'end'] : [cellX + CELL_PAD_X, 'start'];
            parts.push(text(tx, rowY + ROW_HEIGHT / 2, value, `text-anchor="${anchor}"${bold}`));
            cellX += w;
        });
        rowY += ROW_HEIGHT;
    });

    // 罫線（外枠と縦横の線）
    const top = y + LINE_HEIGHT + 6;
    const lines: string[] = [];
    for (let r = 0; r <= rows.length; r++) {
        const ly = top + r * ROW_HEIGHT;
        lines.push(`M${x},${ly}H${x + width}`);
    }
    let lx = x;
    [0, ...widths].forEach(w => {
        lx += w;
        lines.push(`M${lx},${top}V${top + rows.length * ROW_HEIGHT}`);
    });
    parts.push(`<path d="${lines.join('')}" fill="none" stroke="${BORDER}" stroke-width="1" shape-rendering="crispEdges"/>`);

    return { markup: parts.join(''), height: rowY - y };
}

function tableWidth(table: SvgTable): number {
    return Math.max(textWidth(table.caption) * BOLD_RATIO, columnWidths(table).reduce((s, w) => s + w, 0));
}

/** 見出し・説明文・表を縦に並べた SVG を作る */
export function renderTablesSvg(blocks: SvgTableBlock[]): RenderedSvg {
    const tablesWidth = Math.max(0, ...blocks.flatMap(b => b.tables.map(tableWidth)));
    const titleWidth = Math.max(0, ...blocks.map(b => textWidth(b.title ?? '') * (TITLE_SIZE / FONT_SIZE) * BOLD_RATIO));
    // 文は表の幅に合わせて折り返す（表が狭いときは MIN_TEXT_WIDTH まで広げる）
    const textAreaWidth = Math.max(MIN_TEXT_WIDTH, tablesWidth);
    const contentWidth = Math.ceil(Math.max(textAreaWidth, titleWidth));

    const parts: string[] = [];
    let y = MARGIN;
    const paragraph = (value: string) => {
        wrapText(value, textAreaWidth).forEach(line => {
            parts.push(text(MARGIN, y + LINE_HEIGHT / 2, line, '', INK_SECONDARY));
            y += LINE_HEIGHT;
        });
        y += 6;
    };

    blocks.forEach((block, idx) => {
        if (idx > 0) y += GAP_BETWEEN_BLOCKS;
        if (block.title) {
            parts.push(text(MARGIN, y + TITLE_SIZE / 2, block.title, `font-size="${TITLE_SIZE}" font-weight="bold"`));
            y += TITLE_SIZE + GAP_AFTER_TITLE;
        }
        (block.paragraphs ?? []).forEach(paragraph);
        block.tables.forEach(table => {
            const rendered = renderTable(table, MARGIN, y);
            parts.push(rendered.markup);
            y += rendered.height + GAP_AFTER_TABLE;
        });
        if (block.footer) paragraph(block.footer);
    });

    return svgDocument(contentWidth + MARGIN * 2, Math.ceil(y + MARGIN), parts.join(''));
}
