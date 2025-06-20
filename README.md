Murmur: Electronを使ったパーソナルライフログ生成アプリ

概要

Murmurは、日常のアイデアやメモを音声入力で手軽にキャプチャし、OpenAIのAPIを通じて自動的にテキスト化・整形・推敲を行い、Obsidianに蓄積するElectronベースのデスクトップアプリケーションです。

主な機能
• 音声録音とテキスト化：
• ElectronのMediaRecorder APIで音声を録音し、OpenAIのWhisper APIで高精度にテキスト化。
• テキストの整形と推敲：
• OpenAIのGPT APIで音声入力を読みやすい形式に自動整形し、要約とタグ付けも実施。
• Obsidianへの自動保存：
• 整形されたテキストをMarkdown形式で既存のObsidian Vaultに直接保存。

アーキテクチャ

Electronアプリ
├─ レンダラープロセス (Reactなど)
│ └─ UIとユーザーインタラクション
└─ メインプロセス (Node.js)
├─ 音声録音処理 (MediaRecorder)
├─ OpenAI API通信 (Whisper, GPT)
└─ Obsidianへのファイル保存 (Markdown)

## 必要条件
• **Node.js** (v16 以上)
• **OpenAI APIキー** - 音声認識とテキスト整形に使用
• **Obsidian** - ライフログの保存先として使用

## 🚀 クイックスタート

### 1. インストール
```bash
git clone https://github.com/your-username/murmur.git
cd murmur
npm install
```

### 2. 初期設定
アプリを初回起動すると、設定ウィザードが表示されます：

```bash
npm run dev
```

設定ウィザードで以下を設定してください：
- **OpenAI APIキー**: [OpenAI Platform](https://platform.openai.com/api-keys)で取得
- **Obsidian Vaultパス**: ライフログを保存するObsidianフォルダ

### 3. 環境変数設定（オプション）
設定ウィザードでも`.env`ファイル作成を案内されますが、手動で作成する場合：

```bash
cp .env.example .env
```

`.env`ファイルを編集：
```bash
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Obsidian Configuration
OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault

# App Configuration
NODE_ENV=development
```

### 4. 開発コマンド
```bash
# アプリを開発モードで起動
npm run dev

# コード品質チェック
make quality

# アプリをビルド
npm run build
```

実装手順

Step 1: Electronアプリのセットアップ
• Electronの基本構造をセットアップし、必要なNode.jsライブラリ（axios、dotenvなど）をインストール。

Step 2: 音声録音インターフェイス
• ElectronのMediaRecorder APIを利用して、ブラウザ上で音声を録音。

Step 3: Whisper API連携
• 録音した音声をOpenAIのWhisper APIに送信してテキスト化。

Step 4: GPT APIを使った整形
• Whisperから取得したテキストをGPT APIに送信し、読みやすく整形・要約。

Step 5: Markdownファイル生成と保存
• GPT APIのレスポンスをMarkdownファイルとしてObsidianのVaultに保存。

将来的な拡張案
• 画像やスクリーンショットの自動テキスト化
• 週次・月次レポートの自動生成
• スマートホーム連携による環境ログ
• 特定キーワードによるリアルタイム通知機能

活用例
• 瞬間的なアイデアやメモの記録
• 日々の振り返りと生活ログ
• プロジェクトや創作活動のインスピレーション整理

ライセンス

このプロジェクトはMITライセンスで提供されています。自由に活用・改変が可能です。
