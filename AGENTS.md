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
├─ layouts/               サイト共通レイアウト（ヘッダー等）
├─ pages/
│  ├─ index.astro         トップページ（ツール一覧）
│  └─ tools/<tool>/
│     ├─ index.astro      入力ページ   → /tools/<tool>/
│     └─ output.astro     出力ページ   → /tools/<tool>/output
├─ scripts/
│  ├─ utils.ts            全ツール共通の処理（escapeHtml 等）
│  └─ <tool>/
│     ├─ data.ts          入力・出力ページで共有する型と localStorage の読み書き
│     ├─ input.ts         入力ページのクライアント処理
│     └─ output.ts        出力ページのクライアント処理
└─ styles/                CSS（共通は style.css、ツール固有は <tool>.css）
legacy/                   移行前の素の HTML 実装（参照専用）
public/                   静的ファイル（favicon 等）
```

## 規約

- `<tool>` はツール名を camelCase で表す（例: `needsList`, `swot`）。
- `localStorage` のキーは `seat_<tool>_data` とする（例: `seat_needs_data` は既存データとの互換のため維持）。
- ページ遷移のリンクは相対パス（`output.html` など）ではなく、Astro のルートに合わせた絶対パス（`/tools/<tool>/output`）で書く。
- スタイルは `src/styles/` の CSS にまとめ、`style` 属性の直書きは避ける。
- コード中のコメントは日本語で書く。

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
