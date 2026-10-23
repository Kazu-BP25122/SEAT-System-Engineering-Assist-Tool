// AHP階層図（SVG）と Mermaid コードの生成

import { layoutLayers } from '../diagram/layers';
import type { Layer, LayerSpec } from '../diagram/layers';
import { renderBox, renderEdge, svgDocument } from '../diagram/svg';
import type { Orientation, RenderedSvg } from '../diagram/svg';
import type { DiagramContent } from '../diagram/panel';
import type { AhpData } from './data';

/** 段と段の間隔。代替案の手前は線が交差するので広めにとる */
const LEVEL_GAPS: Record<AhpData['levels'], number[]> = {
    3: [60, 120],
    4: [60, 60, 120],
};

/** 段の構成と、段どうしをどう結ぶか */
interface Hierarchy {
    specs: LayerSpec[];
    /**
     * 段 i と段 i+1 の結び方。
     * 'all': すべての組み合わせ（完全2部グラフ） / 'tree': 親から自分に属する子だけ
     */
    links: ('all' | 'tree')[];
}

function buildHierarchy(data: AhpData): Hierarchy {
    const goal = data.goal.trim();
    const goalSpec: LayerSpec = { labels: goal ? [goal] : [], placeholder: '総合目的' };
    const alternativeSpec: LayerSpec = { labels: data.alternatives, placeholder: '代替案' };

    if (data.levels === 3) {
        return {
            specs: [goalSpec, { labels: data.criteria.map(c => c.name), placeholder: '評価基準' }, alternativeSpec],
            links: ['all', 'all'],
        };
    }

    // 中基準の無い大基準は、中基準の段に同じ名前の箱を置いて代替案へつなぐ（大基準自体が末端になる）
    const subLabels = data.criteria.map(c => (c.subcriteria.length > 0 ? c.subcriteria : [c.name]));
    const hasSub = data.criteria.some(c => c.subcriteria.length > 0);
    return {
        specs: [
            goalSpec,
            { labels: data.criteria.map(c => c.name), placeholder: '大基準' },
            hasSub
                ? { labels: subLabels.flat(), placeholder: '中基準', groupSizes: subLabels.map(s => s.length) }
                : { labels: [], placeholder: '中基準' },
            alternativeSpec,
        ],
        links: ['all', hasSub ? 'tree' : 'all', 'all'],
    };
}

/** 子の段の各箱が、親の段の何番目の箱に属するか（groupSizes から求める） */
function parentIndexes(sizes: number[]): number[] {
    return sizes.flatMap((size, k) => Array<number>(size).fill(k));
}

function renderLinks(parent: Layer, child: Layer, link: 'all' | 'tree', spec: LayerSpec, orientation: Orientation): string {
    const dashed = parent.placeholder || child.placeholder;
    if (link === 'tree' && spec.groupSizes) {
        const owners = parentIndexes(spec.groupSizes);
        return child.boxes.map((c, j) => renderEdge(parent.boxes[owners[j]], c, orientation, dashed)).join('');
    }
    return parent.boxes.flatMap(p => child.boxes.map(c => renderEdge(p, c, orientation, dashed))).join('');
}

export function renderAhpSvg(data: AhpData, orientation: Orientation): RenderedSvg {
    const { specs, links } = buildHierarchy(data);
    const { width, height, layers } = layoutLayers(specs, orientation, LEVEL_GAPS[data.levels]);

    const edges = layers.slice(1)
        .map((child, i) => renderLinks(layers[i], child, links[i], specs[i + 1], orientation))
        .join('');
    const boxes = layers.flatMap(layer => layer.boxes.map(renderBox)).join('');

    return svgDocument(width, height, `<g>${edges}</g>${boxes}`);
}

// ---------- Mermaid コード生成 ----------

/** ノードのラベル部分 ["..."] を作る。問題になる文字はエンティティに置き換える */
function mermaidLabel(text: string): string {
    return `["${text.replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;')}"]`;
}

/** 段ごとのノード ID の接頭辞（G: 総合目的 / C: 評価基準・大基準 / S: 中基準 / A: 代替案） */
const LAYER_PREFIX: Record<AhpData['levels'], string[]> = {
    3: ['G', 'C', 'A'],
    4: ['G', 'C', 'S', 'A'],
};

export function buildAhpMermaid(data: AhpData, orientation: Orientation): string {
    const { specs, links } = buildHierarchy(data);
    const prefixes = LAYER_PREFIX[data.levels];
    // 空の段は仮のノードを 1 つ置く
    const labels = specs.map(spec => (spec.labels.length > 0 ? spec.labels : [spec.placeholder]));
    const ids = labels.map((layer, i) => layer.map((_, j) => (prefixes[i] === 'G' ? 'G' : `${prefixes[i]}${j}`)));

    const lines = [`flowchart ${orientation === 'vertical' ? 'TD' : 'LR'}`];
    specs.forEach((spec, i) => {
        lines.push(`    %% ${spec.placeholder}`);
        labels[i].forEach((label, j) => lines.push(`    ${ids[i][j]}${mermaidLabel(label)}`));
    });

    lines.push('');
    links.forEach((link, i) => {
        const childSpec = specs[i + 1];
        if (link === 'tree' && childSpec.groupSizes) {
            const owners = parentIndexes(childSpec.groupSizes);
            ids[i + 1].forEach((child, j) => lines.push(`    ${ids[i][owners[j]]} --- ${child}`));
            return;
        }
        ids[i].forEach(parent => ids[i + 1].forEach(child => lines.push(`    ${parent} --- ${child}`)));
    });

    return lines.join('\n');
}

/** DiagramPanel に渡す図の中身 */
export function ahpDiagramContent(data: AhpData): DiagramContent {
    return {
        render: orientation => renderAhpSvg(data, orientation),
        code: orientation => buildAhpMermaid(data, orientation),
    };
}
