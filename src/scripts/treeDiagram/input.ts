// 展開図作成画面のロジック

import { escapeHtml } from '../utils';
import {
    DEFAULT_TREE_DATA,
    generateId,
    loadTreeData,
    saveTreeData,
} from './data';
import type { TreeCategory, TreeDiagramData, TreeSubCategory } from './data';
import { drawConnections, renderTreeHtml } from './output';

const OUTPUT_PAGE = '/tools/treeDiagram/output';

let treeData: TreeDiagramData = structuredClone(DEFAULT_TREE_DATA);

// ---------- データ永続化・状態管理 ----------

function persist(): void {
    saveTreeData(treeData);
}

function updateStatusText(): void {
    const statusEl = document.getElementById('data-status');
    if (statusEl) {
        statusEl.innerText = `変更をローカルに保存しました (${new Date().toLocaleTimeString()})`;
    }
}

function updatePreview(): void {
    const container = document.getElementById('tree-preview-container');
    if (!container) return;

    container.innerHTML = renderTreeHtml(treeData, 'preview-');

    requestAnimationFrame(() => {
        drawConnections(treeData, 'preview-');
    });
    setTimeout(() => {
        drawConnections(treeData, 'preview-');
    }, 50);
}

function commit(): void {
    persist();
    updateStatusText();
    renderTreeEditor();
    updatePreview();
}

function resetToDefault(): void {
    if (!confirm('初期データにリセットしますか？現在の編集内容は消去されます。')) return;
    treeData = structuredClone(DEFAULT_TREE_DATA);
    const themeInput = document.getElementById('theme-input') as HTMLInputElement | null;
    if (themeInput) {
        themeInput.value = '';
    }
    commit();
}

// ---------- レンダリング ----------

/** 名前を直接書き換えられる入力欄 */
function nameInput(value: string, label: string, attrs: string, extraClass = ''): string {
    return `<input type="text" class="input-flex tree-name-input ${extraClass}" value="${escapeHtml(value)}" aria-label="${escapeHtml(label)}" ${attrs}>`;
}

function renderLeafItems(catId: string, subId: string | null, items: string[]): string {
    if (items.length === 0) {
        return '<p class="empty-items-text">(詳細項目なし)</p>';
    }

    const rows = items
        .map(
            (item, idx) => `
        <li class="item-row">
            <span class="item-bullet">・</span>
            ${nameInput(item, `詳細項目 ${idx + 1}`, `data-rename="item" data-cat="${catId}" ${subId ? `data-sub="${subId}"` : ''} data-idx="${idx}"`, 'tree-name-item')}
            <button class="btn btn-danger" data-action="delete-item" data-cat="${catId}" ${subId ? `data-sub="${subId}"` : ''} data-idx="${idx}" title="削除">×</button>
        </li>
    `,
        )
        .join('');

    return `<ul class="item-list">${rows}</ul>`;
}

function renderAddItemForm(catId: string, subId: string | null): string {
    const subAttr = subId ? `data-sub="${subId}"` : '';
    return `
        <div class="add-inline-form">
            <input type="text" class="input-flex" placeholder="＋ 詳細項目を追加 (Enterで追加)" data-enter="add-item" data-cat="${catId}" ${subAttr}>
            <button class="btn btn-secondary btn-inline" data-action="add-item" data-cat="${catId}" ${subAttr}>追加</button>
        </div>
    `;
}

function renderSubCategory(cat: TreeCategory, sub: TreeSubCategory): string {
    return `
        <div class="sub-block">
            <div class="sub-header">
                <div class="sub-title-area">
                    <span class="level-tag tag-l3">第3層</span>
                    ${nameInput(sub.name, '中項目名', `data-rename="sub" data-cat="${cat.id}" data-sub="${sub.id}"`, 'tree-name-sub')}
                </div>
                <button class="btn btn-danger" data-action="delete-sub" data-cat="${cat.id}" data-sub="${sub.id}">中項目を削除</button>
            </div>
            ${renderLeafItems(cat.id, sub.id, sub.items)}
            ${renderAddItemForm(cat.id, sub.id)}
        </div>
    `;
}

function renderCategoryBlock(cat: TreeCategory): string {
    const hasSubCategories = cat.subCategories.length > 0;

    let bodyHtml = '';
    if (hasSubCategories) {
        // 第3層がある場合
        const subsHtml = cat.subCategories.map(sub => renderSubCategory(cat, sub)).join('');
        bodyHtml = `
            ${subsHtml}
            <div class="add-sub-area">
                <div class="add-inline-form">
                    <input type="text" class="input-flex" placeholder="＋ 中項目（第3層）を追加 (例: 快適性を確保する)" data-enter="add-sub" data-cat="${cat.id}">
                    <button class="btn btn-primary btn-inline" data-action="add-sub" data-cat="${cat.id}">中項目を追加</button>
                </div>
            </div>
        `;
    } else {
        // 第3層をまだ設けていない場合
        const directItems = cat.items || [];
        bodyHtml = `
            <div class="direct-items-area">
                ${renderLeafItems(cat.id, null, directItems)}
                ${renderAddItemForm(cat.id, null)}
            </div>
            <div class="add-sub-area">
                <div class="add-inline-form">
                    <input type="text" class="input-flex" placeholder="＋ 中項目（第3層）を追加して階層を深める" data-enter="add-sub" data-cat="${cat.id}">
                    <button class="btn btn-primary btn-inline" data-action="add-sub" data-cat="${cat.id}">中項目を追加</button>
                </div>
            </div>
        `;
    }

    return `
        <div class="cat-block">
            <div class="cat-header">
                <div class="cat-title-area">
                    <span class="level-tag tag-l2">第2層</span>
                    ${nameInput(cat.name, '大項目名', `data-rename="cat" data-cat="${cat.id}"`, 'tree-name-cat')}
                </div>
                <div class="cat-actions">
                    <button class="btn btn-danger" data-action="delete-cat" data-cat="${cat.id}">大項目を削除</button>
                </div>
            </div>
            <div class="cat-body">
                ${bodyHtml}
            </div>
        </div>
    `;
}

function renderTreeEditor(): void {
    const root = document.getElementById('tree-editor-root');
    if (!root) return;

    if (treeData.categories.length === 0) {
        root.innerHTML = '<p class="empty-tree">大項目（第2層）が登録されていません。上のフォームから大項目を追加してください。</p>';
        return;
    }

    root.innerHTML = treeData.categories.map(cat => renderCategoryBlock(cat)).join('');
}

// ---------- 操作ロジック ----------

function handleThemeChange(val: string): void {
    treeData.title = val.trim();
    persist();
    updateStatusText();
    updatePreview();
}

function addCategory(): void {
    const input = document.getElementById('new-cat-input') as HTMLInputElement | null;
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;

    treeData.categories.push({
        id: generateId(),
        name,
        subCategories: [],
        items: [],
    });
    input.value = '';
    commit();
}

function deleteCategory(catId: string): void {
    const target = treeData.categories.find(c => c.id === catId);
    if (!target) return;
    if (!confirm(`大項目「${target.name}」とその配下の全データを削除しますか？`)) return;

    treeData.categories = treeData.categories.filter(c => c.id !== catId);
    commit();
}

function addSubCategory(catId: string, input: HTMLInputElement): void {
    const name = input.value.trim();
    if (!name) return;

    const cat = treeData.categories.find(c => c.id === catId);
    if (!cat) return;

    cat.subCategories.push({
        id: generateId(),
        name,
        items: [],
    });
    input.value = '';
    commit();

    // 追加後、新しく追加された中項目の詳細項目入力欄にフォーカス
    setTimeout(() => {
        const lastSub = cat.subCategories[cat.subCategories.length - 1];
        if (lastSub) {
            findItemInput(catId, lastSub.id)?.focus();
        }
    }, 50);
}

function deleteSubCategory(catId: string, subId: string): void {
    const cat = treeData.categories.find(c => c.id === catId);
    if (!cat) return;
    const targetSub = cat.subCategories.find(s => s.id === subId);
    if (!confirm(`中項目「${targetSub?.name ?? ''}」とその詳細項目を削除しますか？`)) return;

    cat.subCategories = cat.subCategories.filter(s => s.id !== subId);
    commit();
}

function addItem(catId: string, subId: string | null, input: HTMLInputElement): void {
    const text = input.value.trim();
    if (!text) return;

    const cat = treeData.categories.find(c => c.id === catId);
    if (!cat) return;

    if (subId) {
        const sub = cat.subCategories.find(s => s.id === subId);
        if (!sub) return;
        sub.items.push(text);
    } else {
        if (!cat.items) cat.items = [];
        cat.items.push(text);
    }

    input.value = '';
    commit();

    // 連続入力のためにフォーカスを戻す
    setTimeout(() => findItemInput(catId, subId)?.focus(), 50);
}

function deleteItem(catId: string, subId: string | null, idx: number): void {
    const cat = treeData.categories.find(c => c.id === catId);
    if (!cat) return;

    if (subId) {
        const sub = cat.subCategories.find(s => s.id === subId);
        if (!sub) return;
        sub.items.splice(idx, 1);
    } else if (cat.items) {
        cat.items.splice(idx, 1);
    }

    commit();
}

function findItemInput(catId: string, subId: string | null): HTMLInputElement | undefined {
    const selector = subId
        ? `#tree-editor-root input[data-enter="add-item"][data-cat="${catId}"][data-sub="${subId}"]`
        : `#tree-editor-root input[data-enter="add-item"][data-cat="${catId}"]:not([data-sub])`;
    return document.querySelector<HTMLInputElement>(selector) ?? undefined;
}

function siblingInput(el: HTMLElement): HTMLInputElement | null {
    return el.closest('.add-inline-form')?.querySelector('input') ?? null;
}

/** 名前の入力欄の値をデータに反映する。空のまま確定したときは仮の名前を付ける */
function renameItem(el: HTMLInputElement, confirmed: boolean): void {
    const type = el.dataset.rename;
    const catId = el.dataset.cat;
    const subId = el.dataset.sub;
    const idx = el.dataset.idx !== undefined ? Number(el.dataset.idx) : null;
    let value = el.value;

    const cat = treeData.categories.find(c => c.id === catId);
    if (!cat) return;

    if (confirmed && !value.trim()) {
        if (type === 'cat') value = '大項目';
        else if (type === 'sub') value = '中項目';
        else if (type === 'item') value = `詳細項目 ${(idx ?? 0) + 1}`;
        el.value = value;
    }

    if (type === 'cat') {
        cat.name = value;
    } else if (type === 'sub') {
        const sub = cat.subCategories.find(s => s.id === subId);
        if (sub) sub.name = value;
    } else if (type === 'item') {
        if (subId) {
            const sub = cat.subCategories.find(s => s.id === subId);
            if (sub && idx !== null && sub.items[idx] !== undefined) {
                sub.items[idx] = value;
            }
        } else if (cat.items && idx !== null && cat.items[idx] !== undefined) {
            cat.items[idx] = value;
        }
    }

    persist();
    updatePreview();
}

function handleEditorAction(action: string, el: HTMLElement): void {
    const catId = el.dataset.cat || '';
    const subId = el.dataset.sub || null;

    switch (action) {
        case 'delete-cat':
            deleteCategory(catId);
            break;
        case 'delete-sub':
            if (subId) deleteSubCategory(catId, subId);
            break;
        case 'delete-item': {
            const idx = Number(el.dataset.idx);
            deleteItem(catId, subId, idx);
            break;
        }
        case 'add-sub': {
            const input = el instanceof HTMLInputElement ? el : siblingInput(el);
            if (input) addSubCategory(catId, input);
            break;
        }
        case 'add-item': {
            const input = el instanceof HTMLInputElement ? el : siblingInput(el);
            if (input) addItem(catId, subId, input);
            break;
        }
    }
}

function saveAndNavigate(): void {
    persist();
    window.location.href = OUTPUT_PAGE;
}

/** 名前の入力欄の変更を受け取る */
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

// ---------- イベント設定 ----------

function bindEvents(): void {
    // 初期化ボタン
    document.getElementById('reset-btn')?.addEventListener('click', resetToDefault);

    // テーマ入力の変更イベント
    const themeInput = document.getElementById('theme-input') as HTMLInputElement | null;
    themeInput?.addEventListener('input', e => {
        handleThemeChange((e.target as HTMLInputElement).value);
    });

    // 大項目追加
    document.getElementById('add-cat-btn')?.addEventListener('click', addCategory);
    document.getElementById('new-cat-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.isComposing) addCategory();
    });

    // 確定遷移
    document.getElementById('save-navigate-btn')?.addEventListener('click', saveAndNavigate);

    // ツリーエディタ内のイベント委譲
    const editorRoot = document.getElementById('tree-editor-root');
    editorRoot?.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (el?.dataset.action) handleEditorAction(el.dataset.action, el);
    });

    editorRoot?.addEventListener('keydown', e => {
        const el = e.target as HTMLElement;
        if (e.key === 'Enter' && !e.isComposing && el.dataset.enter) {
            handleEditorAction(el.dataset.enter, el);
        }
    });

    bindRenameEvents(editorRoot);

    // スマホタブ切り替え時やウィンドウリサイズ時にもプレビューの接続線を再描画
    document.querySelectorAll('[data-workspace-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            setTimeout(() => drawConnections(treeData, 'preview-'), 50);
        });
    });
    window.addEventListener('resize', () => {
        drawConnections(treeData, 'preview-');
    });
}

// ---------- 初期化 ----------

export function initTreeDiagramInput(): void {
    treeData = loadTreeData(DEFAULT_TREE_DATA);

    // テーマ入力初期値
    const themeInput = document.getElementById('theme-input') as HTMLInputElement | null;
    if (themeInput) {
        themeInput.value = treeData.title;
    }

    bindEvents();
    renderTreeEditor();
    updatePreview();
}
