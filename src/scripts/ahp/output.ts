// AHP階層図 出力画面のロジック

import { mountDiagramPanel } from '../diagram/panel';
import { SAMPLE_AHP_DATA, STORAGE_KEY, loadAhpData, saveAhpData } from './data';
import { ahpDiagramContent } from './diagram';

export function initAhpOutput(): void {
    const diagramRoot = document.getElementById('ahp-output');
    if (!diagramRoot) return;

    try {
        const data = loadAhpData(SAMPLE_AHP_DATA);
        const render = mountDiagramPanel(diagramRoot, {
            filename: 'ahp_hierarchy',
            orientation: data.orientation,
            // サンプル表示中は保存しない（入力ページを開いたときにサンプルが残らないように）
            onOrientationChange: orientation => {
                if (localStorage.getItem(STORAGE_KEY) === null) return;
                saveAhpData({ ...data, orientation });
            },
        });
        render(ahpDiagramContent(data));
    } catch (error) {
        console.error('データの読み込みに失敗しました:', error);
        diagramRoot.innerText = 'データの読み込みに失敗しました。';
    }
}
