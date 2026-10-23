// AHP階層図 作成画面のロジック

import { escapeHtml } from '../utils';
import { loadNeedsData } from '../needsList/data';
import { DEFAULT_AHP_DATA, loadAhpData, saveAhpData } from './data';
import type { AhpData, CriterionGroup, HierarchyLevels } from './data';
import { mountDiagramPanel } from '../diagram/panel';
import type { DiagramContent } from '../diagram/panel';
import { ahpDiagramContent } from './diagram';

const OUTPUT_PAGE = '/tools/ahp/output';

/** 階層の数ごとの、評価基準の欄の表示 */
const CRITERIA_TEXT: Record<HierarchyLevels, { title: string; placeholder: string; label: string }> = {
    3: { title: '評価基準', placeholder: '例: 味, 提供の速さ, 利益', label: '評価基準' },
    4: { title: '大基準と中基準', placeholder: '例: 来場者, 運営スタッフ', label: '大基準' },
};

let ahpData: AhpData = structuredClone(DEFAULT_AHP_DATA);
let renderDiagram: (content: DiagramContent) => void = () => {};

// ---------- データ操作 ----------

function setStatus(message: string): void {
    const statusEl = document.getElementById('data-status');
    if (statusEl) statusEl.innerText = message;
}

function persist(): void {
    saveAhpData(ahpData);
    setStatus(`変更をローカルに保存しました (${new Date().toLocaleTimeString()})`);
}

function updateDiagram(): void {
    renderDiagram(ahpDiagramContent(ahpData));
}

/** 保存して画面全体を再描画する */
function commit(): void {
    persist();
    renderAll();
}

// ---------- 描画 ----------

/** 名前を直接書き換えられる入力欄 */
function nameInput(value: string, label: string, attrs: string): string {
    return `<input type="text" class="input-flex ahp-name-input" value="${escapeHtml(value)}" aria-label="${escapeHtml(label)}" ${attrs}>`;
}

function renderSubcriteria(group: CriterionGroup, c: number): string {
    const list = group.subcriteria.length === 0
        ? '<p class="empty-items">(中基準なし：この大基準がそのまま代替案につながります)</p>'
        : `<ul class="items-list">${group.subcriteria.map((sub, idx) => `
            <li>
                ${nameInput(sub, `${group.name} の中基準 ${idx + 1}`, `data-rename="sub" data-c="${c}" data-idx="${idx}"`)}
                <button class="btn btn-danger" data-action="delete-sub" data-c="${c}" data-idx="${idx}">×</button>
            </li>
        `).join('')}</ul>`;

    return `
        <div class="top-items-area">
            ${list}
            <div class="add-inline-form">
                <input type="text" class="input-flex" placeholder="＋ 中基準を追加" data-enter="add-sub" data-c="${c}">
                <button class="btn btn-secondary btn-inline" data-action="add-sub" data-c="${c}">追加</button>
            </div>
        </div>
    `;
}

function renderCriteria(): void {
    const text = CRITERIA_TEXT[ahpData.levels];
    const title = document.getElementById('criteria-title');
    if (title) title.textContent = text.title;
    const input = document.getElementById('new-criterion-input') as HTMLInputElement | null;
    if (input) input.placeholder = text.placeholder;

    const root = document.getElementById('criteria-root');
    if (!root) return;
    if (ahpData.criteria.length === 0) {
        root.innerHTML = `<p class="empty-tree">${text.label}が登録されていません。上のフォームから追加してください。</p>`;
        return;
    }

    root.innerHTML = ahpData.criteria.map((group, c) => {
        // 3 層のときも中基準は残しているので、その数だけ知らせる
        const hiddenSubs = ahpData.levels === 3 && group.subcriteria.length > 0
            ? `<span class="ahp-hidden-subs">中基準 ${group.subcriteria.length} 件（4 層で表示）</span>`
            : '';
        return `
            <div class="top-category-block">
                <div class="top-category-header">
                    ${nameInput(group.name, `${text.label} ${c + 1} の名前`, `data-rename="criterion" data-c="${c}"`)}
                    ${hiddenSubs}
                    <button class="btn btn-danger" data-action="delete-criterion" data-c="${c}">削除</button>
                </div>
                ${ahpData.levels === 4 ? renderSubcriteria(group, c) : ''}
            </div>
        `;
    }).join('');
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
            ${nameInput(alt, `代替案 ${idx + 1} の名前`, `data-rename="alternative" data-idx="${idx}"`)}
            <button class="btn btn-danger" data-action="delete-alternative" data-idx="${idx}">×</button>
        </li>
    `).join('')}</ul>`;
}

/** 入力欄の値をデータに合わせる（初期表示・初期化時） */
function syncFormValues(): void {
    const goalInput = document.getElementById('goal-input') as HTMLInputElement | null;
    if (goalInput) goalInput.value = ahpData.goal;

    document.querySelectorAll<HTMLInputElement>('input[name="hierarchy-levels"]').forEach(radio => {
        radio.checked = Number(radio.value) === ahpData.levels;
    });
}

function renderAll(): void {
    renderCriteria();
    renderAlternatives();
    updateDiagram();
}

// ---------- 操作 ----------

/** 入力欄の値を取り出して空にする。空文字なら null */
function takeInput(input: HTMLInputElement | null): string | null {
    const value = input?.value.trim() ?? '';
    if (!value || !input) return null;
    input.value = '';
    return value;
}

function addCriterion(): void {
    const input = document.getElementById('new-criterion-input') as HTMLInputElement | null;
    const name = input?.value.trim();
    if (!name) return;
    if (ahpData.criteria.some(c => c.name === name)) {
        alert(`既に存在する${CRITERIA_TEXT[ahpData.levels].label}です。`);
        return;
    }
    takeInput(input);
    ahpData.criteria.push({ name, subcriteria: [] });
    commit();
}

function deleteCriterion(c: number): void {
    const group = ahpData.criteria[c];
    const withSubs = group?.subcriteria.length ? 'とその中基準をすべて' : 'を';
    if (!group || !confirm(`「${group.name}」${withSubs}削除しますか？`)) return;
    ahpData.criteria.splice(c, 1);
    commit();
}

function addSubcriterion(c: number, input: HTMLInputElement | null): void {
    const group = ahpData.criteria[c];
    const text = takeInput(input);
    if (!group || !text) return;
    group.subcriteria.push(text);
    commit();

    // 再描画後、同じ入力欄にフォーカスを戻して連続入力できるようにする
    document.querySelector<HTMLInputElement>(`#criteria-root input[data-enter="add-sub"][data-c="${c}"]`)?.focus();
}

function deleteSubcriterion(c: number, idx: number): void {
    ahpData.criteria[c]?.subcriteria.splice(idx, 1);
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

/** 名前の入力欄の値をデータに反映する。空のまま確定したときは仮の名前を付ける */
function renameItem(el: HTMLInputElement, confirmed: boolean): void {
    const c = Number(el.dataset.c);
    const idx = Number(el.dataset.idx);
    let value = el.value;
    if (confirmed && !value.trim()) {
        const fallback = { criterion: `基準${c + 1}`, sub: `中基準${idx + 1}`, alternative: `代替案${idx + 1}` };
        value = fallback[el.dataset.rename as keyof typeof fallback] ?? '無題';
        el.value = value;
    }

    switch (el.dataset.rename) {
        case 'criterion':
            if (ahpData.criteria[c]) ahpData.criteria[c].name = value;
            break;
        case 'sub':
            if (ahpData.criteria[c]) ahpData.criteria[c].subcriteria[idx] = value;
            break;
        case 'alternative':
            ahpData.alternatives[idx] = value;
            break;
        default:
            return;
    }
    // 入力中は再描画せず図だけを更新する（入力欄のフォーカスを失わないように）
    persist();
    updateDiagram();
}

/** ニーズリスト作成ツールのデータを大基準（ステークホルダ）と中基準（ニーズ）として取り込む */
function importFromNeedsList(): void {
    const needsData = loadNeedsData({});
    const entries = Object.entries(needsData);
    if (entries.length === 0) {
        alert('ニーズリストのデータがありません。先にニーズリスト作成ツールで入力してください。');
        return;
    }
    if (ahpData.criteria.length > 0
        && !confirm('現在の評価基準をニーズリストのデータで置き換えますか？')) {
        return;
    }
    // サブカテゴリのニーズは親にまとめる
    ahpData.criteria = entries.map(([name, val]) => ({
        name,
        subcriteria: Array.isArray(val) ? [...val] : Object.values(val).flat(),
    }));
    commit();
    setStatus('ニーズリストのステークホルダを大基準、ニーズを中基準として読み込みました');
}

function resetToDefault(): void {
    if (!confirm('入力内容をすべて消去しますか？')) return;
    // 図の向きと階層の数は入力内容ではないので引き継ぐ
    ahpData = { ...structuredClone(DEFAULT_AHP_DATA), orientation: ahpData.orientation, levels: ahpData.levels };
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

function handleCriteriaAction(action: string, el: HTMLElement): void {
    const c = Number(el.dataset.c);
    switch (action) {
        case 'delete-criterion':
            deleteCriterion(c);
            break;
        case 'add-sub':
            addSubcriterion(c, siblingInput(el));
            break;
        case 'delete-sub':
            deleteSubcriterion(c, Number(el.dataset.idx));
            break;
    }
}

/** Enter キーで指定の処理を実行する */
function onEnter(id: string, handler: () => void): void {
    document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.isComposing) handler();
    });
}

/** 名前の入力欄（評価基準・代替案の両方）の変更を受け取る */
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
    document.getElementById('save-navigate-btn')?.addEventListener('click', saveAndNavigate);
    document.getElementById('import-needs-btn')?.addEventListener('click', importFromNeedsList);

    document.getElementById('add-criterion-btn')?.addEventListener('click', addCriterion);
    onEnter('new-criterion-input', addCriterion);
    document.getElementById('add-alternative-btn')?.addEventListener('click', addAlternative);
    onEnter('new-alternative-input', addAlternative);

    // 総合目的は入力のたびに図だけを更新する（入力欄の再描画でフォーカスを失わないように）
    document.getElementById('goal-input')?.addEventListener('input', e => {
        ahpData.goal = (e.target as HTMLInputElement).value;
        persist();
        updateDiagram();
    });

    document.querySelectorAll<HTMLInputElement>('input[name="hierarchy-levels"]').forEach(radio => {
        radio.addEventListener('change', () => {
            ahpData.levels = Number(radio.value) === 4 ? 4 : 3;
            commit();
        });
    });

    const criteriaRoot = document.getElementById('criteria-root');
    criteriaRoot?.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (el?.dataset.action) handleCriteriaAction(el.dataset.action, el);
    });
    criteriaRoot?.addEventListener('keydown', e => {
        const el = e.target as HTMLElement;
        if (e.key === 'Enter' && !e.isComposing && el.dataset.enter) handleCriteriaAction(el.dataset.enter, el);
    });
    bindRenameEvents(criteriaRoot);

    const alternativeRoot = document.getElementById('alternative-root');
    alternativeRoot?.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action="delete-alternative"]');
        if (el) deleteAlternative(Number(el.dataset.idx));
    });
    bindRenameEvents(alternativeRoot);
}

export function initAhpInput(): void {
    ahpData = loadAhpData();
    const diagramRoot = document.getElementById('ahp-preview');
    if (diagramRoot) {
        renderDiagram = mountDiagramPanel(diagramRoot, {
            filename: 'ahp_hierarchy',
            orientation: ahpData.orientation,
            onOrientationChange: orientation => {
                ahpData.orientation = orientation;
                persist();
            },
        });
    }

    bindEvents();
    syncFormValues();
    renderAll();
}
