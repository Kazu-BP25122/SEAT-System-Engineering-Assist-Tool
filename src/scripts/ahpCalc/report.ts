// 計算結果の表（一対比較表・ウエイト計算表・固有値・C.I.表・総合評価・グループ統合・感度分析）の組み立てと、
// 画面表示用 HTML・Word 貼り付け用 HTML・Markdown・PNG 画像への書き出し

import { escapeHtml } from '../utils';
import { downloadPng } from '../diagram/export';
import { renderTablesSvg } from '../diagram/table';
import type { SvgTableBlock } from '../diagram/table';
import { CI_THRESHOLD, analyzeMatrix, reversalPoints, scoresAt } from './calc';
import type { AhpAnalysis, MatrixAnalysis } from './calc';
import { analyzeCalcData, analyzeCalcSensitivity, effectiveMatrices, formatScale, isGroup } from './data';
import type { AhpCalcData } from './data';

interface ReportRow {
    cells: string[];
    /** total: 合計などの集計行 / best: 1 位の行 */
    kind?: 'total' | 'best';
}

interface ReportTable {
    caption: string;
    head: string[];
    rows: ReportRow[];
}

interface ReportSection {
    id: string;
    title: string;
    /** 整合度の判定を表示する一対比較の結果 */
    verdict?: MatrixAnalysis;
    /** 注意を促すメッセージ */
    message?: string;
    /** 表の読み方などの説明 */
    note?: string;
    tables: ReportTable[];
}

// ---------- 数値の表示 ----------

export function formatNumber(value: number, digits = 3): string {
    if (!Number.isFinite(value)) return '—';
    if (value !== 0 && Math.abs(value) < 10 ** -digits) return value.toExponential(2);
    const text = value.toFixed(digits);
    // 「-0.000」は「0.000」にする
    return /^-0\.?0*$/.test(text) ? text.slice(1) : text;
}

function verdictText(analysis: MatrixAnalysis): string {
    return analysis.consistent ? '整合性あり（OK）' : `整合性なし（C.I. > ${CI_THRESHOLD}）`;
}

/** C.I. の値と判定バッジ（入力ページの行列の下にも使う）。extra はバッジの横に並べる HTML */
export function ciBadgeHtml(analysis: MatrixAnalysis, extra = ''): string {
    return `
        <div class="ahp-ci">
            <span class="ahp-ci-values">λmax = ${formatNumber(analysis.lambdaMax)} / C.I. = ${formatNumber(analysis.ci)}</span>
            <span class="ahp-badge ${analysis.consistent ? 'is-ok' : 'is-ng'}">${verdictText(analysis)}</span>
            ${extra}
        </div>
    `;
}

// ---------- 表の組み立て ----------

/** 一対比較行列 1 つ分の表（一対比較表・ウエイト計算表・固有値・C.I.表）。group のときは統合した行列 */
function matrixTables(names: string[], matrix: number[][], a: MatrixAnalysis, group: boolean): ReportTable[] {
    const n = names.length;
    return [
        {
            caption: group ? '統合一対比較表（メンバー全員の値の幾何平均）' : '一対比較表',
            head: ['', ...names],
            rows: names.map((name, i) => ({ cells: [name, ...matrix[i].map(v => (group ? formatNumber(v) : formatScale(v)))] })),
        },
        {
            caption: `ウエイト計算表（幾何平均 = 行の積の ${n} 乗根）`,
            head: ['項目', '行の積', '幾何平均', 'ウエイト'],
            rows: [
                ...names.map((name, i) => ({
                    cells: [name, formatNumber(a.rowProducts[i]), formatNumber(a.geometricMeans[i]), formatNumber(a.weights[i])],
                })),
                {
                    cells: ['合計', '', formatNumber(a.geometricMeanSum), formatNumber(a.weights.reduce((s, w) => s + w, 0))],
                    kind: 'total',
                },
            ],
        },
        {
            caption: '固有値・C.I.表',
            head: ['項目', '行 × ウエイト（内積）', 'ウエイト', '固有値の推定値（内積 ÷ ウエイト）'],
            rows: [
                ...names.map((name, i) => ({
                    cells: [name, formatNumber(a.weightedSums[i]), formatNumber(a.weights[i]), formatNumber(a.eigenEstimates[i])],
                })),
                { cells: ['λmax（推定値の平均）', '', '', formatNumber(a.lambdaMax)], kind: 'total' },
                { cells: [`C.I. = (λmax − ${n}) / (${n} − 1)`, '', '', formatNumber(a.ci)], kind: 'total' },
            ],
        },
    ];
}

/** 判定つきの C.I.（表のセル用） */
function ciCell(a: MatrixAnalysis): string {
    return `${formatNumber(a.ci)} ${a.consistent ? 'OK' : 'NG'}`;
}

/** グループ意思決定：メンバーごとの評価基準のウエイトと整合度 */
function groupSection(data: AhpCalcData, analysis: AhpAnalysis): ReportSection {
    const members = data.members.map(m => ({
        name: m.name,
        criteria: analyzeMatrix(m.criteriaMatrix),
        alternatives: m.alternativeMatrices.map(analyzeMatrix),
    }));
    // 代替案が 1 つ以下のときは代替案の比較が無いので整合度を出さない
    const withAlternatives = data.alternatives.length > 1;
    const hasInconsistent = members.some(m => !m.criteria.consistent
        || (withAlternatives && m.alternatives.some(a => !a.consistent)));
    return {
        id: 'group',
        title: `グループ統合（${data.members.length} 人の幾何平均）`,
        message: hasInconsistent ? '整合性のないメンバーの回答があります。統合前に見直すことをおすすめします。' : undefined,
        tables: [
            {
                caption: 'メンバー別の評価基準のウエイト',
                head: ['評価基準', ...members.map(m => m.name), '統合'],
                rows: data.criteria.map((c, i) => ({
                    cells: [c, ...members.map(m => formatNumber(m.criteria.weights[i])), formatNumber(analysis.criteria.weights[i])],
                })),
            },
            {
                caption: 'メンバー別の整合度（C.I.）',
                head: ['メンバー', '評価基準', ...(withAlternatives ? data.criteria.map(c => `代替案（${c}）`) : [])],
                rows: [
                    ...members.map(m => ({
                        cells: [m.name, ciCell(m.criteria), ...(withAlternatives ? m.alternatives.map(ciCell) : [])],
                    })),
                    {
                        cells: ['統合', ciCell(analysis.criteria), ...(withAlternatives ? analysis.alternatives.map(ciCell) : [])],
                        kind: 'total' as const,
                    },
                ],
            },
        ],
    };
}

/** 感度分析：最適案の区間・逆転ポイント・総合評価の変化 */
function sensitivitySection(data: AhpCalcData, analysis: AhpAnalysis): ReportSection | null {
    const s = analyzeCalcSensitivity(data, analysis);
    if (!s) return null;
    const criterion = data.criteria[s.target];
    const reversals = reversalPoints(s);
    const steps = Array.from({ length: 11 }, (_, i) => i / 10);
    const tables: ReportTable[] = [{
        caption: '最適案の区間（現在のウエイトを含む区間を強調）',
        head: ['w の範囲', '最適案'],
        rows: s.intervals.map(iv => ({
            cells: [`${formatNumber(iv.from)} 〜 ${formatNumber(iv.to)}`, data.alternatives[iv.best]],
            kind: s.current >= iv.from && s.current <= iv.to ? 'best' : undefined,
        })),
    }];
    if (reversals.length > 0) {
        tables.push({
            caption: '逆転ポイント（最適案が入れ替わるウエイト）',
            head: ['w', '入れ替わり', '総合評価'],
            rows: reversals.map((w, i) => ({
                cells: [
                    formatNumber(w),
                    `${data.alternatives[s.intervals[i].best]} → ${data.alternatives[s.intervals[i + 1].best]}`,
                    formatNumber(scoresAt(s, w)[s.intervals[i].best]),
                ],
            })),
        });
    }
    tables.push({
        caption: '総合評価の変化',
        head: ['w', ...data.alternatives],
        rows: steps.map(w => ({ cells: [w.toFixed(1), ...scoresAt(s, w).map(v => formatNumber(v))] })),
    });
    return {
        id: 'sensitivity',
        title: `感度分析（基準: ${criterion}）`,
        note: `「${criterion}」のウエイト w を 0 〜 1 で変え、ほかの基準は元の比率を保ったときの総合評価（現在の w = ${formatNumber(s.current)}）`,
        tables,
    };
}

function buildSections(data: AhpCalcData): ReportSection[] {
    const { criteria, alternatives } = data;
    if (criteria.length === 0) {
        return [{ id: 'empty', title: '計算結果', message: '評価基準を追加すると、ここに計算結果が表示されます。', tables: [] }];
    }

    // グループのときは、全員の値の幾何平均で統合した行列で計算する
    const group = isGroup(data);
    const matrices = effectiveMatrices(data);
    const analysis = analyzeCalcData(data);
    const suffix = group ? '（統合）' : '';
    const sections: ReportSection[] = [];

    // 総合評価（代替案が無いときは計算できない）
    if (alternatives.length > 0) {
        const order = alternatives.map((_, k) => k).sort((a, b) => analysis.scores[b] - analysis.scores[a]);
        const allConsistent = analysis.criteria.consistent && analysis.alternatives.every(a => a.consistent);
        sections.push({
            id: 'overall',
            title: `総合評価${group ? `（${data.members.length} 人のグループ統合）` : ''}`,
            message: allConsistent ? undefined : '整合性のない一対比較表があります。比較を見直してください。',
            tables: [
                {
                    caption: '総合評価ランキング表',
                    head: ['順位', '代替案', '総合評価'],
                    rows: order.map(k => ({
                        cells: [`${analysis.ranks[k]} 位`, alternatives[k], formatNumber(analysis.scores[k])],
                        kind: analysis.ranks[k] === 1 ? 'best' : undefined,
                    })),
                },
                {
                    caption: '総合評価の計算表（各基準のウエイト × 代替案のウエイト の和）',
                    head: ['代替案', ...criteria.map((c, i) => `${c}（${formatNumber(analysis.criteria.weights[i])}）`), '総合評価'],
                    rows: alternatives.map((alt, k) => ({
                        cells: [
                            alt,
                            ...analysis.alternatives.map(a => formatNumber(a.weights[k])),
                            formatNumber(analysis.scores[k]),
                        ],
                    })),
                },
                {
                    caption: '整合度の一覧',
                    head: ['一対比較表', '項目数', 'λmax', 'C.I.', '判定'],
                    rows: [
                        { name: '評価基準', a: analysis.criteria },
                        ...criteria.map((c, i) => ({ name: `代替案（${c}）`, a: analysis.alternatives[i] })),
                    ].map(({ name, a }) => ({
                        cells: [name, String(a.size), formatNumber(a.lambdaMax), formatNumber(a.ci), a.consistent ? 'OK' : 'NG'],
                    })),
                },
            ],
        });
    }

    const sensitivity = sensitivitySection(data, analysis);
    if (sensitivity) sections.push(sensitivity);
    if (group) sections.push(groupSection(data, analysis));

    sections.push({
        id: 'criteria',
        title: `評価基準の重要度${suffix}`,
        verdict: analysis.criteria,
        tables: matrixTables(criteria, matrices.criteriaMatrix, analysis.criteria, group),
    });

    criteria.forEach((c, i) => {
        sections.push(alternatives.length === 0
            ? { id: `alt-${i}`, title: `代替案の評価（基準: ${c}）`, message: '代替案を追加してください。', tables: [] }
            : {
                id: `alt-${i}`,
                title: `代替案の評価（基準: ${c}）${suffix}`,
                verdict: analysis.alternatives[i],
                tables: matrixTables(alternatives, matrices.alternativeMatrices[i], analysis.alternatives[i], group),
            });
    });

    return sections;
}

// ---------- 画面表示用 HTML ----------

function displayTable(table: ReportTable): string {
    const head = table.head.map(h => `<th scope="col">${escapeHtml(h)}</th>`).join('');
    const rows = table.rows.map(row => {
        const cells = row.cells.map((cell, idx) => (idx === 0
            ? `<th scope="row">${escapeHtml(cell)}</th>`
            : `<td>${escapeHtml(cell)}</td>`)).join('');
        return `<tr${row.kind ? ` class="is-${row.kind}"` : ''}>${cells}</tr>`;
    }).join('');
    return `
        <div class="ahp-report-table-wrap">
            <table class="ahp-report-table">
                <caption>${escapeHtml(table.caption)}</caption>
                <thead><tr>${head}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function copyButtons(target: string): string {
    return `
        <div class="ahp-report-copy">
            <button type="button" class="btn btn-secondary" data-report-copy="html" data-report-target="${target}">表をコピー（Word 用）</button>
            <button type="button" class="btn btn-secondary" data-report-copy="markdown" data-report-target="${target}">Markdown でコピー</button>
            <button type="button" class="btn btn-secondary" data-report-copy="png" data-report-target="${target}">PNG で保存</button>
        </div>
    `;
}

function displaySection(section: ReportSection): string {
    const hasTables = section.tables.length > 0;
    return `
        <section class="ahp-report-section">
            <div class="ahp-report-head">
                <h3>${escapeHtml(section.title)}</h3>
                ${hasTables ? copyButtons(section.id) : ''}
            </div>
            ${section.message ? `<p class="ahp-report-message">${escapeHtml(section.message)}</p>` : ''}
            ${section.note ? `<p class="ahp-report-note">${escapeHtml(section.note)}</p>` : ''}
            ${section.tables.map(displayTable).join('')}
            ${section.verdict ? ciBadgeHtml(section.verdict) : ''}
        </section>
    `;
}

// ---------- Word 貼り付け用 HTML（貼り付け先に CSS が無いので style を直接書く） ----------

const CELL_STYLE = 'border:1px solid #999;padding:4px 8px;';

function richTable(table: ReportTable): string {
    const head = table.head.map(h => `<th style="${CELL_STYLE}background:#f2f2f2;">${escapeHtml(h)}</th>`).join('');
    const rows = table.rows.map(row => {
        const weight = row.kind ? 'font-weight:bold;' : '';
        const cells = row.cells.map((cell, idx) => {
            const align = idx === 0 ? 'text-align:left;' : 'text-align:right;';
            return `<td style="${CELL_STYLE}${align}${weight}">${escapeHtml(cell)}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
    return `<p><b>${escapeHtml(table.caption)}</b></p>`
        + `<table style="border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function richSection(section: ReportSection): string {
    const verdict = section.verdict
        ? `<p>λmax = ${formatNumber(section.verdict.lambdaMax)}、C.I. = ${formatNumber(section.verdict.ci)} → ${verdictText(section.verdict)}</p>`
        : '';
    const note = section.note ? `<p>${escapeHtml(section.note)}</p>` : '';
    return `<h3>${escapeHtml(section.title)}</h3>${note}${section.tables.map(richTable).join('')}${verdict}`;
}

// ---------- Markdown ----------

function markdownCell(text: string): string {
    return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function markdownTable(table: ReportTable): string {
    const line = (cells: string[]) => `| ${cells.map(markdownCell).join(' | ')} |`;
    const align = `|${table.head.map((_, idx) => (idx === 0 ? ' --- ' : ' ---: ')).join('|')}|`;
    return [
        `**${markdownCell(table.caption)}**`,
        '',
        line(table.head),
        align,
        ...table.rows.map(row => line(row.kind ? row.cells.map(c => (c ? `**${c}**` : c)) : row.cells)),
    ].join('\n');
}

function markdownSection(section: ReportSection): string {
    const parts = [`### ${section.title}`, ...(section.note ? [section.note] : []), ...section.tables.map(markdownTable)];
    if (section.verdict) {
        parts.push(`λmax = ${formatNumber(section.verdict.lambdaMax)}、C.I. = ${formatNumber(section.verdict.ci)} → **${verdictText(section.verdict)}**`);
    }
    return parts.join('\n\n');
}

// ---------- PNG 画像 ----------

function verdictLine(analysis: MatrixAnalysis): string {
    return `λmax = ${formatNumber(analysis.lambdaMax)}、C.I. = ${formatNumber(analysis.ci)} → ${verdictText(analysis)}`;
}

/** 画像に描く内容。heading を渡すと先頭に総合目的の見出しを置く */
function imageBlocks(selected: ReportSection[], heading: string): SvgTableBlock[] {
    const blocks: SvgTableBlock[] = selected.map(section => ({
        title: section.title,
        paragraphs: [section.message, section.note].filter((t): t is string => Boolean(t)),
        tables: section.tables,
        footer: section.verdict ? verdictLine(section.verdict) : undefined,
    }));
    if (heading) blocks.unshift({ title: `総合目的: ${heading}`, tables: [] });
    return blocks;
}

/** 保存するファイル名（表のまとまりごと。まとめて保存するときは ahp_results） */
function imageFilename(target: string | undefined): string {
    return `ahp_${!target || target === 'all' ? 'results' : target}`;
}

// ---------- コピー ----------

async function copyRichText(html: string, plain: string): Promise<void> {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
        })]);
        return;
    }
    // Clipboard API が使えない環境向けのフォールバック（画面外に置いた要素を選択してコピー）
    const holder = document.createElement('div');
    holder.innerHTML = html;
    holder.className = 'ahp-report-clipboard';
    document.body.appendChild(holder);
    const range = document.createRange();
    range.selectNodeContents(holder);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('copy');
    selection?.removeAllRanges();
    holder.remove();
}

async function copyPlainText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

/** ボタンの表示を一時的に変えて操作結果を知らせる */
function flashButton(btn: HTMLElement, message: string): void {
    const original = btn.dataset.label ?? btn.textContent ?? '';
    btn.dataset.label = original;
    btn.textContent = message;
    setTimeout(() => {
        btn.textContent = original;
    }, 1500);
}

// ---------- レポート ----------

/**
 * 計算結果の表示領域を初期化し、描画関数を返す。
 * 返り値の関数にデータを渡すたびに再計算・再描画される。
 */
export function mountReport(root: HTMLElement): (data: AhpCalcData) => void {
    let sections: ReportSection[] = [];
    let goal = '';

    root.addEventListener('click', async e => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-report-copy]');
        if (!btn) return;

        const target = btn.dataset.reportTarget;
        const selected = sections.filter(s => s.tables.length > 0 && (target === 'all' || s.id === target));
        const heading = target === 'all' && goal ? goal : '';
        try {
            if (btn.dataset.reportCopy === 'png') {
                downloadPng(renderTablesSvg(imageBlocks(selected, heading)), imageFilename(target));
                return;
            }
            const markdown =[heading ? `## ${heading}` : '', ...selected.map(markdownSection)].filter(Boolean).join('\n\n');
            if (btn.dataset.reportCopy === 'html') {
                const html = (heading ? `<h2>${escapeHtml(heading)}</h2>` : '') + selected.map(richSection).join('');
                await copyRichText(html, markdown);
            } else {
                await copyPlainText(markdown);
            }
            flashButton(btn, 'コピーしました');
        } catch {
            flashButton(btn, 'コピーに失敗しました');
        }
    });

    return data => {
        sections = buildSections(data);
        goal = data.goal.trim();
        const hasTables = sections.some(s => s.tables.length > 0);
        root.innerHTML = `
            ${goal ? `<p class="ahp-report-goal">総合目的: ${escapeHtml(goal)}</p>` : ''}
            ${hasTables ? `<div class="ahp-report-toolbar"><span>結果をまとめて:</span>${copyButtons('all')}</div>` : ''}
            ${sections.map(displaySection).join('')}
        `;
    };
}
