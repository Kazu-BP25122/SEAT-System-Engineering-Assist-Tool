// AHP 一対比較・重要度計算 入力画面のロジック

import { escapeHtml } from '../utils';
import { STORAGE_KEY as AHP_STORAGE_KEY, leafCriteria, loadAhpData } from '../ahp/data';
import { analyzeMatrix, autoAdjustMatrix, findInconsistentCells, matrixFromRanking } from './calc';
import type { InconsistentCell } from './calc';
import {
    MAX_MEMBERS,
    SCALE_MEANINGS,
    SCALE_VALUES,
    addMatrixItem,
    createEmptyData,
    createMember,
    defaultMemberName,
    effectiveMatrices,
    formatScale,
    hasSavedAhpCalcData,
    isGroup,
    loadAhpCalcData,
    removeMatrixItem,
    replaceItems,
    saveAhpCalcData,
    scaleIndex,
    setComparison,
    uniformMatrix,
} from './data';
import type { AhpCalcData, Member } from './data';
import { ciBadgeHtml, mountReport } from './report';
import { mountSensitivity } from './sensitivity';

const OUTPUT_PAGE = '/tools/ahpCalc/output';

/** 評価基準の一対比較行列を表す data-matrix の値（代替案の行列は評価基準の番号） */
const CRITERIA_MATRIX = -1;
/** グループ統合の結果を表示するときの activeMember の値 */
const GROUP_VIEW = -1;

type ItemKind = 'criteria' | 'alternatives';

const ITEM_LABELS: Record<ItemKind, string> = { criteria: '評価基準', alternatives: '代替案' };

let calcData: AhpCalcData = createEmptyData();
/** 入力中のメンバーの番号（GROUP_VIEW のときは統合した行列を表示） */
let activeMember = 0;
/** 代替案の一対比較で表示している評価基準の番号 */
let activeCriterion = 0;
let renderReport: (data: AhpCalcData) => void = () => {};
let renderSensitivity: (data: AhpCalcData) => void = () => {};

/** 順位固定アシストで選べる「1 位と最下位の差」 */
const RANK_RATIOS: [number, string][] = [[3, '3（やや重要）'], [5, '5（かなり重要）'], [7, '7（非常に重要）'], [9, '9（極めて重要）']];
const DEFAULT_RANK_RATIO = 5;

/**
 * 順位固定アシストの並び順・差・開閉状態（保存しない画面上の状態）。
 * キーは「メンバー番号:行列の番号」
 */
const rankOrders = new Map<string, number[]>();
const rankRatios = new Map<string, number>();
const openRankPanels = new Set<string>();
/** ドラッグ中の項目の位置 */
let draggingRank: { key: string; pos: number } | null = null;
let toastTimer = 0;

// ---------- データ操作 ----------

function setStatus(message: string): void {
    const statusEl = document.getElementById('data-status');
    if (statusEl) statusEl.innerText = message;
}

function persist(): void {
    saveAhpCalcData(calcData);
    setStatus(`変更をローカルに保存しました (${new Date().toLocaleTimeString()})`);
}

function updateResults(): void {
    renderReport(calcData);
    renderSensitivity(calcData);
}

/** 保存して画面全体を再描画する */
function commit(): void {
    persist();
    renderAll();
}

/** 表示中の一対比較行列（統合の表示中は全員の幾何平均） */
function viewMatrices(): Pick<Member, 'criteriaMatrix' | 'alternativeMatrices'> {
    if (activeMember === GROUP_VIEW) return effectiveMatrices(calcData);
    return calcData.members[activeMember];
}

/** 入力中のメンバーの一対比較行列（統合の表示中は編集できないので undefined） */
function editableMatrix(matrixId: number): number[][] | undefined {
    const member = calcData.members[activeMember];
    return matrixId === CRITERIA_MATRIX ? member?.criteriaMatrix : member?.alternativeMatrices[matrixId];
}

function setEditableMatrix(member: Member, matrixId: number, matrix: number[][]): void {
    if (matrixId === CRITERIA_MATRIX) member.criteriaMatrix = matrix;
    else member.alternativeMatrices[matrixId] = matrix;
}

/** 行列の項目名（評価基準の行列なら評価基準、代替案の行列なら代替案） */
function matrixItemNames(matrixId: number): string[] {
    return matrixId === CRITERIA_MATRIX ? calcData.criteria : calcData.alternatives;
}

function renderMatrixOf(matrixId: number): void {
    if (matrixId === CRITERIA_MATRIX) renderCriteriaMatrix();
    else renderAlternativeMatrices();
}

/** 画面下に通知を出す。undo を渡すと「元に戻す」ボタンを付ける */
function showToast(message: string, undo?: () => void): void {
    let toast = document.getElementById('ahp-calc-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ahp-calc-toast';
        toast.className = 'ahp-toast';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
    }
    const el = toast;
    el.innerHTML = `<span>${escapeHtml(message)}</span>${undo ? '<button type="button" class="ahp-toast-undo">元に戻す</button>' : ''}`;
    el.querySelector('button')?.addEventListener('click', () => {
        undo?.();
        el.classList.remove('is-visible');
    });
    el.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('is-visible'), 8000);
}

/**
 * 入力中のメンバーの行列を置き換えて保存し、「元に戻す」付きの通知を出す。
 * 元に戻すのは、その後に項目の数が変わっていないときだけ
 */
function replaceMatrixWithUndo(matrixId: number, next: number[][], message: string): void {
    const member = calcData.members[activeMember];
    const previous = editableMatrix(matrixId);
    if (!member || !previous) return;
    const backup = structuredClone(previous);
    setEditableMatrix(member, matrixId, next);
    commit();
    setStatus(message);
    showToast(message, () => {
        const current = matrixId === CRITERIA_MATRIX ? member.criteriaMatrix : member.alternativeMatrices[matrixId];
        if (!current || current.length !== backup.length) return;
        setEditableMatrix(member, matrixId, backup);
        commit();
        setStatus('変更を元に戻しました');
    });
}

// ---------- 描画 ----------

function renderItems(kind: ItemKind): void {
    const root = document.getElementById(`${kind}-root`);
    if (!root) return;

    const names = calcData[kind];
    if (names.length === 0) {
        root.innerHTML = `<p class="ahp-calc-empty">(${ITEM_LABELS[kind]}なし)</p>`;
        return;
    }
    root.innerHTML = `<ol class="ahp-calc-items">${names.map((name, idx) => `
        <li>
            <input type="text" class="input-flex" value="${escapeHtml(name)}" data-rename="${kind}" data-idx="${idx}"
                aria-label="${ITEM_LABELS[kind]} ${idx + 1} の名前">
            <button type="button" class="btn btn-danger" data-action="delete-item" data-kind="${kind}" data-idx="${idx}">×</button>
        </li>
    `).join('')}</ol>`;
}

function renderMembers(): void {
    const root = document.getElementById('members-root');
    if (root) {
        const single = calcData.members.length === 1;
        root.innerHTML = `<ol class="ahp-calc-items">${calcData.members.map((member, idx) => `
            <li>
                <input type="text" class="input-flex" value="${escapeHtml(member.name)}" data-rename="member" data-idx="${idx}"
                    aria-label="メンバー ${idx + 1} の名前">
                <button type="button" class="btn btn-danger" data-action="delete-member" data-idx="${idx}"${single ? ' disabled' : ''}>×</button>
            </li>
        `).join('')}</ol>`;
    }
    const addButton = document.getElementById('add-member-btn') as HTMLButtonElement | null;
    if (addButton) addButton.disabled = calcData.members.length >= MAX_MEMBERS;
}

/** 入力するメンバーを選ぶタブ（2 人以上のとき）。最後に「グループ統合」のタブを置く */
function memberTabsHtml(): string {
    if (!isGroup(calcData)) return '';
    const tabs = calcData.members.map((member, idx) => {
        const active = idx === activeMember;
        return `<button type="button" role="tab" aria-selected="${active}" data-member-tab="${idx}"
            class="ahp-calc-tab${active ? ' is-active' : ''}">${escapeHtml(member.name)}</button>`;
    });
    const groupActive = activeMember === GROUP_VIEW;
    tabs.push(`<button type="button" role="tab" aria-selected="${groupActive}" data-member-tab="${GROUP_VIEW}"
        class="ahp-calc-tab ahp-calc-tab-group${groupActive ? ' is-active' : ''}">グループ統合</button>`);
    const note = groupActive
        ? '全員の値の幾何平均で統合した一対比較表です（編集はできません）。計算結果はこの表で求めています。'
        : `「${escapeHtml(calcData.members[activeMember].name)}」の回答を入力しています。`;
    return `
        <div class="ahp-calc-tabs ahp-calc-member-tabs" role="tablist" aria-label="入力するメンバー">${tabs.join('')}</div>
        <p class="ahp-calc-hint">${note}</p>
    `;
}

function scaleOptions(value: number): string {
    const selected = scaleIndex(value);
    return SCALE_VALUES.map((v, idx) =>
        `<option value="${idx}"${idx === selected ? ' selected' : ''}>${formatScale(v)}</option>`).join('');
}

/** 矛盾の候補のセルに付けるヒント（ホバーで表示） */
function suspectTitle(cell: InconsistentCell): string {
    return `矛盾の原因の候補です。推奨値: 約 ${formatScale(cell.suggested)}（ウエイトから求めた理論値 ${cell.ideal.toFixed(2)}）`;
}

/** 矛盾の候補の一覧。タッチ操作ではホバーできないので、セルのヒントと同じ内容を一覧でも示す */
function suspectListHtml(names: string[], cells: InconsistentCell[], matrixId: number, readOnly: boolean): string {
    if (cells.length === 0) return '';
    const items = cells.map(cell => `
        <li>
            <span><strong>${escapeHtml(names[cell.i])}</strong> と <strong>${escapeHtml(names[cell.j])}</strong>：
                入力 ${formatScale(cell.actual)} → 推奨 約 ${formatScale(cell.suggested)}</span>
            ${readOnly ? '' : `<button type="button" class="btn btn-secondary" data-apply-suggestion="${matrixId}"
                data-i="${cell.i}" data-j="${cell.j}" data-value="${cell.suggested}">推奨値にする</button>`}
        </li>
    `).join('');
    return `
        <div class="ahp-suspects">
            <div class="ahp-suspects-title">矛盾していそうな比較（ウエイトから求めた理論値とのずれが大きい順）</div>
            <ul>${items}</ul>
        </div>
    `;
}

/** 順位固定アシストの状態のキー */
function rankKey(matrixId: number): string {
    return `${activeMember}:${matrixId}`;
}

/** 順位固定アシストの並び順。項目数が変わっていたら、今のウエイトの大きい順に並べ直す */
function rankOrder(matrixId: number, matrix: number[][]): number[] {
    const key = rankKey(matrixId);
    const saved = rankOrders.get(key);
    if (saved && saved.length === matrix.length) return saved;
    const { weights } = analyzeMatrix(matrix);
    const order = weights.map((_, idx) => idx).sort((a, b) => weights[b] - weights[a]);
    rankOrders.set(key, order);
    return order;
}

/** 順位固定アシスト：項目を重要な順に並べ替えて、矛盾の無い一対比較を初期値としてセットする */
function rankAssistHtml(names: string[], matrix: number[][], matrixId: number): string {
    const key = rankKey(matrixId);
    const order = rankOrder(matrixId, matrix);
    const ratio = rankRatios.get(key) ?? DEFAULT_RANK_RATIO;
    const last = order.length - 1;
    const items = order.map((item, pos) => `
        <li draggable="true" data-rank-key="${key}" data-rank-pos="${pos}">
            <span class="ahp-rank-handle" aria-hidden="true">⋮⋮</span>
            <span class="ahp-rank-no">${pos + 1} 位</span>
            <span class="ahp-rank-name">${escapeHtml(names[item])}</span>
            <button type="button" class="btn btn-secondary" data-rank-move="-1" data-rank-key="${key}" data-rank-pos="${pos}"
                aria-label="${escapeHtml(names[item])} を上へ"${pos === 0 ? ' disabled' : ''}>↑</button>
            <button type="button" class="btn btn-secondary" data-rank-move="1" data-rank-key="${key}" data-rank-pos="${pos}"
                aria-label="${escapeHtml(names[item])} を下へ"${pos === last ? ' disabled' : ''}>↓</button>
        </li>
    `).join('');
    const options = RANK_RATIOS.map(([value, label]) =>
        `<option value="${value}"${value === ratio ? ' selected' : ''}>${label}</option>`).join('');

    return `
        <details class="ahp-rank" data-rank-panel="${key}"${openRankPanels.has(key) ? ' open' : ''}>
            <summary>順位固定アシスト：順位から一対比較を自動でセットする</summary>
            <p class="ahp-calc-hint">ドラッグ（または ↑↓ ボタン）で重要な順に並べ替えて「この順位でセット」を押すと、
                順位が矛盾しない一対比較を初期値として入力します。そのあと個別に調整できます。</p>
            <ol class="ahp-rank-list">${items}</ol>
            <div class="ahp-rank-actions">
                <label>1 位と最下位の差
                    <select data-rank-ratio="${key}">${options}</select>
                </label>
                <button type="button" class="btn btn-primary" data-rank-apply="${matrixId}">この順位でセット</button>
            </div>
        </details>
    `;
}

/**
 * 一対比較の入力表。上三角だけを選択式にし、対角は 1、下三角は逆数を表示する。
 * readOnly のときは上三角も値だけを表示する（グループ統合の表示用）。
 * 整合性が無いときは矛盾の候補のセルを強調し、自動調整のボタンを出す
 */
function matrixInputHtml(names: string[], matrix: number[][], matrixId: number, readOnly: boolean): string {
    if (names.length < 2) {
        return '<p class="ahp-calc-empty">一対比較には 2 つ以上の項目が必要です。</p>';
    }
    const analysis = analyzeMatrix(matrix);
    const suspects = analysis.consistent ? [] : findInconsistentCells(matrix);
    const suspectAt = (i: number, j: number) => suspects.find(cell => cell.i === i && cell.j === j);

    const head = names.map(name => `<th scope="col" title="${escapeHtml(name)}">${escapeHtml(name)}</th>`).join('');
    const rows = names.map((rowName, i) => {
        const cells = names.map((colName, j) => {
            if (i === j) return '<td class="is-diagonal">1</td>';
            if (i > j) return `<td class="is-reciprocal">${formatScale(matrix[i][j])}</td>`;
            const suspect = suspectAt(i, j);
            const suspectAttrs = suspect ? ` class="is-suspect" title="${escapeHtml(suspectTitle(suspect))}"` : '';
            if (readOnly) {
                return `<td class="is-aggregated${suspect ? ' is-suspect' : ''}"${suspect ? ` title="${escapeHtml(suspectTitle(suspect))}"` : ''}>${formatScale(matrix[i][j])}</td>`;
            }
            return `
                <td${suspectAttrs}>
                    <select class="ahp-calc-select" data-matrix="${matrixId}" data-i="${i}" data-j="${j}"
                        aria-label="${escapeHtml(`${rowName} と ${colName} の比較${suspect ? '（矛盾の原因の候補）' : ''}`)}">${scaleOptions(matrix[i][j])}</select>
                </td>
            `;
        }).join('');
        return `<tr><th scope="row" title="${escapeHtml(rowName)}">${escapeHtml(rowName)}</th>${cells}</tr>`;
    }).join('');

    const adjustButton = !analysis.consistent && !readOnly
        ? `<button type="button" class="btn btn-primary ahp-adjust-btn" data-auto-adjust="${matrixId}">整合性を自動調整する</button>`
        : '';

    return `
        <div class="ahp-calc-matrix-scroll">
            <table class="ahp-calc-matrix">
                <thead><tr><th scope="col" class="ahp-calc-corner">行 ＼ 列</th>${head}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        ${ciBadgeHtml(analysis, adjustButton)}
        ${suspectListHtml(names, suspects, matrixId, readOnly)}
        ${readOnly ? '' : rankAssistHtml(names, matrix, matrixId)}
    `;
}

function renderCriteriaMatrix(): void {
    const root = document.getElementById('criteria-matrix-root');
    if (!root) return;
    root.innerHTML = memberTabsHtml()
        + matrixInputHtml(calcData.criteria, viewMatrices().criteriaMatrix, CRITERIA_MATRIX, activeMember === GROUP_VIEW);
}

function renderAlternativeMatrices(): void {
    const root = document.getElementById('alternative-matrix-root');
    if (!root) return;

    if (calcData.criteria.length === 0) {
        root.innerHTML = '<p class="ahp-calc-empty">評価基準を追加してください。</p>';
        return;
    }
    activeCriterion = Math.min(activeCriterion, calcData.criteria.length - 1);
    const matrices = viewMatrices().alternativeMatrices;

    const tabs = calcData.criteria.map((name, k) => {
        const active = k === activeCriterion;
        const ng = calcData.alternatives.length > 1 && !analyzeMatrix(matrices[k]).consistent;
        return `
            <button type="button" role="tab" aria-selected="${active}" data-tab="${k}"
                class="ahp-calc-tab${active ? ' is-active' : ''}${ng ? ' is-ng' : ''}">${escapeHtml(name)}</button>
        `;
    }).join('');

    const criterion = calcData.criteria[activeCriterion];
    root.innerHTML = `
        ${memberTabsHtml()}
        <div class="ahp-calc-tabs" role="tablist" aria-label="評価基準">${tabs}</div>
        <p class="ahp-calc-hint">評価基準「${escapeHtml(criterion)}」について、行の代替案が列の代替案よりどれだけ優れているか</p>
        ${matrixInputHtml(calcData.alternatives, matrices[activeCriterion], activeCriterion, activeMember === GROUP_VIEW)}
    `;
}

function renderMatrices(): void {
    renderCriteriaMatrix();
    renderAlternativeMatrices();
}

function renderScaleLegend(): void {
    const root = document.getElementById('scale-legend');
    if (!root) return;
    root.innerHTML = SCALE_MEANINGS.map(([value, meaning]) => `<dt>${escapeHtml(value)}</dt><dd>${escapeHtml(meaning)}</dd>`).join('');
}

function syncFormValues(): void {
    const goalInput = document.getElementById('goal-input') as HTMLInputElement | null;
    if (goalInput) goalInput.value = calcData.goal;
}

function renderAll(): void {
    // メンバーを減らしたときなどに、表示中のメンバーを範囲内に戻す
    if (activeMember === GROUP_VIEW ? !isGroup(calcData) : activeMember >= calcData.members.length) activeMember = 0;
    renderItems('criteria');
    renderItems('alternatives');
    renderMembers();
    renderMatrices();
    updateResults();
}

// ---------- 操作 ----------

function addItem(kind: ItemKind): void {
    const input = document.getElementById(`new-${kind}-input`) as HTMLInputElement | null;
    const name = input?.value.trim();
    if (!input || !name) return;
    if (calcData[kind].includes(name)) {
        alert(`既に存在する${ITEM_LABELS[kind]}です。`);
        return;
    }
    input.value = '';

    // 行列はメンバー全員の分を広げる
    if (kind === 'criteria') {
        calcData.criteria.push(name);
        calcData.members.forEach(member => {
            member.criteriaMatrix = addMatrixItem(member.criteriaMatrix);
            member.alternativeMatrices.push(uniformMatrix(calcData.alternatives.length));
        });
    } else {
        calcData.alternatives.push(name);
        calcData.members.forEach(member => {
            member.alternativeMatrices = member.alternativeMatrices.map(addMatrixItem);
        });
    }
    commit();
}

function deleteItem(kind: ItemKind, idx: number): void {
    const name = calcData[kind][idx];
    if (name === undefined || !confirm(`${ITEM_LABELS[kind]}「${name}」とその一対比較を削除しますか？`)) return;

    calcData[kind].splice(idx, 1);
    if (kind === 'criteria') {
        calcData.members.forEach(member => {
            member.criteriaMatrix = removeMatrixItem(member.criteriaMatrix, idx);
            member.alternativeMatrices.splice(idx, 1);
        });
        if (activeCriterion > idx) activeCriterion--;
        // 感度分析の対象も、削除した基準より後ろなら 1 つ詰める
        const sens = calcData.sensitivity;
        if (sens.criterion === idx) calcData.sensitivity = { ...sens, criterion: 0, cursor: null };
        else if (sens.criterion > idx) calcData.sensitivity = { ...sens, criterion: sens.criterion - 1 };
    } else {
        calcData.members.forEach(member => {
            member.alternativeMatrices = member.alternativeMatrices.map(m => removeMatrixItem(m, idx));
        });
    }
    commit();
}

function addMember(): void {
    if (calcData.members.length >= MAX_MEMBERS) return;
    const idx = calcData.members.length;
    calcData.members.push(createMember(defaultMemberName(idx), calcData.criteria.length, calcData.alternatives.length));
    activeMember = idx;
    commit();
    setStatus(`${defaultMemberName(idx)}を追加しました。一対比較の表で回答を入力してください`);
}

function deleteMember(idx: number): void {
    const member = calcData.members[idx];
    if (!member || calcData.members.length <= 1 || !confirm(`「${member.name}」の回答を削除しますか？`)) return;
    calcData.members.splice(idx, 1);
    if (activeMember > idx) activeMember--;
    commit();
}

/** 名前の変更は入力のたびに表と結果だけを更新する（入力欄の再描画でフォーカスを失わないように） */
function renameItem(kind: ItemKind | 'member', idx: number, name: string): void {
    if (kind === 'member') {
        if (calcData.members[idx]) calcData.members[idx].name = name;
    } else {
        calcData[kind][idx] = name;
    }
    persist();
    renderMatrices();
    updateResults();
}

/** 整合性の自動調整：ウエイトの比を標準スケールに丸め、C.I. ≦ 0.1 の行列に置き換える */
function autoAdjust(matrixId: number): void {
    const matrix = editableMatrix(matrixId);
    if (!matrix) return;
    const result = autoAdjustMatrix(matrix);
    const compressed = result.compression < 1 ? '9 倍を超える差は縮めています。' : '';
    replaceMatrixWithUndo(matrixId, result.matrix,
        `元の評価バランスを保ちつつ、C.I. ≦ 0.1 となるよう値を補正しました（${result.changed} か所を変更、`
        + `C.I. = ${result.analysis.ci.toFixed(3)}）。${compressed}`);
}

/** 矛盾の候補のセル 1 つだけを推奨値にする */
function applySuggestion(el: HTMLElement): void {
    const matrixId = Number(el.dataset.applySuggestion);
    const matrix = editableMatrix(matrixId);
    const value = Number(el.dataset.value);
    const i = Number(el.dataset.i);
    const j = Number(el.dataset.j);
    if (!matrix || !(value > 0)) return;

    const next = structuredClone(matrix);
    setComparison(next, i, j, value);
    const names = matrixItemNames(matrixId);
    replaceMatrixWithUndo(matrixId, next,
        `「${names[i]}」と「${names[j]}」の比較を ${formatScale(value)} に変更しました（C.I. = ${analyzeMatrix(next).ci.toFixed(3)}）`);
}

/** 順位固定アシストで、pos 番目の項目を to 番目へ移す */
function moveRank(key: string, pos: number, to: number): void {
    const order = rankOrders.get(key);
    if (!order || to < 0 || to >= order.length || pos === to) return;
    const [item] = order.splice(pos, 1);
    order.splice(to, 0, item);
    const matrixId = Number(key.split(':')[1]);
    renderMatrixOf(matrixId);
    // ボタンで動かしたときは、動かした項目のボタンにフォーカスを戻す
    document.querySelector<HTMLElement>(`[data-rank-key="${key}"][data-rank-pos="${to}"] [data-rank-move]:not([disabled])`)?.focus();
}

function applyRanking(matrixId: number): void {
    const matrix = editableMatrix(matrixId);
    if (!matrix) return;
    const key = rankKey(matrixId);
    const order = rankOrder(matrixId, matrix);
    const ratio = rankRatios.get(key) ?? DEFAULT_RANK_RATIO;
    const names = matrixItemNames(matrixId);
    const result = matrixFromRanking(order, ratio);
    replaceMatrixWithUndo(matrixId, result.matrix,
        `順位（${order.map(item => names[item]).join(' > ')}）から一対比較をセットしました（C.I. = ${result.analysis.ci.toFixed(3)}）`);
}

function changeComparison(select: HTMLSelectElement): void {
    const matrixId = Number(select.dataset.matrix);
    const i = Number(select.dataset.i);
    const j = Number(select.dataset.j);
    const matrix = editableMatrix(matrixId);
    const value = SCALE_VALUES[Number(select.value)];
    if (!matrix || value === undefined) return;

    setComparison(matrix, i, j, value);
    persist();
    if (matrixId === CRITERIA_MATRIX) renderCriteriaMatrix();
    else renderAlternativeMatrices();
    updateResults();

    // 再描画後、同じ選択欄にフォーカスを戻してキーボードで続けて入力できるようにする
    document.querySelector<HTMLSelectElement>(
        `select[data-matrix="${matrixId}"][data-i="${i}"][data-j="${j}"]`)?.focus();
}

/**
 * AHP階層図ツールのデータを取り込む。同じ名前の項目の比較値は引き継ぐ。
 * 4 層のときは代替案の直前の段（中基準）を評価基準にする
 */
function importFromAhp(askBeforeReplace: boolean): boolean {
    const ahp = loadAhpData();
    const criteria = leafCriteria(ahp);
    if (localStorage.getItem(AHP_STORAGE_KEY) === null || (criteria.length === 0 && ahp.alternatives.length === 0)) {
        return false;
    }
    const hasItems = calcData.criteria.length > 0 || calcData.alternatives.length > 0;
    if (askBeforeReplace && hasItems
        && !confirm('評価基準・代替案を AHP階層図のデータで置き換えますか？\n（同じ名前の項目どうしの比較値は引き継ぎます）')) {
        return true;
    }
    calcData = replaceItems(calcData, ahp.goal, criteria, ahp.alternatives);
    syncFormValues();
    commit();
    setStatus(ahp.levels === 4
        ? 'AHP階層図（4 層）の中基準を評価基準として読み込みました'
        : 'AHP階層図のデータを読み込みました');
    return true;
}

function onImportClick(): void {
    if (!importFromAhp(true)) {
        alert('AHP階層図のデータがありません。先に AHP階層図ツールで評価基準と代替案を入力してください。');
    }
}

function resetToDefault(): void {
    if (!confirm('入力内容をすべて消去しますか？')) return;
    calcData = createEmptyData();
    activeMember = 0;
    activeCriterion = 0;
    syncFormValues();
    commit();
}

function saveAndNavigate(): void {
    persist();
    window.location.href = OUTPUT_PAGE;
}

// ---------- イベント ----------

/** 名前の入力欄の変更を受け取る。空のまま確定したら仮の名前を付ける */
function bindRenameEvents(root: HTMLElement | null, kind: ItemKind | 'member'): void {
    const fallbackName = (idx: number) => (kind === 'member' ? defaultMemberName(idx) : `${ITEM_LABELS[kind]}${idx + 1}`);
    root?.addEventListener('input', e => {
        const el = e.target as HTMLInputElement;
        if (el.dataset.rename) renameItem(kind, Number(el.dataset.idx), el.value);
    });
    root?.addEventListener('change', e => {
        const el = e.target as HTMLInputElement;
        if (!el.dataset.rename || el.value.trim()) return;
        const idx = Number(el.dataset.idx);
        el.value = fallbackName(idx);
        renameItem(kind, idx, el.value);
    });
}

function bindItemEvents(kind: ItemKind): void {
    document.getElementById(`add-${kind}-btn`)?.addEventListener('click', () => addItem(kind));
    document.getElementById(`new-${kind}-input`)?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.isComposing) addItem(kind);
    });

    const root = document.getElementById(`${kind}-root`);
    root?.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action="delete-item"]');
        if (el) deleteItem(kind, Number(el.dataset.idx));
    });
    bindRenameEvents(root, kind);
}

/** 整合性のアシスト（自動調整・推奨値・順位固定アシスト）の操作 */
function bindAssistEvents(root: HTMLElement): void {
    root.addEventListener('click', e => {
        const target = e.target as HTMLElement;
        const adjust = target.closest<HTMLElement>('[data-auto-adjust]');
        if (adjust) autoAdjust(Number(adjust.dataset.autoAdjust));

        const suggestion = target.closest<HTMLElement>('[data-apply-suggestion]');
        if (suggestion) applySuggestion(suggestion);

        const move = target.closest<HTMLElement>('[data-rank-move]');
        if (move?.dataset.rankKey) {
            const pos = Number(move.dataset.rankPos);
            moveRank(move.dataset.rankKey, pos, pos + Number(move.dataset.rankMove));
        }

        const apply = target.closest<HTMLElement>('[data-rank-apply]');
        if (apply) applyRanking(Number(apply.dataset.rankApply));
    });

    // details の toggle は伝わらない（バブリングしない）ので、キャプチャで受け取って開閉を覚える
    root.addEventListener('toggle', e => {
        const panel = e.target as HTMLDetailsElement;
        const key = panel.dataset?.rankPanel;
        if (!key) return;
        if (panel.open) openRankPanels.add(key);
        else openRankPanels.delete(key);
    }, true);

    // 順位のドラッグ＆ドロップ（タッチ操作では ↑↓ ボタンを使う）
    const rankItem = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('li[data-rank-key]');
    root.addEventListener('dragstart', e => {
        const item = rankItem(e);
        if (!item?.dataset.rankKey) return;
        draggingRank = { key: item.dataset.rankKey, pos: Number(item.dataset.rankPos) };
        item.classList.add('is-dragging');
        e.dataTransfer?.setData('text/plain', item.dataset.rankPos ?? '');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    root.addEventListener('dragover', e => {
        const item = rankItem(e);
        if (!item || item.dataset.rankKey !== draggingRank?.key) return;
        e.preventDefault();
        root.querySelectorAll('.ahp-rank-list .is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
        item.classList.add('is-drop-target');
    });
    root.addEventListener('drop', e => {
        const item = rankItem(e);
        if (!item || !draggingRank || item.dataset.rankKey !== draggingRank.key) return;
        e.preventDefault();
        const { key, pos } = draggingRank;
        draggingRank = null;
        moveRank(key, pos, Number(item.dataset.rankPos));
    });
    root.addEventListener('dragend', () => {
        draggingRank = null;
        root.querySelectorAll('.ahp-rank-list .is-dragging, .ahp-rank-list .is-drop-target')
            .forEach(el => el.classList.remove('is-dragging', 'is-drop-target'));
    });
}

function bindEvents(): void {
    document.getElementById('reset-btn')?.addEventListener('click', resetToDefault);
    document.getElementById('save-navigate-btn')?.addEventListener('click', saveAndNavigate);
    document.getElementById('import-ahp-btn')?.addEventListener('click', onImportClick);

    document.getElementById('goal-input')?.addEventListener('input', e => {
        calcData.goal = (e.target as HTMLInputElement).value;
        persist();
        updateResults();
    });

    bindItemEvents('criteria');
    bindItemEvents('alternatives');

    document.getElementById('add-member-btn')?.addEventListener('click', addMember);
    const membersRoot = document.getElementById('members-root');
    membersRoot?.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action="delete-member"]');
        if (el) deleteMember(Number(el.dataset.idx));
    });
    bindRenameEvents(membersRoot, 'member');

    document.querySelectorAll<HTMLElement>('[data-matrix-root]').forEach(root => {
        root.addEventListener('change', e => {
            const el = e.target as HTMLElement;
            if (!(el instanceof HTMLSelectElement)) return;
            // 一対比較の選択欄（評価基準・代替案の両方の表）
            if (el.dataset.matrix) changeComparison(el);
            // 順位固定アシストの「1 位と最下位の差」
            if (el.dataset.rankRatio) rankRatios.set(el.dataset.rankRatio, Number(el.value));
        });
        bindAssistEvents(root);
        // メンバーと評価基準のタブ
        root.addEventListener('click', e => {
            const target = e.target as HTMLElement;
            const memberTab = target.closest<HTMLElement>('[data-member-tab]');
            if (memberTab) {
                activeMember = Number(memberTab.dataset.memberTab);
                renderMatrices();
                return;
            }
            const tab = target.closest<HTMLElement>('[data-tab]');
            if (tab) {
                activeCriterion = Number(tab.dataset.tab);
                renderAlternativeMatrices();
            }
        });
    });
}

export function initAhpCalcInput(): void {
    const reportRoot = document.getElementById('ahp-calc-report');
    if (reportRoot) renderReport = mountReport(reportRoot);
    const sensitivityRoot = document.getElementById('ahp-calc-sensitivity');
    if (sensitivityRoot) {
        renderSensitivity = mountSensitivity(sensitivityRoot, {
            // 感度分析の対象が変わると結果の表も変わるので、保存して結果を描き直す
            onChange: state => {
                calcData.sensitivity = state;
                persist();
                renderReport(calcData);
            },
        });
    }

    bindEvents();
    renderScaleLegend();

    calcData = loadAhpCalcData();
    // 初めて開いたときは AHP階層図ツールのデータがあれば読み込む
    if (!hasSavedAhpCalcData() && importFromAhp(false)) return;

    syncFormValues();
    renderAll();
}
