// ニーズリスト作成画面のロジック

import { escapeHtml } from '../utils';
import { loadNeedsData, saveNeedsData } from './data';
import type { NeedItems, NeedsData, SubCategories } from './data';

/** [ステークホルダ] または [ステークホルダ, サブカテゴリ] */
type NeedPath = [string] | [string, string];

const OUTPUT_PAGE = '/tools/needsList/output';

const defaultData: NeedsData = {
    // 必要に応じて初期データを設定してください
};

let needsData: NeedsData = {};

// ---------- データ操作 ----------

function cloneDefaultData(): NeedsData {
    return structuredClone(defaultData);
}

function persist(): void {
    saveNeedsData(needsData);
}

/** 保存して再描画する */
function commit(): void {
    persist();
    const statusEl = document.getElementById('data-status');
    if (statusEl) {
        statusEl.innerText = `変更をローカルに保存しました (${new Date().toLocaleTimeString()})`;
    }
    renderTree();
}

function getItems([topKey, subKey]: NeedPath): NeedItems | undefined {
    const val = needsData[topKey];
    if (subKey === undefined) return Array.isArray(val) ? val : undefined;
    return Array.isArray(val) ? undefined : val?.[subKey];
}

// ---------- 描画 ----------

/** パスを data 属性の文字列に変換する */
function pathAttrs([topKey, subKey]: NeedPath): string {
    const top = `data-top="${escapeHtml(topKey)}"`;
    return subKey === undefined ? top : `${top} data-sub="${escapeHtml(subKey)}"`;
}

function renderItemsList(items: NeedItems, path: NeedPath): string {
    if (items.length === 0) {
        return '<p class="empty-items">(ニーズ項目なし)</p>';
    }
    const rows = items.map((item, idx) => `
        <li>
            <span>・ ${escapeHtml(item)}</span>
            <button class="btn btn-danger" data-action="delete-need" ${pathAttrs(path)} data-idx="${idx}">×</button>
        </li>
    `).join('');
    return `<ul class="items-list">${rows}</ul>`;
}

function renderAddNeedForm(path: NeedPath): string {
    return `
        <div class="add-inline-form">
            <input type="text" class="input-flex" placeholder="＋ ニーズを追加" data-enter="add-need" ${pathAttrs(path)}>
            <button class="btn btn-secondary btn-inline" data-action="add-need" ${pathAttrs(path)}>追加</button>
        </div>
    `;
}

function renderSubCategory(topKey: string, subKey: string, items: NeedItems): string {
    const path: NeedPath = [topKey, subKey];
    return `
        <div class="sub-category-block">
            <div class="sub-category-header">
                <span>└ ${escapeHtml(subKey)}</span>
                <button class="btn btn-danger" data-action="delete-sub" ${pathAttrs(path)}>削除</button>
            </div>
            ${renderItemsList(items, path)}
            ${renderAddNeedForm(path)}
        </div>
    `;
}

function renderAddSubForm(topKey: string): string {
    const attrs = pathAttrs([topKey]);
    return `
        <div class="add-sub-area">
            <div class="add-inline-form">
                <input type="text" class="input-flex" placeholder="＋ サブカテゴリを追加 (例: 若年層, VIP)" data-enter="add-sub" ${attrs}>
                <button class="btn btn-primary btn-inline" data-action="add-sub" ${attrs}>追加</button>
            </div>
        </div>
    `;
}

function renderTopCategory(topKey: string, val: NeedItems | SubCategories): string {
    const isArray = Array.isArray(val);
    const attrs = pathAttrs([topKey]);

    let body = '';
    if (isArray) {
        body = `
            <div class="top-items-area">
                ${renderItemsList(val, [topKey])}
                ${renderAddNeedForm([topKey])}
            </div>
        `;
    } else if (typeof val === 'object' && val !== null) {
        body = Object.entries(val)
            .map(([subKey, items]) => renderSubCategory(topKey, subKey, items || []))
            .join('') + renderAddSubForm(topKey);
    }

    return `
        <div class="top-category-block">
            <div class="top-category-header">
                <span> ${escapeHtml(topKey)}</span>
                <div>
                    ${isArray ? `<button class="btn btn-secondary btn-convert" data-action="convert-to-group" ${attrs}>サブカテゴリを追加</button>` : ''}
                    <button class="btn btn-danger" data-action="delete-top" ${attrs}>削除</button>
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
    root.innerHTML = entries.map(([topKey, val]) => renderTopCategory(topKey, val)).join('');
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

function deleteTopCategory(topKey: string): void {
    if (!confirm(`「${topKey}」とその下のデータをすべて削除しますか？`)) return;
    delete needsData[topKey];
    commit();
}

function convertToGroup(topKey: string): void {
    needsData[topKey] = {};
    commit();
}

function addSubCategory(topKey: string, input: HTMLInputElement): void {
    const subName = input.value.trim();
    if (!subName) return;

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

function deleteSubCategory(topKey: string, subKey: string): void {
    if (!confirm(`サブカテゴリ「${subKey}」を削除しますか？`)) return;
    const subs = needsData[topKey] as SubCategories | undefined;
    if (subs) {
        delete subs[subKey];
    }
    commit();
}

function addNeedItem(path: NeedPath, input: HTMLInputElement): void {
    const text = input.value.trim();
    if (!text) return;

    getItems(path)?.push(text);
    input.value = '';
    commit();

    // 再描画後、同じ入力欄にフォーカスを戻して連続入力できるようにする
    setTimeout(() => findAddNeedInput(path)?.focus(), 50);
}

function deleteNeedItem(path: NeedPath, idx: number): void {
    getItems(path)?.splice(idx, 1);
    commit();
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

function readPath(el: HTMLElement): NeedPath {
    const { top = '', sub } = el.dataset;
    return sub === undefined ? [top] : [top, sub];
}

function findAddNeedInput(path: NeedPath): HTMLInputElement | undefined {
    const inputs = document.querySelectorAll<HTMLInputElement>('#tree-root input[data-enter="add-need"]');
    return Array.from(inputs).find(el => {
        const p = readPath(el);
        return p[0] === path[0] && p[1] === path[1];
    });
}

/** ボタンと同じフォーム内の入力欄を取得する */
function siblingInput(el: HTMLElement): HTMLInputElement | null {
    return el.closest('.add-inline-form')?.querySelector('input') ?? null;
}

function handleTreeAction(action: string, el: HTMLElement): void {
    const path = readPath(el);
    const [topKey, subKey] = path;

    switch (action) {
        case 'delete-top':
            deleteTopCategory(topKey);
            break;
        case 'convert-to-group':
            convertToGroup(topKey);
            break;
        case 'delete-sub':
            deleteSubCategory(topKey, subKey ?? '');
            break;
        case 'delete-need':
            deleteNeedItem(path, Number(el.dataset.idx));
            break;
        case 'add-sub': {
            const input = el instanceof HTMLInputElement ? el : siblingInput(el);
            if (input) addSubCategory(topKey, input);
            break;
        }
        case 'add-need': {
            const input = el instanceof HTMLInputElement ? el : siblingInput(el);
            if (input) addNeedItem(path, input);
            break;
        }
    }
}

function bindEvents(): void {
    document.getElementById('reset-btn')?.addEventListener('click', resetToDefault);
    document.getElementById('add-top-category-btn')?.addEventListener('click', addTopCategory);
    document.getElementById('save-navigate-btn')?.addEventListener('click', saveAndNavigate);

    const root = document.getElementById('tree-root');
    root?.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (el?.dataset.action) handleTreeAction(el.dataset.action, el);
    });
    root?.addEventListener('keydown', e => {
        const el = e.target as HTMLElement;
        if (e.key === 'Enter' && el.dataset.enter) handleTreeAction(el.dataset.enter, el);
    });
}

export function initNeedsList(): void {
    needsData = loadNeedsData(defaultData);
    bindEvents();
    renderTree();
}
