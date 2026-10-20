// AHP階層図 作成画面のロジック

import { escapeHtml } from '../utils';
import { loadNeedsData } from '../needsList/data';
import { DEFAULT_AHP_DATA, loadAhpData, saveAhpData } from './data';
import type { AhpData, CriteriaMode, Stakeholder } from './data';
import { mountAhpDiagram } from './diagram';

const OUTPUT_PAGE = '/tools/ahp/output';

let ahpData: AhpData = structuredClone(DEFAULT_AHP_DATA);
let renderDiagram: (data: AhpData) => void = () => {};

// ---------- データ操作 ----------

function persist(): void {
    saveAhpData(ahpData);
    const statusEl = document.getElementById('data-status');
    if (statusEl) {
        statusEl.innerText = `変更をローカルに保存しました (${new Date().toLocaleTimeString()})`;
    }
}

/** 保存して画面全体を再描画する */
function commit(): void {
    persist();
    renderAll();
}

// ---------- 描画 ----------

function renderNeeds(sh: Stakeholder, shIdx: number): string {
    const list = sh.needs.length === 0
        ? '<p class="empty-items">(ニーズ項目なし)</p>'
        : `<ul class="items-list">${sh.needs.map((need, idx) => `
            <li>
                <span>・ ${escapeHtml(need)}</span>
                <button class="btn btn-danger" data-action="delete-need" data-sh="${shIdx}" data-idx="${idx}">×</button>
            </li>
        `).join('')}</ul>`;

    return `
        ${list}
        <div class="add-inline-form">
            <input type="text" class="input-flex" placeholder="＋ ニーズを追加" data-enter="add-need" data-sh="${shIdx}">
            <button class="btn btn-secondary btn-inline" data-action="add-need" data-sh="${shIdx}">追加</button>
        </div>
    `;
}

function renderStakeholders(): void {
    const root = document.getElementById('stakeholder-root');
    if (!root) return;

    if (ahpData.stakeholders.length === 0) {
        root.innerHTML = '<p class="empty-tree">ステークホルダが登録されていません。上のフォームから追加してください。</p>';
        return;
    }
    root.innerHTML = ahpData.stakeholders.map((sh, shIdx) => `
        <div class="top-category-block">
            <div class="top-category-header">
                <span>${escapeHtml(sh.name)}</span>
                <button class="btn btn-danger" data-action="delete-stakeholder" data-sh="${shIdx}">削除</button>
            </div>
            <div class="top-items-area">${renderNeeds(sh, shIdx)}</div>
        </div>
    `).join('');
}

function renderAlternatives(): void {
    const root = document.getElementById('alternative-root');
    if (!root) return;

    if (ahpData.alternatives.length === 0) {
        root.innerHTML = '<p class="empty-items">(代替案なし)</p>';
        return;
    }
    root.innerHTML = `<ul class="items-list">${ahpData.alternatives.map((alt, idx) => `
        <li>
            <span>・ ${escapeHtml(alt)}</span>
            <button class="btn btn-danger" data-action="delete-alternative" data-idx="${idx}">×</button>
        </li>
    `).join('')}</ul>`;
}

/** 入力欄の値をデータに合わせる（初期表示・初期化時） */
function syncFormValues(): void {
    const goalInput = document.getElementById('goal-input') as HTMLInputElement | null;
    if (goalInput) goalInput.value = ahpData.goal;

    document.querySelectorAll<HTMLInputElement>('input[name="criteria-mode"]').forEach(radio => {
        radio.checked = radio.value === ahpData.criteriaMode;
    });
}

function renderAll(): void {
    renderStakeholders();
    renderAlternatives();
    renderDiagram(ahpData);
}

// ---------- 操作 ----------

/** 入力欄の値を取り出して空にする。空文字なら null */
function takeInput(input: HTMLInputElement | null): string | null {
    const value = input?.value.trim() ?? '';
    if (!value || !input) return null;
    input.value = '';
    return value;
}

function addStakeholder(): void {
    const input = document.getElementById('new-stakeholder-input') as HTMLInputElement | null;
    const name = input?.value.trim();
    if (!name) return;
    if (ahpData.stakeholders.some(sh => sh.name === name)) {
        alert('既に存在するステークホルダ名です。');
        return;
    }
    takeInput(input);
    ahpData.stakeholders.push({ name, needs: [] });
    commit();
}

function deleteStakeholder(shIdx: number): void {
    const sh = ahpData.stakeholders[shIdx];
    if (!sh || !confirm(`「${sh.name}」とそのニーズをすべて削除しますか？`)) return;
    ahpData.stakeholders.splice(shIdx, 1);
    commit();
}

function addNeed(shIdx: number, input: HTMLInputElement | null): void {
    const sh = ahpData.stakeholders[shIdx];
    const text = takeInput(input);
    if (!sh || !text) return;
    sh.needs.push(text);
    commit();

    // 再描画後、同じ入力欄にフォーカスを戻して連続入力できるようにする
    document.querySelector<HTMLInputElement>(`#stakeholder-root input[data-sh="${shIdx}"]`)?.focus();
}

function deleteNeed(shIdx: number, idx: number): void {
    ahpData.stakeholders[shIdx]?.needs.splice(idx, 1);
    commit();
}

function addAlternative(): void {
    const text = takeInput(document.getElementById('new-alternative-input') as HTMLInputElement | null);
    if (!text) return;
    ahpData.alternatives.push(text);
    commit();
}

function deleteAlternative(idx: number): void {
    ahpData.alternatives.splice(idx, 1);
    commit();
}

/** ニーズリスト作成ツールのデータをステークホルダとして取り込む（サブカテゴリのニーズは親にまとめる） */
function importFromNeedsList(): void {
    const needsData = loadNeedsData({});
    const entries = Object.entries(needsData);
    if (entries.length === 0) {
        alert('ニーズリストのデータがありません。先にニーズリスト作成ツールで入力してください。');
        return;
    }
    if (ahpData.stakeholders.length > 0
        && !confirm('現在のステークホルダとニーズをニーズリストのデータで置き換えますか？')) {
        return;
    }
    ahpData.stakeholders = entries.map(([name, val]) => ({
        name,
        needs: Array.isArray(val) ? [...val] : Object.values(val).flat(),
    }));
    commit();
}

function resetToDefault(): void {
    if (!confirm('入力内容をすべて消去しますか？')) return;
    ahpData = structuredClone(DEFAULT_AHP_DATA);
    syncFormValues();
    commit();
}

function saveAndNavigate(): void {
    persist();
    window.location.href = OUTPUT_PAGE;
}

// ---------- イベント ----------

/** ボタンと同じフォーム内の入力欄を取得する */
function siblingInput(el: HTMLElement): HTMLInputElement | null {
    if (el instanceof HTMLInputElement) return el;
    return el.closest('.add-inline-form')?.querySelector('input') ?? null;
}

function handleStakeholderAction(action: string, el: HTMLElement): void {
    const shIdx = Number(el.dataset.sh);
    switch (action) {
        case 'delete-stakeholder':
            deleteStakeholder(shIdx);
            break;
        case 'add-need':
            addNeed(shIdx, siblingInput(el));
            break;
        case 'delete-need':
            deleteNeed(shIdx, Number(el.dataset.idx));
            break;
    }
}

/** Enter キーで指定の処理を実行する */
function onEnter(id: string, handler: () => void): void {
    document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.isComposing) handler();
    });
}

function bindEvents(): void {
    document.getElementById('reset-btn')?.addEventListener('click', resetToDefault);
    document.getElementById('save-navigate-btn')?.addEventListener('click', saveAndNavigate);
    document.getElementById('import-needs-btn')?.addEventListener('click', importFromNeedsList);

    document.getElementById('add-stakeholder-btn')?.addEventListener('click', addStakeholder);
    onEnter('new-stakeholder-input', addStakeholder);
    document.getElementById('add-alternative-btn')?.addEventListener('click', addAlternative);
    onEnter('new-alternative-input', addAlternative);

    // 総合目的は入力のたびに図だけを更新する（入力欄の再描画でフォーカスを失わないように）
    document.getElementById('goal-input')?.addEventListener('input', e => {
        ahpData.goal = (e.target as HTMLInputElement).value;
        persist();
        renderDiagram(ahpData);
    });

    document.querySelectorAll<HTMLInputElement>('input[name="criteria-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            ahpData.criteriaMode = radio.value as CriteriaMode;
            persist();
            renderDiagram(ahpData);
        });
    });

    const shRoot = document.getElementById('stakeholder-root');
    shRoot?.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (el?.dataset.action) handleStakeholderAction(el.dataset.action, el);
    });
    shRoot?.addEventListener('keydown', e => {
        const el = e.target as HTMLElement;
        if (e.key === 'Enter' && !e.isComposing && el.dataset.enter) handleStakeholderAction(el.dataset.enter, el);
    });

    document.getElementById('alternative-root')?.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action="delete-alternative"]');
        if (el) deleteAlternative(Number(el.dataset.idx));
    });
}

export function initAhpInput(): void {
    ahpData = loadAhpData();
    const diagramRoot = document.getElementById('ahp-preview');
    if (diagramRoot) renderDiagram = mountAhpDiagram(diagramRoot);

    bindEvents();
    syncFormValues();
    renderAll();
}
