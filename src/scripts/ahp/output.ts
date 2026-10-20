// AHP階層図 出力画面のロジック

import { SAMPLE_AHP_DATA, loadAhpData } from './data';
import { buildMermaid, mountAhpDiagram } from './diagram';

export function initAhpOutput(): void {
    const diagramRoot = document.getElementById('ahp-output');
    if (!diagramRoot) return;

    try {
        const data = loadAhpData(SAMPLE_AHP_DATA);
        mountAhpDiagram(diagramRoot)(data);

        const codeEl = document.getElementById('mermaid-code');
        if (codeEl) codeEl.textContent = buildMermaid(data);
    } catch (error) {
        console.error('データの読み込みに失敗しました:', error);
        diagramRoot.innerText = 'データの読み込みに失敗しました。';
    }
}
