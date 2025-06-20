# 🎙️ Murmur

**音声でライフログを記録するElectronアプリ**

Murmurは、音声入力を通じて日常のアイデアやメモを簡単にキャプチャし、OpenAI APIを使って自動的にテキスト化・整形してObsidian Vaultに保存するデスクトップアプリケーションです。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-Latest-blue.svg)](https://electronjs.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Whisper%20%26%20GPT-green.svg)](https://openai.com/)

## ✨ 主な機能

### 🎤 音声録音とテキスト化
- **高品質な音声録音**: MediaRecorder APIを使用した音声キャプチャ
- **リアルタイム音量表示**: 録音中の音声レベルを視覚的に確認
- **音声認識**: OpenAI Whisper APIによる高精度なテキスト変換

### 📝 自動テキスト整形
- **AI整形**: OpenAI GPT APIによる読みやすい形式への自動変換
- **文章構造化**: 要約、見出し、箇条書きなどの適切な構造化
- **即座のプレビュー**: 整形結果をすぐに確認・編集可能

### 📚 Obsidian連携
- **シームレス保存**: 整形したテキストを自動的にObsidian Vaultに保存
- **YAML Front Matter**: メタデータ付きでファイルを整理
- **カスタマイズ可能**: 保存場所や命名規則をカスタマイズ

### ⚙️ ユーザーフレンドリーな設定
- **初回セットアップウィザード**: 起動時に必要な設定を案内
- **設定検証**: API接続やVaultパスの自動検証
- **環境変数管理**: `.env`ファイルの自動生成オプション

## 📋 必要条件

- **Node.js** v16 以上
- **OpenAI APIキー** ([取得方法](#openai-apiキーの取得))
- **Obsidian** ([ダウンロード](https://obsidian.md/))

## 🚀 クイックスタート

### 1. リポジトリのクローンとインストール

```bash
git clone https://github.com/nyasuto/murmur.git
cd murmur
npm install
```

### 2. アプリの起動

```bash
npm run dev
```

初回起動時に**設定ウィザード**が表示されます。画面の指示に従って設定を完了してください。

### 3. 基本的な使い方

1. **🎙️ 録音開始**: 「録音開始」ボタンをクリック（またはスペースキー）
2. **🛑 録音停止**: 再度ボタンをクリックして録音を停止
3. **⏳ 自動処理**: 音声がテキストに変換され、AIが整形
4. **💾 保存**: 「Obsidianに保存」ボタンで保存完了

### 4. ショートカットキー

- **スペースキー**: 録音の開始/停止
- **Escキー**: 内容をクリア / 設定を閉じる

## ⚙️ 詳細設定

### OpenAI APIキーの取得

1. [OpenAI Platform](https://platform.openai.com/api-keys)にアクセス
2. アカウントにログインまたは新規登録
3. 「Create new secret key」をクリック
4. 生成されたAPIキーをコピー（⚠️ 一度しか表示されません）

### Obsidian Vaultの準備

1. [Obsidian](https://obsidian.md/)をダウンロード・インストール
2. 新しいVaultを作成、または既存のVaultを選択
3. Vaultのフォルダパスをメモしておく

### 環境変数設定（オプション）

手動で`.env`ファイルを作成する場合：

```bash
cp .env.example .env
```

`.env`ファイルを編集：

```env
# OpenAI API設定
OPENAI_API_KEY=your_openai_api_key_here

# Obsidian設定
OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault

# アプリ設定
NODE_ENV=development
```

## 🛠️ 開発者向け

### 利用可能なコマンド

```bash
# 開発モードで起動
npm run dev

# 本番用アプリをビルド
npm run build

# 配布用パッケージを作成
npm run dist

# コード品質チェック
make quality

# コードを自動修正
make quality-fix

# Git pre-commitフックを設定
make git-hooks

# すべてのコマンドを表示
make help
```

### プロジェクト構造

```
murmur/
├── main.js                 # Electronメインプロセス
├── preload.js             # プリロードスクリプト
├── renderer/              # レンダラープロセス
│   ├── index.html        # メインUI
│   ├── styles.css        # スタイルシート
│   └── renderer.js       # フロントエンドロジック
├── src/                   # コアモジュール
│   ├── openai-client.js  # OpenAI API通信
│   ├── settings-manager.js # 設定管理
│   └── obsidian-saver.js # Obsidian連携
├── .github/workflows/     # CI/CD設定
├── Makefile              # 開発ツール
└── README.md             # このファイル
```

### アーキテクチャ

```
┌─────────────────────────────────────┐
│           Electron App              │
├─────────────────────────────────────┤
│  Renderer Process (Frontend)       │
│  ├─ 音声録音UI                      │
│  ├─ 設定ウィザード                   │
│  └─ 結果表示・編集                   │
├─────────────────────────────────────┤
│  Main Process (Backend)            │
│  ├─ OpenAI API通信                 │
│  ├─ ファイルシステム操作              │
│  ├─ 設定管理                        │
│  └─ Obsidian連携                   │
└─────────────────────────────────────┘
```

## 🎯 使用例

### 📝 日常のメモ取り
「今日のミーティングで話し合った新しいプロジェクトのアイデアについて整理したい」
→ 構造化された議事録として自動整形

### 💡 アイデアのキャプチャ
「散歩中に思いついたアプリの機能について」
→ 分かりやすくカテゴリ分けされたアイデアメモ

### 📖 学習ログ
「今日読んだ本の要点と感想」
→ 読書記録として適切にフォーマット

## 🔧 トラブルシューティング

### よくある問題

**❓ 音声が録音されない**
- ブラウザのマイク権限を確認してください
- 他のアプリでマイクが使用されていないか確認してください

**❓ OpenAI APIエラー**
- APIキーが正しく設定されているか確認してください
- OpenAIアカウントに十分なクレジットがあるか確認してください

**❓ Obsidianに保存されない**
- Vaultパスが正しく設定されているか確認してください
- Vaultフォルダへの書き込み権限があるか確認してください

### サポート

問題が解決しない場合は、[Issues](https://github.com/nyasuto/murmur/issues)で報告してください。

## 🗺️ ロードマップ

### 近日実装予定
- [ ] 音声ファイルのインポート機能
- [ ] カスタムプロンプトテンプレート
- [ ] 複数言語対応
- [ ] ダークモード

### 将来的な構想
- [ ] 画像・スクリーンショットのOCR対応
- [ ] 週次・月次レポート自動生成
- [ ] クラウド同期機能
- [ ] モバイルアプリ連携

## 🤝 コントリビューション

プルリクエストや機能提案を歓迎します！

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feat/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feat/amazing-feature`)
5. プルリクエストを作成

### 開発ガイドライン
- コミットメッセージは[Conventional Commits](https://www.conventionalcommits.org/)に従ってください
- プルリクエスト前に`make quality`でコード品質をチェックしてください
- すべてのGitHub Issuesは日本語で作成してください

## 📄 ライセンス

このプロジェクトは[MIT License](LICENSE)の下で公開されています。

## 🙏 謝辞

- [OpenAI](https://openai.com/) - Whisper & GPT API
- [Obsidian](https://obsidian.md/) - 素晴らしいノートアプリ
- [Electron](https://electronjs.org/) - クロスプラットフォーム開発フレームワーク

---

**Made with ❤️ for better life logging**