// AHP階層図の入力・出力ページで共有するデータ定義

import type { Orientation } from '../diagram/svg';

/** 階層の数（3: 総合目的→評価基準→代替案 / 4: 総合目的→大基準→中基準→代替案） */
export type HierarchyLevels = 3 | 4;

/** 評価基準（4 層のときは大基準とその下の中基準） */
export interface CriterionGroup {
    name: string;
    /** 中基準。3 層のときは図に使わない（切り替えても消えないように残しておく） */
    subcriteria: string[];
}

export interface AhpData {
    goal: string;
    orientation: Orientation;
    levels: HierarchyLevels;
    criteria: CriterionGroup[];
    alternatives: string[];
}

export const STORAGE_KEY = 'seat_ahp_data';

// デフォルトの空データ
export const DEFAULT_AHP_DATA: AhpData = {
    goal: '',
    orientation: 'vertical',
    levels: 3,
    criteria: [],
    alternatives: [],
};

// localStorage にデータが無い場合の表示用サンプルデータ
export const SAMPLE_AHP_DATA: AhpData = {
    goal: '文化祭の模擬店で出すメニューを決める',
    orientation: 'vertical',
    levels: 4,
    criteria: [
        { name: '来場者', subcriteria: ['味', '提供の速さ'] },
        { name: '運営スタッフ', subcriteria: ['調理の手間', '利益'] },
    ],
    alternatives: ['ポップコーン', 'スムージー', 'たこ焼き'],
};

/**
 * 代替案の直前の段に並ぶ評価基準（末端の基準）。
 * 4 層で中基準の無い大基準は、その大基準自体を末端として扱う。
 * 別の大基準に同じ名前の中基準があるときは「中基準（大基準）」と区別する。
 */
export function leafCriteria(data: AhpData): string[] {
    if (data.levels === 3) return data.criteria.map(c => c.name);

    const leaves = data.criteria.flatMap(c => (c.subcriteria.length > 0
        ? c.subcriteria.map(sub => ({ name: sub, parent: c.name }))
        : [{ name: c.name, parent: '' }]));
    return leaves.map(leaf => {
        const duplicated = leaves.filter(other => other.name === leaf.name).length > 1;
        return duplicated && leaf.parent ? `${leaf.name}（${leaf.parent}）` : leaf.name;
    });
}

/** 文字列の配列だけを取り出す（壊れたデータ対策） */
function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** 評価基準を CriterionGroup の形に揃える。文字列だけの配列（以前の 3 層の形式）も受け付ける */
function toCriterionGroups(value: unknown, subKey: string): CriterionGroup[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): CriterionGroup[] => {
        if (typeof item === 'string') return [{ name: item, subcriteria: [] }];
        if (typeof item === 'object' && item !== null && typeof item.name === 'string') {
            return [{ name: item.name, subcriteria: toStringArray((item as Record<string, unknown>)[subKey]) }];
        }
        return [];
    });
}

/** 読み込んだ値を AhpData の形に揃える */
function normalize(raw: unknown): AhpData {
    const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const base = {
        goal: typeof obj.goal === 'string' ? obj.goal : '',
        orientation: obj.orientation === 'horizontal' ? 'horizontal' : 'vertical',
        alternatives: toStringArray(obj.alternatives),
    } as const;

    // 以前の形式（ステークホルダとニーズ）は、大基準と中基準として読み込む
    if (Array.isArray(obj.stakeholders)) {
        return {
            ...base,
            levels: obj.criteriaMode === 'need' ? 4 : 3,
            criteria: toCriterionGroups(obj.stakeholders, 'needs'),
        };
    }
    return {
        ...base,
        levels: obj.levels === 4 ? 4 : 3,
        criteria: toCriterionGroups(obj.criteria, 'subcriteria'),
    };
}

/** localStorage から読み込む。データが無い・壊れている場合は fallback を返す */
export function loadAhpData(fallback: AhpData = DEFAULT_AHP_DATA): AhpData {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(fallback);
    try {
        return normalize(JSON.parse(saved));
    } catch {
        return structuredClone(fallback);
    }
}

export function saveAhpData(data: AhpData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
