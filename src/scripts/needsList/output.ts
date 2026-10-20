// ニーズリスト出力画面のロジック

import { escapeHtml } from '../utils';
import { loadNeedsData } from './data';
import type { NeedItems, NeedsData } from './data';

/** 表の最下層の列 */
interface Column {
    topCategory: string;
    subCategory: string | null;
    items: NeedItems;
}

// localStorage にデータが無い場合の表示用サンプル
const sampleData: NeedsData = {
    '来場者': {
        'ファミリー': ['美味しい物を食べたい', '列に並びたくない', '世界観に没頭したい'],
        '学生': ['お土産が欲しい', 'スマホの充電をしたい', '安く楽しみたい'],
    },
    '出展者': ['来場者の感想を聞きたい', '達成感を得たい', 'トラブルを防ぎたい'],
};

/** データ構造を最下層の列のリストに展開する */
function toColumns(needsData: NeedsData): Column[] {
    return Object.entries(needsData).flatMap(([topKey, val]): Column[] => {
        if (Array.isArray(val)) {
            return [{ topCategory: topKey, subCategory: null, items: val }];
        }
        if (typeof val === 'object' && val !== null) {
            return Object.entries(val).map(([subKey, items]) => ({
                topCategory: topKey,
                subCategory: subKey,
                items: items || [],
            }));
        }
        return [];
    });
}

function renderHeader(needsData: NeedsData, columns: Column[]): string {
    // サブカテゴリが1つでもあればヘッダーを2段にする
    const hasSubHeader = columns.some(col => col.subCategory !== null);

    const topRow = Object.keys(needsData).map(topKey => {
        const childCols = columns.filter(col => col.topCategory === topKey);
        // サブカテゴリを持たない大カテゴリは2段分の高さにする
        const rowSpan = hasSubHeader && childCols.every(col => col.subCategory === null) ? ' rowspan="2"' : '';
        return `<th colspan="${childCols.length}"${rowSpan}>${escapeHtml(topKey)}</th>`;
    }).join('');

    const subRow = hasSubHeader
        ? `<tr>${columns
            .filter(col => col.subCategory !== null)
            .map(col => `<th>${escapeHtml(col.subCategory)}</th>`)
            .join('')}</tr>`
        : '';

    return `<thead><tr>${topRow}</tr>${subRow}</thead>`;
}

function renderBody(columns: Column[]): string {
    const maxRows = Math.max(...columns.map(col => col.items.length), 0);
    const rows: string[] = [];
    for (let i = 0; i < maxRows; i++) {
        const cells = columns.map(col => `<td>${escapeHtml(col.items[i] ?? '')}</td>`).join('');
        rows.push(`<tr>${cells}</tr>`);
    }
    return `<tbody>${rows.join('')}</tbody>`;
}

function renderTable(needsData: NeedsData): void {
    const container = document.getElementById('table-container');
    if (!container) return;

    const columns = toColumns(needsData);
    container.innerHTML = `<table class="needs-table">${renderHeader(needsData, columns)}${renderBody(columns)}</table>`;
}

export function initNeedsListOutput(): void {
    try {
        renderTable(loadNeedsData(sampleData));
    } catch (error) {
        console.error('データの読み込みに失敗しました:', error);
        const container = document.getElementById('table-container');
        if (container) container.innerText = 'データの読み込みに失敗しました。';
    }
}
