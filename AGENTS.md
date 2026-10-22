# SEAT -System Engineering Assist Tool-

システム工学の図表（ニーズリスト、SWOT分析など）をブラウザ上で簡単に作成できる Web サイト。

## 概要

- トップページ（`src/pages/index.astro`）にツール一覧が並び、クリックすると各ツールの入力ページへ移動する。
- ユーザは入力ページの簡単な GUI でデータを編集し、出力ボタンを押すと出力ページへ遷移して完成した図表が表示される。
- 入力ページと出力ページの間のデータ受け渡しは `localStorage` で行う。

## 技術方針

- フレームワークは Astro を使用する（以前はフレームワークなしの素の HTML で実装していた。`legacy/` を参照）。
- React / Vue などの UI フレームワークは使用しない。クライアント側の処理は素の TypeScript で書く。
- 静的サイトとして出力し、サーバ側の処理は持たない。

## ディレクトリ構成

```
src/
├─ components/            共通コンポーネント
│  ├─ DiagramPanel.astro  図の表示・向き切替・SVG/PNG 保存・コードのコピー
│  └─ Workspace.astro     入力欄と図を並べるレイアウト（PC は 2 列 / スマホはタブ切替）
├─ layouts/               サイト共通レイアウト（ヘッダー等）
├─ pages/
│  ├─ index.astro         トップページ（ツール一覧）
│  └─ tools/<tool>/
│     ├─ index.astro      入力ページ   → /tools/<tool>/
│     └─ output.astro     出力ページ   → /tools/<tool>/output
├─ scripts/
│  ├─ utils.ts            全ツール共通の処理（escapeHtml 等）
│  ├─ diagram/            図（SVG）の共通部品
│  │  ├─ svg.ts           文字の折り返し・箱・線・SVG 文書の生成
│  │  ├─ layers.ts        段ごとに箱を並べるレイアウト（縦向き / 横向き）
│  │  └─ panel.ts         DiagramPanel のクライアント処理
│  └─ <tool>/
│     ├─ data.ts          入力・出力ページで共有する型と localStorage の読み書き
│     ├─ input.ts         入力ページのクライアント処理
│     └─ output.ts        出力ページのクライアント処理
└─ styles/                CSS（共通は style.css、ツール固有は <tool>.css、
                          コンポーネント用は diagram.css / workspace.css）
legacy/                   移行前の素の HTML 実装（参照専用）
public/                   静的ファイル（favicon 等）
```

## 規約

- `<tool>` はツール名を camelCase で表す（例: `needsList`, `swot`）。
- `localStorage` のキーは `seat_<tool>_data` とする（例: `seat_needs_data` は既存データとの互換のため維持）。
- ページ遷移のリンクは相対パス（`output.html` など）ではなく、Astro のルートに合わせた絶対パス（`/tools/<tool>/output`）で書く。
- スタイルは `src/styles/` の CSS にまとめ、`style` 属性の直書きは避ける。
- コード中のコメントは日本語で書く。
- 入力ページはスマホでも操作できるようにする（レスポンシブ対応）。

## 図を出力するツールの作り方

- 図はライブラリを使わず、`src/scripts/diagram/` の部品で SVG を組み立てる。
- 図の表示には `DiagramPanel` を使う。ツール側は「向きを受け取って SVG とコードを返す関数」（`DiagramContent`）を作り、`mountDiagramPanel()` が返す関数に渡す。実装例は `src/scripts/ahp/diagram.ts`。
- 図の向きは縦向き（上→下）をデフォルトとし、横向き（左→右）にも対応する。選んだ向きはツールのデータ（`orientation`）に保存し、入力・出力ページと保存する画像で揃える。
- 入力中に図を確認できるツールは、入力ページで `Workspace` を使い、図のプレビューを並べる。ページの外枠は `container container-wide` にする。
- 新しい並べ方（親の下に子をぶら下げる木構造など）が必要なときは、`src/scripts/diagram/` にレイアウトを追加し、ほかのツールでも使えるようにする。

## Git の運用

- コミットはユーザが行う。エージェントはコミットせず、変更内容の要約を伝える。
- 機能（ツール）ごとにブランチを分ける。ブランチ名は `create-<tool>` とする（例: `create-AHP`）。
- 新しいブランチは main から作る。共通部品（`components/`、`scripts/diagram/`、`style.css` など）を変更したブランチは、それに依存する次の作業を始める前に main へマージする。
- 共通部品の小さな修正はツールのブランチに含めてよいが、コミットを分ける。大きな作り替えは専用のブランチ（例: `refactor-diagram`）で行う。

## legacy の扱い

- `legacy/` は移行元の参照用であり、編集しない。
- ツールを Astro へ移行して動作を確認したら、対応する `legacy/tools/<tool>/` を削除してよい。

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

作業後は `npm run build` が通ることを確認する。

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
