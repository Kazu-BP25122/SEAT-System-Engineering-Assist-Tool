// 作業一覧表（WBS）の入力画面ロジック

import { escapeHtml } from '../utils';
import { loadWbsData, saveWbsData, SAMPLE_WBS_DATA, DEFAULT_WBS_DATA } from './data';
import type { WbsData, WbsItem } from './data';
import { createWbsTableHtml } from './output';

const OUTPUT_PAGE = '/tools/wbs/output/';

let wbsData: WbsData;

function persist(): void {
    saveWbsData(wbsData);
    const statusEl = document.getElementById('data-status');
    if (statusEl) {
        statusEl.innerText = `変更をローカルに保存しました (${new Date().toLocaleTimeString()})`;
    }
}

function updatePreview(): void {
    const previewEl = document.getElementById('table-preview');
    if (previewEl) {
        previewEl.innerHTML = createWbsTableHtml(wbsData);
    }
}

/** ユニークなIDを生成する */
function createId(): string {
    return `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/** エディタテーブルの各行HTMLを生成する */
function renderEditorRows(): string {
    if (wbsData.items.length === 0) {
        return `
            <tr>
                <td colspan="6" class="wbs-editor-empty">
                    作業項目がありません。「行を追加」ボタンを押して項目を追加してください。
                </td>
            </tr>
        `;
    }

    return wbsData.items.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index === wbsData.items.length - 1;
        const isParent = !item.symbol && !item.duration;

        return `
            <tr class="wbs-editor-row ${isParent ? 'is-parent-row' : ''}" data-id="${item.id}" data-index="${index}">
                <td class="col-wbs">
                    <input type="text" class="form-control input-sm" data-field="wbs" value="${escapeHtml(item.wbs)}" placeholder="1. / 2.1" aria-label="WBS番号">
                </td>
                <td class="col-name">
                    <input type="text" class="form-control input-sm" data-field="name" value="${escapeHtml(item.name)}" placeholder="作業名" aria-label="作業の名称">
                </td>
                <td class="col-symbol">
                    <input type="text" class="form-control input-sm text-center" data-field="symbol" value="${escapeHtml(item.symbol)}" placeholder="A" aria-label="記号">
                </td>
                <td class="col-predecessors">
                    <input type="text" class="form-control input-sm text-center" data-field="predecessors" value="${escapeHtml(item.predecessors)}" placeholder="-" aria-label="先行作業">
                </td>
                <td class="col-duration">
                    <input type="text" class="form-control input-sm text-center" data-field="duration" value="${escapeHtml(item.duration)}" placeholder="4" aria-label="所要時間">
                </td>
                <td class="col-actions">
                    <div class="row-btn-group">
                        <button type="button" class="btn btn-icon" data-action="move-up" title="上へ移動" ${isFirst ? 'disabled' : ''}>↑</button>
                        <button type="button" class="btn btn-icon" data-action="move-down" title="下へ移動" ${isLast ? 'disabled' : ''}>↓</button>
                        <button type="button" class="btn btn-icon btn-insert" data-action="insert-below" title="直下に行を挿入">＋</button>
                        <button type="button" class="btn btn-icon btn-delete" data-action="delete" title="行を削除">×</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/** エディタ全体の描画（行の追加・削除・並び替え時） */
function renderEditor(): void {
    const tableBody = document.getElementById('wbs-editor-tbody');
    if (tableBody) {
        tableBody.innerHTML = renderEditorRows();
    }

    const tableNumInput = document.getElementById('meta-table-num') as HTMLInputElement | null;
    if (tableNumInput && tableNumInput.value !== wbsData.tableNumber) {
        tableNumInput.value = wbsData.tableNumber;
    }

    const titleInput = document.getElementById('meta-title') as HTMLInputElement | null;
    if (titleInput && titleInput.value !== wbsData.title) {
        titleInput.value = wbsData.title;
    }

    const unitInput = document.getElementById('meta-unit') as HTMLInputElement | null;
    if (unitInput && unitInput.value !== wbsData.timeUnit) {
        unitInput.value = wbsData.timeUnit;
    }

    updatePreview();
}

/** 自動採番処理（例: 親は 1., 2.、子は 2.1, 2.2 など） */
function renumberWbs(): void {
    let topCount = 0;
    let subCount = 0;
    let inGroup = false;

    wbsData.items.forEach(item => {
        const isParent = !item.symbol && !item.duration;
        if (isParent) {
            topCount++;
            subCount = 0;
            inGroup = true;
            item.wbs = `${topCount}.`;
        } else if (inGroup) {
            subCount++;
            item.wbs = `${topCount}.${subCount}`;
        } else {
            topCount++;
            item.wbs = `${topCount}.`;
        }
    });

    persist();
    renderEditor();
}

/** 次の自動記号候補を計算（例: A, B, C, ...） */
function getNextSymbol(): string {
    const usedSymbols = new Set(wbsData.items.map(it => it.symbol.trim()).filter(Boolean));
    for (let i = 0; i < 26; i++) {
        const char = String.fromCharCode(65 + i);
        if (!usedSymbols.has(char)) {
            return char;
        }
    }
    return '';
}

/** 行の新規追加 */
function addItem(index?: number, isParent: boolean = false): void {
    const newItem: WbsItem = {
        id: createId(),
        wbs: '',
        name: isParent ? '新規開発' : '',
        symbol: isParent ? '' : getNextSymbol(),
        predecessors: isParent ? '' : '-',
        duration: isParent ? '' : '1',
    };

    if (typeof index === 'number' && index >= 0 && index < wbsData.items.length) {
        wbsData.items.splice(index + 1, 0, newItem);
    } else {
        wbsData.items.push(newItem);
    }

    persist();
    renderEditor();
}

/** 入力ページのイベント登録と初期化 */
export function initWbs(): void {
    wbsData = loadWbsData(SAMPLE_WBS_DATA);

    // 基本設定の変更イベント
    const metaTableNum = document.getElementById('meta-table-num') as HTMLInputElement | null;
    if (metaTableNum) {
        metaTableNum.value = wbsData.tableNumber;
        metaTableNum.addEventListener('input', () => {
            wbsData.tableNumber = metaTableNum.value;
            persist();
            updatePreview();
        });
    }

    const metaTitle = document.getElementById('meta-title') as HTMLInputElement | null;
    if (metaTitle) {
        metaTitle.value = wbsData.title;
        metaTitle.addEventListener('input', () => {
            wbsData.title = metaTitle.value;
            persist();
            updatePreview();
        });
    }

    const metaUnit = document.getElementById('meta-unit') as HTMLInputElement | null;
    if (metaUnit) {
        metaUnit.value = wbsData.timeUnit;
        metaUnit.addEventListener('input', () => {
            wbsData.timeUnit = metaUnit.value;
            persist();
            updatePreview();
        });
    }

    // テーブル内の input イベント（イベント委任で入力中のフォーカスを保持）
    const tbody = document.getElementById('wbs-editor-tbody');
    if (tbody) {
        tbody.addEventListener('input', (event) => {
            const target = event.target as HTMLInputElement;
            if (!target || !target.matches('input[data-field]')) return;

            const row = target.closest<HTMLTableRowElement>('.wbs-editor-row');
            if (!row) return;

            const index = Number(row.dataset.index);
            const field = target.dataset.field as keyof WbsItem;
            if (index >= 0 && index < wbsData.items.length && field) {
                wbsData.items[index][field] = target.value;
                persist();
                updatePreview();

                // 記号または所要時間の有無で親行スタイルの切り替え
                const isParent = !wbsData.items[index].symbol && !wbsData.items[index].duration;
                row.classList.toggle('is-parent-row', isParent);
            }
        });

        // ボタン操作（クリックイベント委任）
        tbody.addEventListener('click', (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
            if (!button) return;

            const row = button.closest<HTMLTableRowElement>('.wbs-editor-row');
            if (!row) return;

            const index = Number(row.dataset.index);
            const action = button.dataset.action;

            if (action === 'delete') {
                if (wbsData.items.length <= 1) {
                    alert('最後の1行は削除できません。');
                    return;
                }
                wbsData.items.splice(index, 1);
                persist();
                renderEditor();
            } else if (action === 'insert-below') {
                addItem(index);
            } else if (action === 'move-up' && index > 0) {
                const temp = wbsData.items[index];
                wbsData.items[index] = wbsData.items[index - 1];
                wbsData.items[index - 1] = temp;
                persist();
                renderEditor();
            } else if (action === 'move-down' && index < wbsData.items.length - 1) {
                const temp = wbsData.items[index];
                wbsData.items[index] = wbsData.items[index + 1];
                wbsData.items[index + 1] = temp;
                persist();
                renderEditor();
            }
        });
    }

    // 「行を追加」ボタン
    const addRowBtn = document.getElementById('add-row-btn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
            addItem();
        });
    }

    // 「親グループ行を追加」ボタン
    const addGroupBtn = document.getElementById('add-group-btn');
    if (addGroupBtn) {
        addGroupBtn.addEventListener('click', () => {
            addItem(undefined, true);
        });
    }

    // 「WBS番号を自動整列」ボタン
    const renumberBtn = document.getElementById('renumber-btn');
    if (renumberBtn) {
        renumberBtn.addEventListener('click', () => {
            if (confirm('WBS番号を自動的に 1., 2., 2.1... のように採番し直しますか？')) {
                renumberWbs();
            }
        });
    }

    // 「サンプルデータを読み込む」ボタン
    const loadSampleBtn = document.getElementById('load-sample-btn');
    if (loadSampleBtn) {
        loadSampleBtn.addEventListener('click', () => {
            if (confirm('サンプルデータ（表7.1 プロジェクトの作業一覧表）を読み込みますか？ 現在の入力内容は上書きされます。')) {
                wbsData = structuredClone(SAMPLE_WBS_DATA);
                persist();
                renderEditor();
            }
        });
    }

    // 「初期化」ボタン
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('作業一覧表を初期化しますか？ すべての入力内容が消去されます。')) {
                wbsData = structuredClone(DEFAULT_WBS_DATA);
                persist();
                renderEditor();
            }
        });
    }

    // 出力画面へ遷移ボタン
    const saveNavigateBtn = document.getElementById('save-navigate-btn');
    if (saveNavigateBtn) {
        saveNavigateBtn.addEventListener('click', () => {
            persist();
            window.location.href = OUTPUT_PAGE;
        });
    }

    // 初期描画
    renderEditor();
}
