// ニーズリスト作成画面のロジック

import { escapeHtml } from '../utils';
import { loadNeedsData, saveNeedsData } from './data';
import type { NeedItems, NeedsData, SubCategories } from './data';
import { createNeedsTableHtml } from './output';

const OUTPUT_PAGE = '/tools/needsList/output';

const defaultData: NeedsData = {};

let needsData: NeedsData = {};

// ---------- データ操作 ----------

function cloneDefaultData(): NeedsData {
    return structuredClone(defaultData);
}

function persist(): void {
    saveNeedsData(needsData);
}

function updatePreview(): void {
    const previewEl = document.getElementById('table-preview');
    if (previewEl) {
        previewEl.innerHTML = createNeedsTableHtml(needsData);
    }
}

/** 保存して画面全体（ツリーおよびプレビュー）を再描画する */
function commit(): void {
    persist();
    const statusEl = document.getElementById('data-status');
    if (statusEl) {
        statusEl.innerText = `変更をローカルに保存しました (${new Date().toLocaleTimeString()})`;
    }
    renderTree();
    updatePreview();
}

// ---------- 描画 ----------

/** 名前を直接書き換えられる入力欄 */
function nameInput(value: string, label: string, attrs: string): string {
    return `<input type="text" class="input-flex needs-name-input" value="${escapeHtml(value)}" aria-label="${escapeHtml(label)}" ${attrs}>`;
}

function renderItemsList(items: NeedItems, topIdx: number, subIdx: number | null): string {
    if (items.length === 0) {
        return '<p class="empty-items">(ニーズ項目なし)</p>';
    }
    const subAttr = subIdx !== null ? `data-sub-idx="${subIdx}"` : '';
    const rows = items.map((item, idx) => `
        <li>
            ${nameInput(item, `ニーズ ${idx + 1}`, `data-rename="item" data-top-idx="${topIdx}" ${subAttr} data-idx="${idx}"`)}
            <button class="btn btn-danger" data-action="delete-need" data-top-idx="${topIdx}" ${subAttr} data-idx="${idx}">×</button>
        </li>
    `).join('');
    return `<ul class="items-list">${rows}</ul>`;
}

function renderAddNeedForm(topIdx: number, subIdx: number | null): string {
    const subAttr = subIdx !== null ? `data-sub-idx="${subIdx}"` : '';
    return `
        <div class="add-inline-form">
            <input type="text" class="input-flex" placeholder="＋ ニーズを追加" data-enter="add-need" data-top-idx="${topIdx}" ${subAttr}>
            <button class="btn btn-secondary btn-inline" data-action="add-need" data-top-idx="${topIdx}" ${subAttr}>追加</button>
        </div>
    `;
}

function renderSubCategory(topIdx: number, subIdx: number, subKey: string, items: NeedItems): string {
    return `
        <div class="sub-category-block">
            <div class="sub-category-header">
                ${nameInput(subKey, `サブカテゴリ ${subIdx + 1} の名前`, `data-rename="sub" data-top-idx="${topIdx}" data-sub-idx="${subIdx}"`)}
                <button class="btn btn-danger" data-action="delete-sub" data-top-idx="${topIdx}" data-sub-idx="${subIdx}">削除</button>
            </div>
            ${renderItemsList(items, topIdx, subIdx)}
            ${renderAddNeedForm(topIdx, subIdx)}
        </div>
    `;
}

function renderAddSubForm(topIdx: number): string {
    return `
        <div class="add-sub-area">
            <div class="add-inline-form">
                <input type="text" class="input-flex" placeholder="＋ サブカテゴリを追加 (例: 若年層, VIP)" data-enter="add-sub" data-top-idx="${topIdx}">
                <button class="btn btn-primary btn-inline" data-action="add-sub" data-top-idx="${topIdx}">追加</button>
            </div>
        </div>
    `;
}

function renderTopCategory(topKey: string, val: NeedItems | SubCategories, topIdx: number): string {
    const isArray = Array.isArray(val);

    let body = '';
    if (isArray) {
        body = `
            <div class="top-items-area">
                ${renderItemsList(val, topIdx, null)}
                ${renderAddNeedForm(topIdx, null)}
            </div>
        `;
    } else if (typeof val === 'object' && val !== null) {
        body = Object.entries(val)
            .map(([subKey, items], subIdx) => renderSubCategory(topIdx, subIdx, subKey, items || []))
            .join('') + renderAddSubForm(topIdx);
    }

    return `
        <div class="top-category-block">
            <div class="top-category-header">
                ${nameInput(topKey, `ステークホルダ ${topIdx + 1} の名前`, `data-rename="top" data-top-idx="${topIdx}"`)}
                <div>
                    ${isArray ? `<button class="btn btn-secondary btn-convert" data-action="convert-to-group" data-top-idx="${topIdx}">サブカテゴリを追加</button>` : ''}
                    <button class="btn btn-danger" data-action="delete-top" data-top-idx="${topIdx}">削除</button>
                </div>
            </div>
            ${body}
        </div>
    `;
}

function renderTree(): void {
    const root = document.getElementById('tree-root');
    if (!root) return;

    const entries = Object.entries(needsData);
    if (entries.length === 0) {
        root.innerHTML = '<p class="empty-tree">ステークホルダが登録されていません。上のフォームから追加してください。</p>';
        return;
    }
    root.innerHTML = entries.map(([topKey, val], topIdx) => renderTopCategory(topKey, val, topIdx)).join('');
}

// ---------- 操作 ----------

function addTopCategory(): void {
    const input = document.getElementById('new-top-category-input') as HTMLInputElement | null;
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    if (needsData[name]) {
        alert('既に存在するステークホルダ名です。');
        return;
    }
    needsData[name] = [];
    input.value = '';
    commit();
}

function deleteTopCategory(topIdx: number): void {
    const topKey = Object.keys(needsData)[topIdx];
    if (!topKey) return;
    if (!confirm(`「${topKey}」とその下のデータをすべて削除しますか？`)) return;
    delete needsData[topKey];
    commit();
}

function convertToGroup(topIdx: number): void {
    const topKey = Object.keys(needsData)[topIdx];
    if (!topKey) return;
    needsData[topKey] = {};
    commit();
}

function addSubCategory(topIdx: number, input: HTMLInputElement): void {
    const subName = input.value.trim();
    if (!subName) return;

    const topKey = Object.keys(needsData)[topIdx];
    if (!topKey) return;

    if (Array.isArray(needsData[topKey])) {
        needsData[topKey] = {};
    }
    const subs = needsData[topKey] as SubCategories;
    if (!subs[subName]) {
        subs[subName] = [];
    }
    input.value = '';
    commit();
}

function deleteSubCategory(topIdx: number, subIdx: number): void {
    const topKey = Object.keys(needsData)[topIdx];
    if (!topKey) return;
    const subs = needsData[topKey] as SubCategories | undefined;
    if (!subs) return;
    const subKey = Object.keys(subs)[subIdx];
    if (!subKey || !confirm(`サブカテゴリ「${subKey}」を削除しますか？`)) return;
    delete subs[subKey];
    commit();
}

function addNeedItem(topIdx: number, subIdx: number | null, input: HTMLInputElement): void {
    const text = input.value.trim();
    if (!text) return;

    const topKey = Object.keys(needsData)[topIdx];
    if (!topKey) return;
    const val = needsData[topKey];

    if (subIdx === null) {
        if (Array.isArray(val)) val.push(text);
    } else {
        if (!Array.isArray(val) && val) {
            const subKey = Object.keys(val)[subIdx];
            if (subKey && val[subKey]) val[subKey].push(text);
        }
    }

    input.value = '';
    commit();

    // 再描画後、同じ入力欄にフォーカスを戻して連続入力できるようにする
    setTimeout(() => {
        const selector = subIdx !== null
            ? `#tree-root input[data-enter="add-need"][data-top-idx="${topIdx}"][data-sub-idx="${subIdx}"]`
            : `#tree-root input[data-enter="add-need"][data-top-idx="${topIdx}"]:not([data-sub-idx])`;
        document.querySelector<HTMLInputElement>(selector)?.focus();
    }, 50);
}

function deleteNeedItem(topIdx: number, subIdx: number | null, idx: number): void {
    const topKey = Object.keys(needsData)[topIdx];
    if (!topKey) return;
    const val = needsData[topKey];

    if (subIdx === null) {
        if (Array.isArray(val)) val.splice(idx, 1);
    } else {
        if (!Array.isArray(val) && val) {
            const subKey = Object.keys(val)[subIdx];
            if (subKey && val[subKey]) val[subKey].splice(idx, 1);
        }
    }

    commit();
}

function renameTop(topIdx: number, newName: string): void {
    const keys = Object.keys(needsData);
    const oldKey = keys[topIdx];
    if (!oldKey || oldKey === newName) return;
    const next: NeedsData = {};
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        next[i === topIdx ? newName : k] = needsData[k];
    }
    needsData = next;
}

function renameSub(topIdx: number, subIdx: number, newName: string): void {
    const topKey = Object.keys(needsData)[topIdx];
    if (!topKey) return;
    const val = needsData[topKey];
    if (Array.isArray(val) || !val) return;
    const keys = Object.keys(val);
    const oldSub = keys[subIdx];
    if (!oldSub || oldSub === newName) return;
    const nextSubs: SubCategories = {};
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        nextSubs[i === subIdx ? newName : k] = val[k];
    }
    needsData[topKey] = nextSubs;
}

function renameNeed(topIdx: number, subIdx: number | null, itemIdx: number, newText: string): void {
    const topKey = Object.keys(needsData)[topIdx];
    if (!topKey) return;
    const val = needsData[topKey];
    if (subIdx === null) {
        if (Array.isArray(val) && val[itemIdx] !== undefined) {
            val[itemIdx] = newText;
        }
    } else {
        if (!Array.isArray(val) && val) {
            const subKey = Object.keys(val)[subIdx];
            if (subKey && val[subKey] && val[subKey][itemIdx] !== undefined) {
                val[subKey][itemIdx] = newText;
            }
        }
    }
}

/** 名前の入力欄の値をデータに反映する。空のまま確定したときは仮の名前を付ける */
function renameItem(el: HTMLInputElement, confirmed: boolean): void {
    const renameType = el.dataset.rename;
    const topIdx = Number(el.dataset.topIdx);
    const subIdx = el.dataset.subIdx !== undefined ? Number(el.dataset.subIdx) : null;
    const idx = el.dataset.idx !== undefined ? Number(el.dataset.idx) : null;
    let value = el.value;

    if (confirmed && !value.trim()) {
        if (renameType === 'top') value = `ステークホルダ ${topIdx + 1}`;
        else if (renameType === 'sub') value = `サブカテゴリ ${(subIdx ?? 0) + 1}`;
        else if (renameType === 'item') value = `ニーズ ${(idx ?? 0) + 1}`;
        el.value = value;
    }

    if (renameType === 'top') {
        renameTop(topIdx, value);
    } else if (renameType === 'sub') {
        if (subIdx !== null) renameSub(topIdx, subIdx, value);
    } else if (renameType === 'item') {
        if (idx !== null) renameNeed(topIdx, subIdx, idx, value);
    } else {
        return;
    }

    persist();
    updatePreview();
}

function resetToDefault(): void {
    if (!confirm('初期データにリセットしますか？現在の編集内容は上書きされます。')) return;
    needsData = cloneDefaultData();
    commit();
}

function saveAndNavigate(): void {
    persist();
    window.location.href = OUTPUT_PAGE;
}

// ---------- イベント ----------

/** ボタンと同じフォーム内の入力欄を取得する */
function siblingInput(el: HTMLElement): HTMLInputElement | null {
    return el.closest('.add-inline-form')?.querySelector('input') ?? null;
}

function handleTreeAction(action: string, el: HTMLElement): void {
    const topIdx = Number(el.dataset.topIdx);
    const subIdx = el.dataset.subIdx !== undefined ? Number(el.dataset.subIdx) : null;

    switch (action) {
        case 'delete-top':
            deleteTopCategory(topIdx);
            break;
        case 'convert-to-group':
            convertToGroup(topIdx);
            break;
        case 'delete-sub':
            if (subIdx !== null) deleteSubCategory(topIdx, subIdx);
            break;
        case 'delete-need':
            deleteNeedItem(topIdx, subIdx, Number(el.dataset.idx));
            break;
        case 'add-sub': {
            const input = el instanceof HTMLInputElement ? el : siblingInput(el);
            if (input) addSubCategory(topIdx, input);
            break;
        }
        case 'add-need': {
            const input = el instanceof HTMLInputElement ? el : siblingInput(el);
            if (input) addNeedItem(topIdx, subIdx, input);
            break;
        }
    }
}

/** 名前の入力欄（ステークホルダ・サブカテゴリ・ニーズ）の変更を受け取る */
function bindRenameEvents(root: HTMLElement | null): void {
    root?.addEventListener('input', e => {
        const el = e.target as HTMLInputElement;
        if (el.dataset.rename) renameItem(el, false);
    });
    root?.addEventListener('change', e => {
        const el = e.target as HTMLInputElement;
        if (el.dataset.rename) renameItem(el, true);
    });
}

function bindEvents(): void {
    document.getElementById('reset-btn')?.addEventListener('click', resetToDefault);
    document.getElementById('add-top-category-btn')?.addEventListener('click', addTopCategory);
    document.getElementById('new-top-category-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.isComposing) addTopCategory();
    });
    document.getElementById('save-navigate-btn')?.addEventListener('click', saveAndNavigate);

    const root = document.getElementById('tree-root');
    root?.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (el?.dataset.action) handleTreeAction(el.dataset.action, el);
    });
    root?.addEventListener('keydown', e => {
        const el = e.target as HTMLElement;
        if (e.key === 'Enter' && !e.isComposing && el.dataset.enter) handleTreeAction(el.dataset.enter, el);
    });

    bindRenameEvents(root);
}

export function initNeedsList(): void {
    needsData = loadNeedsData(defaultData);
    bindEvents();
    renderTree();
    updatePreview();
}
