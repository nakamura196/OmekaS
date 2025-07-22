# JupyterノートブックをGitHub Actionsで定期実行する設定

## 概要
このドキュメントでは、JupyterノートブックをGitHub Actionsで定期的に実行するための設定手順を記録しています。

## 実施した変更内容

### 1. 環境変数名の統一

#### 変更前
- `.env.example`で使用していた環境変数名：
  - `token`
  - `notion_api_key`

#### 変更後
- 大文字のスネークケースに統一：
  - `GITHUB_TOKEN`
  - `NOTION_API_KEY`

#### 変更したファイル
- `.env.example`
- `OmekaS/github.py`: `os.environ["token"]` → `os.environ["GITHUB_TOKEN"]`
- `OmekaS/notion.py`: `os.environ["notion_api_key"]` → `os.environ["NOTION_API_KEY"]`

### 2. GitHub Actionsワークフローの作成

#### ファイルパス
`.github/workflows/run-notebook.yml`

#### ワークフローの主な機能
- 毎日UTC 0:00（日本時間9:00）に自動実行
- 手動実行（workflow_dispatch）にも対応
- Jupyterノートブックを実行し、結果を保存

#### 主な設定ポイント

1. **依存関係のインストール**
   ```yaml
   - name: Install dependencies
     run: |
       python -m pip install --upgrade pip
       pip install -r requirements.txt
       pip install jupyter nbconvert
       pip install -e .  # OmekaSモジュールをインストール
   ```

2. **ノートブックの実行**
   ```yaml
   - name: Convert and run notebook
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
       NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
     run: |
       jupyter nbconvert --to notebook --execute src/01_demo.ipynb --output 01_demo_executed.ipynb \
         --ExecutePreprocessor.timeout=600 \
         --ExecutePreprocessor.kernel_name=python3 \
         --ExecutePreprocessor.allow_errors=False \
         --debug
   ```

3. **actローカル実行への対応**
   - GitHub Actions環境とact環境を判別して処理を分岐
   - actではアーティファクトアップロードの代わりにローカル保存

### 3. ローカル実行環境（act）の設定

#### 作成したファイル
- `.env.act`: act用の環境変数ファイル
- `.secrets`: act用のシークレットファイル（`.gitignore`に追加済み）

#### actでの実行コマンド
```bash
# 特定のワークフローのみを実行
act workflow_dispatch -W .github/workflows/run-notebook.yml --secret-file .secrets

# Apple M-seriesチップの場合
act workflow_dispatch -W .github/workflows/run-notebook.yml --secret-file .secrets --container-architecture linux/amd64
```

### 4. GitHub Secretsの設定

#### GitHub CLIを使用したSecrets登録
```bash
gh secret set NOTION_API_KEY --body "your_notion_api_key_here"
```

注：`GITHUB_TOKEN`はGitHub Actionsが自動的に提供するため手動登録不要

## トラブルシューティング

### 1. ModuleNotFoundError: No module named 'OmekaS'
**原因**: OmekaSモジュールがインストールされていない
**解決策**: `pip install -e .`を追加

### 2. NameError: name 'get_ipython' is not defined
**原因**: Jupyterの魔法コマンド（`%load_ext`など）はPythonスクリプトでは実行できない
**解決策**: `--to python`の代わりに`--to notebook --execute`を使用

### 3. FileNotFoundError: src/src/01_demo.py
**原因**: nbconvertの`--output`オプションでパスが重複
**解決策**: `--output src/01_demo.py`から`--output 01_demo.py`に変更

### 4. actでのアーティファクトアップロードエラー
**原因**: actはGitHub Actionsのアーティファクト機能をサポートしていない
**解決策**: `if: ${{ !env.ACT }}`条件を追加してact実行時はスキップ

## 最終的なファイル構成
```
OmekaS/
├── .github/
│   └── workflows/
│       ├── deploy.yaml        # GitHub Pages デプロイ用
│       └── run-notebook.yml   # Jupyterノートブック実行用
├── .env.example              # 環境変数テンプレート
├── .env.act                  # act用環境変数（.gitignore対象）
├── .secrets                  # act用シークレット（.gitignore対象）
├── .gitignore               # .env.actと.secretsを追加
├── requirements.txt          # Python依存関係
├── setup.py                  # OmekaSパッケージ設定
├── src/
│   └── 01_demo.ipynb        # 実行対象のノートブック
└── OmekaS/
    ├── github.py            # GitHub API クライアント
    └── notion.py            # Notion API クライアント
```

## 今後の改善点
- pyproject.tomlへの移行（setuptools >= 64対応）
- エラーハンドリングの強化
- 実行結果の通知機能追加