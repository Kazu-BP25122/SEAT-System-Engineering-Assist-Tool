// 作業一覧表（WBS）の入力画面ロジック

import { escapeHtml } from '../utils';
import {
    DEFAULT_WBS_DATA,
    SAMPLE_WBS_DATA,
    flattenWbsData,
    loadWbsData,
    saveWbsData,
} from './data';
import type { WbsData, WbsGroup, WbsTask } from './data';
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

function createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/** グループブロック全体のHTMLを生成する */
function renderGroups(): string {
    if (wbsData.groups.length === 0) {
        return `
            <div class="wbs-empty-groups">
                親グループがありません。上の入力欄から「親グループを追加」してください。
            </div>
        `;
    }

    // 各アイテムの自動WBS番号と自動記号を引けるようにマップを作成
    const flatItems = flattenWbsData(wbsData);
    const itemMap = new Map(flatItems.map(it => [it.id, it]));

    return wbsData.groups.map((group, gIdx) => {
        const isFirstGroup = gIdx === 0;
        const isLastGroup = gIdx === wbsData.groups.length - 1;
        const groupFlat = itemMap.get(group.id);
        const groupWbs = groupFlat ? groupFlat.wbs : `${gIdx + 1}.`;
        const hasTasks = group.tasks.length > 0;

        // 子作業テーブル
        let tasksHtml = '';
        if (hasTasks) {
            const taskRows = group.tasks.map((task, tIdx) => {
                const taskFlat = itemMap.get(task.id);
                const taskWbs = taskFlat ? taskFlat.wbs : `${gIdx + 1}.${tIdx + 1}`;
                const taskSymbol = taskFlat ? taskFlat.symbol : '';
                const isFirstTask = tIdx === 0;
                const isLastTask = tIdx === group.tasks.length - 1;

                return `
                    <tr class="wbs-task-row" data-task-id="${task.id}" data-group-index="${gIdx}" data-task-index="${tIdx}">
                        <td class="cell-task-wbs"><span class="badge-wbs">${taskWbs}</span></td>
                        <td class="cell-task-name">
                            <input type="text" class="form-control input-sm" data-field="task-name" value="${escapeHtml(task.name)}" placeholder="作業名" aria-label="作業の名称">
                        </td>
                        <td class="cell-task-symbol"><span class="badge-symbol">${taskSymbol}</span></td>
                        <td class="cell-task-predecessors">
                            <input type="text" class="form-control input-sm text-center" data-field="task-predecessors" value="${escapeHtml(task.predecessors)}" placeholder="例: A または -" aria-label="先行作業">
                        </td>
                        <td class="cell-task-duration">
                            <input type="text" class="form-control input-sm text-center" data-field="task-duration" value="${escapeHtml(task.duration)}" placeholder="例: 4" aria-label="所要時間">
                        </td>
                        <td class="cell-task-actions">
                            <div class="row-btn-group">
                                <button type="button" class="btn btn-icon" data-action="move-up-task" title="上へ移動" ${isFirstTask ? 'disabled' : ''}>↑</button>
                                <button type="button" class="btn btn-icon" data-action="move-down-task" title="下へ移動" ${isLastTask ? 'disabled' : ''}>↓</button>
                                <button type="button" class="btn btn-icon btn-delete" data-action="delete-task" title="作業を削除">×</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            tasksHtml = `
                <div class="wbs-tasks-table-container">
                    <table class="wbs-tasks-table">
                        <thead>
                            <tr>
                                <th style="width: 70px;">WBS</th>
                                <th>作業の名称</th>
                                <th style="width: 55px;">記号</th>
                                <th style="width: 95px;">先行作業</th>
                                <th style="width: 80px;">所要時間</th>
                                <th style="width: 85px;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${taskRows}
                        </tbody>
                    </table>
                </div>
            `;
        }

        // 子タスクがない場合の単独作業用入力欄
        const singleTaskFields = !hasTasks ? `
            <div class="wbs-single-task-fields">
                <span class="badge-symbol">${groupFlat ? groupFlat.symbol : 'A'}</span>
                <div class="single-field-group">
                    <label>先行作業:</label>
                    <input type="text" class="form-control input-sm text-center" data-field="group-predecessors" value="${escapeHtml(group.predecessors ?? '-')}" placeholder="-">
                </div>
                <div class="single-field-group">
                    <label>所要時間:</label>
                    <input type="text" class="form-control input-sm text-center" data-field="group-duration" value="${escapeHtml(group.duration ?? '')}" placeholder="4">
                </div>
            </div>
        ` : '';

        return `
            <div class="wbs-group-block" data-group-id="${group.id}" data-group-index="${gIdx}">
                <div class="wbs-group-header">
                    <div class="wbs-group-title-area">
                        <span class="badge-group-wbs">${groupWbs}</span>
                        <input type="text" class="form-control group-name-input" data-field="group-name" value="${escapeHtml(group.name)}" placeholder="グループ名（例: 機械開発）" aria-label="グループ名">
                    </div>
                    ${singleTaskFields}
                    <div class="wbs-group-actions">
                        <button type="button" class="btn btn-secondary btn-xs" data-action="move-up-group" title="親グループを上へ移動" ${isFirstGroup ? 'disabled' : ''}>↑</button>
                        <button type="button" class="btn btn-secondary btn-xs" data-action="move-down-group" title="親グループを下へ移動" ${isLastGroup ? 'disabled' : ''}>↓</button>
                        <button type="button" class="btn btn-danger btn-xs" data-action="delete-group" title="親グループを削除">グループ削除</button>
                    </div>
                </div>

                <div class="wbs-group-body">
                    ${tasksHtml}

                    <div class="add-task-form">
                        <div class="add-task-inputs">
                            <input type="text" class="form-control input-sm add-task-name" placeholder="＋ 作業を追加 (例: 機械設計)" data-enter="add-task" data-group-index="${gIdx}">
                            <input type="text" class="form-control input-sm text-center add-task-pred" placeholder="先行 (例: A)" data-group-index="${gIdx}">
                            <input type="text" class="form-control input-sm text-center add-task-dur" placeholder="時間" data-group-index="${gIdx}">
                        </div>
                        <button type="button" class="btn btn-primary btn-inline" data-action="add-task" data-group-index="${gIdx}">作業を追加</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/** エディタの再描画 */
function renderEditor(): void {
    const container = document.getElementById('wbs-groups-container');
    if (container) {
        container.innerHTML = renderGroups();
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

/** 親グループを追加 */
function addGroup(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;

    wbsData.groups.push({
        id: createId('grp'),
        name: trimmed,
        predecessors: '-',
        duration: '1',
        tasks: [],
    });

    persist();
    renderEditor();
}

/** グループ内に子作業を追加 */
function addTask(gIdx: number, name: string, predecessors: string, duration: string): void {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (gIdx < 0 || gIdx >= wbsData.groups.length) return;

    const group = wbsData.groups[gIdx];
    group.tasks.push({
        id: createId('tsk'),
        name: trimmedName,
        predecessors: predecessors.trim() || '-',
        duration: duration.trim() || '1',
    });

    persist();
    renderEditor();
}

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

    // 新規親グループ追加フォーム
    const newGroupInput = document.getElementById('new-group-input') as HTMLInputElement | null;
    const addGroupBtn = document.getElementById('add-group-btn');

    const handleAddGroup = () => {
        if (!newGroupInput) return;
        const name = newGroupInput.value;
        if (name.trim()) {
            addGroup(name);
            newGroupInput.value = '';
            newGroupInput.focus();
        }
    };

    if (addGroupBtn) {
        addGroupBtn.addEventListener('click', handleAddGroup);
    }
    if (newGroupInput) {
        newGroupInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAddGroup();
            }
        });
    }

    // グループコンテナ内イベント（イベント委任）
    const container = document.getElementById('wbs-groups-container');
    if (container) {
        // 文字入力イベント（タイピングフォーカスを保持）
        container.addEventListener('input', (event) => {
            const target = event.target as HTMLInputElement;
            if (!target || !target.dataset.field) return;

            const field = target.dataset.field;
            const groupBlock = target.closest<HTMLElement>('.wbs-group-block');
            if (!groupBlock) return;
            const gIdx = Number(groupBlock.dataset.groupIndex);
            if (gIdx < 0 || gIdx >= wbsData.groups.length) return;

            const group = wbsData.groups[gIdx];

            if (field === 'group-name') {
                group.name = target.value;
            } else if (field === 'group-predecessors') {
                group.predecessors = target.value;
            } else if (field === 'group-duration') {
                group.duration = target.value;
            } else {
                const taskRow = target.closest<HTMLElement>('.wbs-task-row');
                if (!taskRow) return;
                const tIdx = Number(taskRow.dataset.taskIndex);
                if (tIdx < 0 || tIdx >= group.tasks.length) return;

                const task = group.tasks[tIdx];
                if (field === 'task-name') {
                    task.name = target.value;
                } else if (field === 'task-predecessors') {
                    task.predecessors = target.value;
                } else if (field === 'task-duration') {
                    task.duration = target.value;
                }
            }

            persist();
            updatePreview();
        });

        // ボタンクリックイベント
        container.addEventListener('click', (event) => {
            const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const groupBlock = btn.closest<HTMLElement>('.wbs-group-block');
            if (!groupBlock) return;
            const gIdx = Number(groupBlock.dataset.groupIndex);
            if (gIdx < 0 || gIdx >= wbsData.groups.length) return;

            // グループ操作
            if (action === 'delete-group') {
                const groupName = wbsData.groups[gIdx].name || `${gIdx + 1}.`;
                if (confirm(`親グループ「${groupName}」を削除しますか？配下の作業もすべて削除されます。`)) {
                    wbsData.groups.splice(gIdx, 1);
                    persist();
                    renderEditor();
                }
                return;
            }

            if (action === 'move-up-group' && gIdx > 0) {
                const temp = wbsData.groups[gIdx];
                wbsData.groups[gIdx] = wbsData.groups[gIdx - 1];
                wbsData.groups[gIdx - 1] = temp;
                persist();
                renderEditor();
                return;
            }

            if (action === 'move-down-group' && gIdx < wbsData.groups.length - 1) {
                const temp = wbsData.groups[gIdx];
                wbsData.groups[gIdx] = wbsData.groups[gIdx + 1];
                wbsData.groups[gIdx + 1] = temp;
                persist();
                renderEditor();
                return;
            }

            // 作業追加
            if (action === 'add-task') {
                const form = btn.closest('.add-task-form');
                if (!form) return;
                const nameInput = form.querySelector('.add-task-name') as HTMLInputElement | null;
                const predInput = form.querySelector('.add-task-pred') as HTMLInputElement | null;
                const durInput = form.querySelector('.add-task-dur') as HTMLInputElement | null;

                if (nameInput && nameInput.value.trim()) {
                    addTask(
                        gIdx,
                        nameInput.value,
                        predInput ? predInput.value : '',
                        durInput ? durInput.value : ''
                    );
                }
                return;
            }

            // 作業の行操作
            const taskRow = btn.closest<HTMLElement>('.wbs-task-row');
            if (!taskRow) return;
            const tIdx = Number(taskRow.dataset.taskIndex);
            const tasks = wbsData.groups[gIdx].tasks;
            if (tIdx < 0 || tIdx >= tasks.length) return;

            if (action === 'delete-task') {
                tasks.splice(tIdx, 1);
                persist();
                renderEditor();
            } else if (action === 'move-up-task' && tIdx > 0) {
                const temp = tasks[tIdx];
                tasks[tIdx] = tasks[tIdx - 1];
                tasks[tIdx - 1] = temp;
                persist();
                renderEditor();
            } else if (action === 'move-down-task' && tIdx < tasks.length - 1) {
                const temp = tasks[tIdx];
                tasks[tIdx] = tasks[tIdx + 1];
                tasks[tIdx + 1] = temp;
                persist();
                renderEditor();
            }
        });

        // 作業追加欄での Enter キー
        container.addEventListener('keydown', (event) => {
            const target = event.target as HTMLInputElement;
            if (event.key === 'Enter' && target && target.dataset.enter === 'add-task') {
                event.preventDefault();
                const form = target.closest('.add-task-form');
                if (!form) return;
                const addBtn = form.querySelector('button[data-action="add-task"]') as HTMLButtonElement | null;
                if (addBtn) addBtn.click();
            }
        });
    }

    // 「サンプル読込」ボタン
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
            if (confirm('作業一覧表を初期化しますか？ すべての親グループと作業が消去されます。')) {
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

    // 初回描画
    renderEditor();
}
