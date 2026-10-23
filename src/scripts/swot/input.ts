// SWOT分析作成画面のロジック

import { escapeHtml } from '../utils';
import { DEFAULT_SWOT_DATA, loadSwotData, saveSwotData } from './data';
import type { SwotData } from './data';
import { createCrossSwotTableHtml, createSwotTableHtml } from './output';

const OUTPUT_PAGE = '/tools/swot/output';

let currentData: SwotData = {};

/** プレビューの更新 */
function updatePreview(): void {
    const swotPreview = document.getElementById('swot-preview-container');
    if (swotPreview) {
        swotPreview.innerHTML = createSwotTableHtml(currentData);
    }
    const crossSwotPreview = document.getElementById('cross-swot-preview-container');
    if (crossSwotPreview) {
        crossSwotPreview.innerHTML = createCrossSwotTableHtml(currentData);
    }
}

/** 保存してステータス更新・プレビュー反映 */
function commit(): void {
    saveSwotData(currentData);
    const statusEl = document.getElementById('data-status');
    if (statusEl) {
        statusEl.innerText = `変更をローカルに保存しました (${new Date().toLocaleTimeString()})`;
    }
    renderCards();
    updatePreview();
}

/** カード一覧を描画する */
function renderCards(): void {
    const container = document.getElementById('swot-cards-container');
    if (!container) return;

    const html = Object.keys(currentData).map(key => {
        const isCross = key.includes('×');
        const items = currentData[key] || [];

        const itemsHtml = items.length === 0
            ? '<p class="empty-items">(項目なし)</p>'
            : items.map((item, index) => `
                <li>
                    <input
                        type="text"
                        class="input-flex swot-item-input"
                        value="${escapeHtml(item)}"
                        data-rename="swot-item"
                        data-key="${escapeHtml(key)}"
                        data-idx="${index}"
                        aria-label="${escapeHtml(key)}の項目 ${index + 1}"
                    />
                    <button class="btn btn-danger" data-action="delete" data-key="${escapeHtml(key)}" data-idx="${index}">×</button>
                </li>
            `).join('');

        return `
            <div class="card swot-card ${isCross ? 'cross-swot' : ''}">
                <div class="card-title">${escapeHtml(key)}</div>
                <ul class="items-list">
                    ${itemsHtml}
                </ul>
                <div class="add-inline-form">
                    <input
                        type="text"
                        class="input-flex"
                        id="input-${escapeHtml(key)}"
                        placeholder="＋ 項目を追加"
                        data-action="enter-add"
                        data-key="${escapeHtml(key)}"
                    />
                    <button
                        class="btn btn-secondary btn-inline"
                        data-action="add"
                        data-key="${escapeHtml(key)}"
                    >追加</button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

/** 名前の入力欄の値をデータに反映する。空のまま確定したときは仮の名前を付ける */
function renameItem(el: HTMLInputElement, confirmed: boolean): void {
    const key = el.dataset.key;
    const idx = Number(el.dataset.idx);
    if (!key || !currentData[key] || isNaN(idx)) return;

    let value = el.value;
    if (confirmed && !value.trim()) {
        value = `項目 ${idx + 1}`;
        el.value = value;
    }
    currentData[key][idx] = value;
    saveSwotData(currentData);
    updatePreview();
}

/** 項目の追加 */
function addItem(key: string, inputEl: HTMLInputElement): void {
    const text = inputEl.value.trim();
    if (!text) return;

    if (!currentData[key]) {
        currentData[key] = [];
    }
    currentData[key].push(text);
    inputEl.value = '';
    commit();

    // 入力後のフォーカス復帰
    setTimeout(() => {
        const targetInput = document.getElementById(`input-${key}`) as HTMLInputElement | null;
        if (targetInput) targetInput.focus();
    }, 50);
}

/** 項目の削除 */
function deleteItem(key: string, index: number): void {
    if (currentData[key] && index >= 0 && index < currentData[key].length) {
        currentData[key].splice(index, 1);
        commit();
    }
}

/** 初期状態に戻す */
function resetToDefault(): void {
    if (window.confirm('初期状態のSWOTデータに戻しますか？')) {
        currentData = structuredClone(DEFAULT_SWOT_DATA);
        commit();
    }
}

/** 確定して出力画面へ遷移 */
function saveAndNavigate(): void {
    saveSwotData(currentData);
    window.location.href = OUTPUT_PAGE;
}

/** 名前の入力欄の変更を受け取る */
function bindRenameEvents(container: HTMLElement | null): void {
    container?.addEventListener('input', e => {
        const el = e.target as HTMLInputElement;
        if (el.dataset.rename === 'swot-item') renameItem(el, false);
    });
    container?.addEventListener('change', e => {
        const el = e.target as HTMLInputElement;
        if (el.dataset.rename === 'swot-item') renameItem(el, true);
    });
}

/** イベントバインド */
function bindEvents(): void {
    document.getElementById('reset-btn')?.addEventListener('click', resetToDefault);
    document.getElementById('save-navigate-btn')?.addEventListener('click', saveAndNavigate);

    const container = document.getElementById('swot-cards-container');
    if (!container) return;

    // クリックイベントの委譲
    container.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const key = target.dataset.key;
        if (!key) return;

        if (action === 'delete') {
            const idx = Number(target.dataset.idx);
            deleteItem(key, idx);
        } else if (action === 'add') {
            const input = document.getElementById(`input-${key}`) as HTMLInputElement | null;
            if (input) addItem(key, input);
        }
    });

    // Enter キー押下時の追加
    container.addEventListener('keydown', (e) => {
        const target = e.target as HTMLInputElement;
        if (e.key === 'Enter' && !e.isComposing && target.dataset.action === 'enter-add') {
            const key = target.dataset.key;
            if (key) addItem(key, target);
        }
    });

    bindRenameEvents(container);
}

/** SWOT分析編集ページの初期化 */
export function initSwot(): void {
    currentData = loadSwotData(DEFAULT_SWOT_DATA);
    bindEvents();
    renderCards();
    updatePreview();
}
