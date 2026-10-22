// AHP階層図（SVG）と Mermaid コードの生成

import { layoutLayers } from '../diagram/layers';
import { renderBox, renderEdge, svgDocument } from '../diagram/svg';
import type { Orientation, RenderedSvg } from '../diagram/svg';
import type { DiagramContent } from '../diagram/panel';
import { getCriteria } from './data';
import type { AhpData } from './data';

/** 段と段の間隔（総合目的→評価基準, 評価基準→代替案）。下段は線が交差するので広めにとる */
const LEVEL_GAPS = [60, 120];

export function renderAhpSvg(data: AhpData, orientation: Orientation): RenderedSvg {
    const goal = data.goal.trim();
    const { width, height, layers } = layoutLayers([
        { labels: goal ? [goal] : [], placeholder: '総合目的' },
        { labels: getCriteria(data), placeholder: '評価基準' },
        { labels: data.alternatives, placeholder: '代替案' },
    ], orientation, LEVEL_GAPS);

    // 上の段の全ノードから下の段の全ノードへ線を引く（完全2部グラフ）
    const edges = layers.slice(1).flatMap((child, i) => {
        const parent = layers[i];
        const dashed = parent.placeholder || child.placeholder;
        return parent.boxes.flatMap(p => child.boxes.map(c => renderEdge(p, c, orientation, dashed)));
    }).join('');
    const boxes = layers.flatMap(layer => layer.boxes.map(renderBox)).join('');

    return svgDocument(width, height, `<g>${edges}</g>${boxes}`);
}

// ---------- Mermaid コード生成 ----------

/** ノードのラベル部分 ["..."] を作る。問題になる文字はエンティティに置き換える */
function mermaidLabel(text: string): string {
    return `["${text.replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;')}"]`;
}

export function buildAhpMermaid(data: AhpData, orientation: Orientation): string {
    const goal = data.goal.trim() || '総合目的';
    const criteria = getCriteria(data);
    const alternatives = data.alternatives;

    const lines = [
        `flowchart ${orientation === 'vertical' ? 'TD' : 'LR'}`,
        '    %% 総合目的',
        `    G${mermaidLabel(goal)}`,
        '    %% 評価基準',
    ];
    criteria.forEach((c, i) => lines.push(`    C${i}${mermaidLabel(c)}`));
    lines.push('    %% 代替案');
    alternatives.forEach((a, j) => lines.push(`    A${j}${mermaidLabel(a)}`));

    lines.push('');
    criteria.forEach((_, i) => lines.push(`    G --- C${i}`));
    criteria.forEach((_, i) => {
        alternatives.forEach((_, j) => lines.push(`    C${i} --- A${j}`));
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
