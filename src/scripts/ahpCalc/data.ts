// AHP 一対比較・重要度計算の入力・出力ページで共有するデータ定義

import { SCALE_VALUES, aggregateMatrices, analyzeAhp, analyzeSensitivity } from './calc';
import type { AhpAnalysis, SensitivityAnalysis } from './calc';

/** 一対比較に回答するメンバー（1 人なら個人の意思決定、2 人以上ならグループ意思決定） */
export interface Member {
    name: string;
    /** 評価基準同士の一対比較行列（n × n）。[i][j] は「i が j に比べてどれだけ重要か」 */
    criteriaMatrix: number[][];
    /** 評価基準ごとの代替案同士の一対比較行列（m × m が n 個） */
    alternativeMatrices: number[][][];
}

/** 感度分析の表示状態 */
export interface SensitivityState {
    /** ウエイトを動かす評価基準の番号 */
    criterion: number;
    /** グラフ上で値を読み取るウエイト（null のときは現在のウエイト） */
    cursor: number | null;
    /** 縦軸を 0 〜 1 ではなく結果の範囲に合わせて拡大する */
    fitY: boolean;
}

export interface AhpCalcData {
    goal: string;
    criteria: string[];
    alternatives: string[];
    /** 1 人以上 */
    members: Member[];
    sensitivity: SensitivityState;
}

export const STORAGE_KEY = 'seat_ahp_calc_data';

/** メンバーの人数の上限 */
export const MAX_MEMBERS = 10;

/** 一対比較で選べる値（9 〜 1 〜 1/9）。計算でも使うので calc.ts で定義している */
export { SCALE_VALUES };

/** 一対比較の値の意味（凡例用） */
export const SCALE_MEANINGS: [string, string][] = [
    ['1', '同じくらい重要'],
    ['3', 'やや重要'],
    ['5', 'かなり重要'],
    ['7', '非常に重要'],
    ['9', '極めて重要'],
    ['2, 4, 6, 8', '中間の値'],
    ['1/3 など', '逆に、列の項目のほうが重要'],
];

export function defaultMemberName(idx: number): string {
    return `メンバー${idx + 1}`;
}

/** 評価基準 n 個・代替案 m 個の、比較がすべて 1 のメンバー */
export function createMember(name: string, n: number, m: number): Member {
    return {
        name,
        criteriaMatrix: uniformMatrix(n),
        alternativeMatrices: Array.from({ length: n }, () => uniformMatrix(m)),
    };
}

export function createEmptyData(): AhpCalcData {
    return {
        goal: '',
        criteria: [],
        alternatives: [],
        members: [createMember(defaultMemberName(0), 0, 0)],
        sensitivity: { criterion: 0, cursor: null, fitY: false },
    };
}

export function isGroup(data: AhpCalcData): boolean {
    return data.members.length > 1;
}

// ---------- 一対比較行列の操作 ----------

/** SCALE_VALUES の中で最も近い値の位置（比で比べるので対数で距離をとる） */
export function scaleIndex(value: number): number {
    let best = SCALE_VALUES.indexOf(1);
    SCALE_VALUES.forEach((v, idx) => {
        if (Math.abs(Math.log(v / value)) < Math.abs(Math.log(SCALE_VALUES[best] / value))) best = idx;
    });
    return best;
}

/** 一対比較の値を「3」「1/3」の形で表す（尺度に無い値は小数で表す） */
export function formatScale(value: number): string {
    if (value >= 1) {
        return Math.abs(value - Math.round(value)) < 1e-6 ? String(Math.round(value)) : value.toFixed(3);
    }
    const inverse = 1 / value;
    return Math.abs(inverse - Math.round(inverse)) < 1e-6 ? `1/${Math.round(inverse)}` : value.toFixed(3);
}

/** すべての比較が 1（同じくらい）の行列 */
export function uniformMatrix(size: number): number[][] {
    return Array.from({ length: size }, () => Array<number>(size).fill(1));
}

/** [i][j] に値を入れ、[j][i] を逆数にする */
export function setComparison(matrix: number[][], i: number, j: number, value: number): void {
    matrix[i][j] = value;
    matrix[j][i] = 1 / value;
}

/** 末尾に項目を 1 つ追加した行列（新しい比較はすべて 1） */
export function addMatrixItem(matrix: number[][]): number[][] {
    return [...matrix.map(row => [...row, 1]), Array(matrix.length + 1).fill(1)];
}

/** idx 番目の項目を取り除いた行列 */
export function removeMatrixItem(matrix: number[][], idx: number): number[][] {
    return matrix.filter((_, i) => i !== idx).map(row => row.filter((_, j) => j !== idx));
}

/** 項目の並びが変わったときに、同じ名前どうしの比較値を引き継いだ行列を作る */
function remapMatrix(matrix: number[][] | undefined, oldNames: string[], newNames: string[]): number[][] {
    const result = uniformMatrix(newNames.length);
    if (!matrix) return result;
    newNames.forEach((a, i) => {
        newNames.forEach((b, j) => {
            if (i >= j) return;
            const oi = oldNames.indexOf(a);
            const oj = oldNames.indexOf(b);
            if (oi >= 0 && oj >= 0 && oi !== oj) setComparison(result, i, j, matrix[oi][oj]);
        });
    });
    return result;
}

/** 評価基準・代替案を置き換える。名前が同じ項目の比較値は（メンバーごとに）引き継ぐ */
export function replaceItems(data: AhpCalcData, goal: string, criteria: string[], alternatives: string[]): AhpCalcData {
    return {
        ...data,
        goal,
        criteria: [...criteria],
        alternatives: [...alternatives],
        members: data.members.map(member => ({
            name: member.name,
            criteriaMatrix: remapMatrix(member.criteriaMatrix, data.criteria, criteria),
            alternativeMatrices: criteria.map(name => {
                const oldIdx = data.criteria.indexOf(name);
                return remapMatrix(oldIdx >= 0 ? member.alternativeMatrices[oldIdx] : undefined, data.alternatives, alternatives);
            }),
        })),
        sensitivity: { ...data.sensitivity, criterion: 0, cursor: null },
    };
}

// ---------- 計算 ----------

/** 計算に使う一対比較行列（1 人ならその人の行列、グループなら全員の幾何平均で統合した行列） */
export function effectiveMatrices(data: AhpCalcData): Pick<Member, 'criteriaMatrix' | 'alternativeMatrices'> {
    if (!isGroup(data)) return data.members[0];
    return {
        criteriaMatrix: aggregateMatrices(data.members.map(m => m.criteriaMatrix)),
        alternativeMatrices: data.criteria.map((_, i) => aggregateMatrices(data.members.map(m => m.alternativeMatrices[i]))),
    };
}

export function analyzeCalcData(data: AhpCalcData): AhpAnalysis {
    const { criteriaMatrix, alternativeMatrices } = effectiveMatrices(data);
    return analyzeAhp(criteriaMatrix, alternativeMatrices, data.alternatives.length);
}

/** 感度分析の結果。評価基準が 2 つ未満、または代替案が無いときは null */
export function analyzeCalcSensitivity(data: AhpCalcData, analysis: AhpAnalysis = analyzeCalcData(data)): SensitivityAnalysis | null {
    if (data.criteria.length < 2 || data.alternatives.length === 0) return null;
    const target = Math.min(data.sensitivity.criterion, data.criteria.length - 1);
    return analyzeSensitivity(analysis.criteria.weights, analysis.alternatives.map(a => a.weights), data.alternatives.length, target);
}

// ---------- 読み込み・保存 ----------

/** 上三角成分（行ごとに左から）から行列を作る。サンプルデータ用 */
function fromUpper(size: number, upper: number[]): number[][] {
    const matrix = uniformMatrix(size);
    let k = 0;
    for (let i = 0; i < size; i++) {
        for (let j = i + 1; j < size; j++) setComparison(matrix, i, j, upper[k++]);
    }
    return matrix;
}

// localStorage にデータが無い場合の表示用サンプルデータ（2 人のグループ意思決定）
export const SAMPLE_AHP_CALC_DATA: AhpCalcData = {
    goal: '文化祭の模擬店で出すメニューを決める',
    criteria: ['味', '提供の速さ', '調理の手間', '利益'],
    alternatives: ['ポップコーン', 'スムージー', 'たこ焼き'],
    members: [
        {
            name: 'メンバー1',
            criteriaMatrix: fromUpper(4, [3, 5, 1, 2, 1 / 3, 1 / 5]),
            alternativeMatrices: [
                fromUpper(3, [1 / 3, 1 / 5, 1 / 2]),
                fromUpper(3, [3, 5, 2]),
                fromUpper(3, [2, 5, 3]),
                fromUpper(3, [3, 1 / 2, 1 / 4]),
            ],
        },
        {
            name: 'メンバー2',
            criteriaMatrix: fromUpper(4, [1, 3, 1 / 3, 3, 1 / 2, 1 / 5]),
            alternativeMatrices: [
                fromUpper(3, [1 / 2, 1 / 4, 1 / 2]),
                fromUpper(3, [4, 6, 2]),
                fromUpper(3, [3, 7, 3]),
                fromUpper(3, [5, 2, 1 / 2]),
            ],
        },
    ],
    sensitivity: { criterion: 0, cursor: null, fitY: false },
};

function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** 上三角成分を正として、大きさ・逆数・値の範囲を揃えた行列を作る（壊れたデータ対策） */
function normalizeMatrix(raw: unknown, size: number): number[][] {
    const matrix = uniformMatrix(size);
    if (!Array.isArray(raw)) return matrix;
    for (let i = 0; i < size; i++) {
        for (let j = i + 1; j < size; j++) {
            const value: unknown = raw[i]?.[j];
            if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
                setComparison(matrix, i, j, SCALE_VALUES[scaleIndex(value)]);
            }
        }
    }
    return matrix;
}

function normalizeMember(raw: unknown, idx: number, n: number, m: number): Member {
    const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const alternativeMatrices = Array.isArray(obj.alternativeMatrices) ? obj.alternativeMatrices : [];
    return {
        name: typeof obj.name === 'string' && obj.name.trim() ? obj.name : defaultMemberName(idx),
        criteriaMatrix: normalizeMatrix(obj.criteriaMatrix, n),
        alternativeMatrices: Array.from({ length: n }, (_, i) => normalizeMatrix(alternativeMatrices[i], m)),
    };
}

function normalizeSensitivity(raw: unknown, n: number): SensitivityState {
    const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const criterion = Number.isInteger(obj.criterion) ? (obj.criterion as number) : 0;
    const cursor = typeof obj.cursor === 'number' && obj.cursor >= 0 && obj.cursor <= 1 ? obj.cursor : null;
    return { criterion: criterion >= 0 && criterion < n ? criterion : 0, cursor, fitY: obj.fitY === true };
}

function normalize(raw: unknown): AhpCalcData {
    const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const criteria = toStringArray(obj.criteria);
    const alternatives = toStringArray(obj.alternatives);
    // 以前の形式（メンバーが無く、行列を直接持つ）は 1 人目のメンバーとして読み込む
    const rawMembers = Array.isArray(obj.members) && obj.members.length > 0 ? obj.members.slice(0, MAX_MEMBERS) : [obj];
    return {
        goal: typeof obj.goal === 'string' ? obj.goal : '',
        criteria,
        alternatives,
        members: rawMembers.map((member, idx) => normalizeMember(member, idx, criteria.length, alternatives.length)),
        sensitivity: normalizeSensitivity(obj.sensitivity, criteria.length),
    };
}

export function hasSavedAhpCalcData(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
}

/** localStorage から読み込む。データが無い・壊れている場合は fallback を返す */
export function loadAhpCalcData(fallback: AhpCalcData = createEmptyData()): AhpCalcData {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(fallback);
    try {
        return normalize(JSON.parse(saved));
    } catch {
        return structuredClone(fallback);
    }
}

/** 入力データに計算結果（ウエイト・C.I.・総合評価・感度分析）を添えて保存する */
export function saveAhpCalcData(data: AhpCalcData): void {
    const analysis = analyzeCalcData(data);
    const sensitivity = analyzeCalcSensitivity(data, analysis);
    const summary = (names: string[], a: AhpAnalysis['criteria']) => ({
        weights: names.map((name, i) => ({ name, weight: a.weights[i] })),
        lambdaMax: a.lambdaMax,
        ci: a.ci,
        consistent: a.consistent,
    });
    const results = {
        // グループのときは統合した行列での結果
        group: isGroup(data),
        criteria: summary(data.criteria, analysis.criteria),
        alternatives: data.criteria.map((criterion, i) => ({
            criterion,
            ...summary(data.alternatives, analysis.alternatives[i]),
        })),
        overall: data.alternatives.map((name, k) => ({ name, score: analysis.scores[k], rank: analysis.ranks[k] })),
        sensitivity: sensitivity && {
            criterion: data.criteria[sensitivity.target],
            intervals: sensitivity.intervals.map(iv => ({ from: iv.from, to: iv.to, best: data.alternatives[iv.best] })),
        },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, results }));
}
