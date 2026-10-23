// AHP 一対比較・重要度計算 出力画面のロジック

import { SAMPLE_AHP_CALC_DATA, hasSavedAhpCalcData, loadAhpCalcData, saveAhpCalcData } from './data';
import { mountReport } from './report';
import { mountSensitivity } from './sensitivity';

export function initAhpCalcOutput(): void {
    const reportRoot = document.getElementById('ahp-calc-output');
    if (!reportRoot) return;

    try {
        const data = loadAhpCalcData(SAMPLE_AHP_CALC_DATA);
        const renderReport = mountReport(reportRoot);
        renderReport(data);

        const sensitivityRoot = document.getElementById('ahp-calc-sensitivity');
        if (sensitivityRoot) {
            mountSensitivity(sensitivityRoot, {
                onChange: state => {
                    data.sensitivity = state;
                    renderReport(data);
                    // サンプル表示中は保存しない（入力ページを開いたときにサンプルが残らないように）
                    if (hasSavedAhpCalcData()) saveAhpCalcData(data);
                },
            })(data);
        }
    } catch (error) {
        console.error('データの読み込みに失敗しました:', error);
        reportRoot.innerText = 'データの読み込みに失敗しました。';
    }
}
