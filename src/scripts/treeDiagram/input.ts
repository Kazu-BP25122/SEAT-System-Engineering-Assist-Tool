// 展開図作成画面のロジック

import { escapeHtml } from '../utils';
import {
    DEFAULT_TREE_DATA,
    EMPTY_TREE_DATA,
    SAMPLE_NEEDS_TREE,
    SAMPLE_PURPOSE_TREE,
    generateId,
    loadTreeData,
    saveTreeData,
} from './data';
import type { TreeCategory, TreeDiagramData, TreeSubCategory } from './data';

const OUTPUT_PAGE = '/tools/treeDiagram/output';

let treeData: TreeDiagramData = structuredClone(DEFAULT_TREE_DATA);

// ---------- データ永続化・状態管理 ----------

function persist(): void {
    saveTreeData(treeData);
}

function commit(): void {
    persist();
    updateStatusText();
    renderTreeEditor();
}

function updateStatusText(): void {
    const statusEl = document.getElementById('data-status');
    if (statusEl) {
        statusEl.innerText = `変更をローカルに保存しました (${new Date().toLocaleTimeString()})`;
    }
}

// ---------- プリセット操作 ----------

function applyPreset(presetData: TreeDiagramData, confirmMsg?: string): void {
    if (confirmMsg && !confirm(confirmMsg)) return;
    treeData = structuredClone(presetData);
    // テーマ入力欄の同期
    const themeInput = document.getElementById('theme-input') as HTMLInputElement | null;
    if (themeInput) {
        themeInput.value = treeData.title;
    }
    commit();
}

// ---------- レンダリング ----------

function renderLeafItems(catId: string, subId: string | null, items: string[]): string {
    if (items.length === 0) {
        return '<p class="empty-items-text">(詳細項目なし)</p>';
    }

    const rows = items
        .map(
            (item, idx) => `
        <li class="item-row">
            <span class="item-text"><span class="item-bullet">・</span>${escapeHtml(item)}</span>
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
                    <span class="sub-title-text">${escapeHtml(sub.name)}</span>
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
        // 第3層をまだ設けていない場合：直接項目を入れるか、中項目に切り替えるか
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
                    <span class="cat-title-text">${escapeHtml(cat.name)}</span>
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
    treeData.title = val.trim() || 'メインテーマを入力';
    persist();
    updateStatusText();
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

// ---------- イベント設定 ----------

function bindEvents(): void {
    // テーマ入力の変更イベント
    const themeInput = document.getElementById('theme-input') as HTMLInputElement | null;
    themeInput?.addEventListener('input', e => {
        handleThemeChange((e.target as HTMLInputElement).value);
    });

    // プリセットボタン群
    document.getElementById('preset-needs')?.addEventListener('click', () => {
        applyPreset(SAMPLE_NEEDS_TREE, '「ニーズ展開図」のサンプルデータを読み込みますか？（現在の編集内容は上書きされます）');
    });

    document.getElementById('preset-purpose')?.addEventListener('click', () => {
        applyPreset(SAMPLE_PURPOSE_TREE, '「目的展開図」のサンプルデータを読み込みますか？（現在の編集内容は上書きされます）');
    });

    document.getElementById('preset-empty')?.addEventListener('click', () => {
        applyPreset(EMPTY_TREE_DATA, '新規作成（データを空にする）しますか？（現在の編集内容は上書きされます）');
    });

    // 大項目追加
    document.getElementById('add-cat-btn')?.addEventListener('click', addCategory);
    document.getElementById('new-cat-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addCategory();
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
        if (e.key === 'Enter' && el.dataset.enter) {
            handleEditorAction(el.dataset.enter, el);
        }
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
}
