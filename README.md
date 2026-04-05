# Omeka S Themes

GitHub 上で公開されている [Omeka S](https://omeka.org/s/) テーマの一覧を視覚的に確認できる静的サイトです。

公開URL: https://nakamura196.github.io/OmekaS/

## 仕組み

1. [`Daniel-KM/UpgradeToOmekaS`](https://github.com/Daniel-KM/UpgradeToOmekaS) の `omeka_s_themes.csv` からテーマ一覧を取得
2. 各リポジトリの GitHub API を叩いて `name / owner / stars / last_updated / description / theme.jpg / advanced-search 対応` を収集
3. `docs/theme_metadata.json` と `docs/index.html`(クライアントサイド検索・ソート付き)を生成
4. GitHub Actions が毎日自動実行し、`docs/` を main ブランチにコミット
5. GitHub Pages が `main` ブランチの `/docs` フォルダを配信

## ローカルで実行する

Node.js 18 以上が必要です(依存なし)。

```sh
# GitHub API のレート制限を緩めるために token を渡す
export GITHUB_TOKEN=ghp_xxxxxxxx

# 全件ビルド
npm run build

# 件数を絞って確認
LIMIT=5 npm run build
```

生成物は `docs/index.html` と `docs/theme_metadata.json` に出力されます。ブラウザで `docs/index.html` を直接開けば動作確認できます。

## GitHub Pages の設定

リポジトリの **Settings → Pages** で以下に設定してください(初回のみ手動)。

- Source: **Deploy from a branch**
- Branch: **main** / **/docs**

## ライセンス

Apache License 2.0
