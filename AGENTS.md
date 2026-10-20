## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

制作物
名称　SEAT -System Engineering Assist Tool-


概要
システム工学の図表を簡単に作れるWebサイト(もととなるのもがlegacyにある)
ルートページにツール(ニーズリスト作成など)が並び、クリックすると該当する図表を作成するページに移る。
ユーザは簡単なGUIで操作し、出力ボタンを押すと画面が遷移して完成した図表が表示される。(参考：/legacy/tools/needsList)


元々はフレームワークを使わずに作成しようとしていたが、Astroを使って開発する方針に変更したい。


ディレクトリ概要
src
/scripts 各ツールのtsの部分を置きます
/components コンポーネントを置きます
/layouts サイト全体のレイアウトを決定します(ヘッダーなど)
/style 各ツールのcss部分を書きます
/pages 
 /tools　各ツールのhtml部分を置きます
 index.astro ルートとなるページです



作業内容
legacyにあるニーズリスト制作ページをastroように作り替え、上記のディレクトリ構造になるように全体をリファクタリングしてください。