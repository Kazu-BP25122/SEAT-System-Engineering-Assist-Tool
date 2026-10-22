// AHP階層図の入力・出力ページで共有するデータ定義

import type { Orientation } from '../diagram/svg';

/** 評価基準として並べる対象（ステークホルダ単位 / ニーズ項目単位） */
export type CriteriaMode = 'stakeholder' | 'need';

export interface Stakeholder {
    name: string;
    needs: string[];
}

export interface AhpData {
    goal: string;
    criteriaMode: CriteriaMode;
    orientation: Orientation;
    stakeholders: Stakeholder[];
    alternatives: string[];
}

export const STORAGE_KEY = 'seat_ahp_data';

// デフォルトの空データ
export const DEFAULT_AHP_DATA: AhpData = {
    goal: '',
    criteriaMode: 'stakeholder',
    orientation: 'vertical',
    stakeholders: [],
    alternatives: [],
};

// localStorage にデータが無い場合の表示用サンプルデータ
export const SAMPLE_AHP_DATA: AhpData = {
    goal: '文化祭の模擬店で出すメニューを決める',
    criteriaMode: 'stakeholder',
    orientation: 'vertical',
    stakeholders: [
        { name: '来場者', needs: ['美味しい物を食べたい', '列に並びたくない'] },
        { name: '運営スタッフ', needs: ['調理が簡単であってほしい', '利益を出したい'] },
        { name: 'スポンサー', needs: ['ブランドを宣伝したい'] },
    ],
    alternatives: ['ポップコーン', 'スムージー', 'たこ焼き'],
};

/** 文字列の配列だけを取り出す（壊れたデータ対策） */
function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** 読み込んだ値を AhpData の形に揃える */
function normalize(raw: unknown): AhpData {
    const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const stakeholders = Array.isArray(obj.stakeholders) ? obj.stakeholders : [];
    return {
        goal: typeof obj.goal === 'string' ? obj.goal : '',
        criteriaMode: obj.criteriaMode === 'need' ? 'need' : 'stakeholder',
        orientation: obj.orientation === 'horizontal' ? 'horizontal' : 'vertical',
        stakeholders: stakeholders
            .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null && typeof s.name === 'string')
            .map(s => ({ name: s.name as string, needs: toStringArray(s.needs) })),
        alternatives: toStringArray(obj.alternatives),
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

/** 階層図の中段（評価基準）に並べるラベルの一覧 */
export function getCriteria(data: AhpData): string[] {
    if (data.criteriaMode === 'need') {
        return data.stakeholders.flatMap(s => s.needs);
    }
    return data.stakeholders.map(s => s.name);
}
