// SWOT分析出力画面のロジック

import { escapeHtml } from '../utils';
import { SAMPLE_SWOT_DATA, loadSwotData } from './data';
import type { SwotData } from './data';

/** リスト（配列）を <ul><li>...</li></ul> の HTML 文字列に変換する */
function createListHtml(items: string[] | undefined): string {
    if (!items || items.length === 0) {
        return '<p class="matrix-empty-text">(項目なし)</p>';
    }
    const listItems = items.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    return `<ul class="matrix-list">${listItems}</ul>`;
}

/** 1. SWOT分析表（2×2マトリックス）のHTMLを作成 */
export function createSwotTableHtml(data: SwotData): string {
    return `
        <table class="swot-matrix">
            <tbody>
                <tr>
                    <td>
                        <div class="matrix-cell-title">S: 強み</div>
                        ${createListHtml(data['S:強み'])}
                    </td>
                    <td>
                        <div class="matrix-cell-title">W: 弱み</div>
                        ${createListHtml(data['W:弱み'])}
                    </td>
                </tr>
                <tr>
                    <td>
                        <div class="matrix-cell-title">O: 機会</div>
                        ${createListHtml(data['O:機会'])}
                    </td>
                    <td>
                        <div class="matrix-cell-title">T: 脅威</div>
                        ${createListHtml(data['T:脅威'])}
                    </td>
                </tr>
            </tbody>
        </table>
    `;
}

/** 2. クロスSWOT分析表（2×2マトリックス）のHTMLを作成 */
export function createCrossSwotTableHtml(data: SwotData): string {
    return `
        <table class="swot-matrix">
            <tbody>
                <tr>
                    <td>
                        <div class="matrix-cell-title">積極的攻勢 (S × O)</div>
                        ${createListHtml(data['S×O:積極的攻勢'])}
                    </td>
                    <td>
                        <div class="matrix-cell-title">差別化戦略 (S × T)</div>
                        ${createListHtml(data['S×T:差別化戦略'])}
                    </td>
                </tr>
                <tr>
                    <td>
                        <div class="matrix-cell-title">段階的施策 (W × O)</div>
                        ${createListHtml(data['W×O:段階的施策'])}
                    </td>
                    <td>
                        <div class="matrix-cell-title">専守防衛・撤退 (W × T)</div>
                        ${createListHtml(data['W×T:専守防衛・撤退'])}
                    </td>
                </tr>
            </tbody>
        </table>
    `;
}

function renderSwotTable(data: SwotData): void {
    const container = document.getElementById('swot-table-container');
    if (!container) return;
    container.innerHTML = createSwotTableHtml(data);
}

function renderCrossSwotTable(data: SwotData): void {
    const container = document.getElementById('cross-swot-table-container');
    if (!container) return;
    container.innerHTML = createCrossSwotTableHtml(data);
}

/** 出力ページの初期化 */
export function initSwotOutput(): void {
    try {
        const data = loadSwotData(SAMPLE_SWOT_DATA);
        renderSwotTable(data);
        renderCrossSwotTable(data);
    } catch (error) {
        console.error('データの読み込みに失敗しました:', error);
        const container = document.getElementById('swot-table-container');
        if (container) {
            container.innerText = 'データの読み込みに失敗しました。';
        }
    }
}
