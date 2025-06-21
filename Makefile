# Murmur - Electronアプリ開発用Makefile (pnpm版)
# CLAUDE.mdに従った開発ツール統合 + pnpm最適化

.PHONY: help install dev build clean lint format type-check test test-cov quality quality-fix pr-ready git-hooks env-info migrate-to-pnpm

# デフォルトターゲット
.DEFAULT_GOAL := help

# パッケージマネージャー設定
PKG_MANAGER := pnpm
NODE := node

# カラー出力
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
BLUE := \033[34m
RESET := \033[0m

## 📋 利用可能なコマンド
help: ## 📋 このヘルプメッセージを表示
	@echo "$(BLUE)Murmur 開発コマンド (pnpm版)$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'

## 🚀 クイックスタート
dev: ## 🚀 開発モード（ビルド+起動）
	@echo "$(GREEN)🚀 開発モード開始...$(RESET)"
	$(PKG_MANAGER) run dev

## 📦 依存関係管理
install: ## 📦 依存関係をインストール
	@echo "$(GREEN)📦 依存関係をインストール中...$(RESET)"
	$(PKG_MANAGER) install

install-frozen: ## 📦 ロックファイルから厳密にインストール（CI用）
	@echo "$(GREEN)📦 厳密インストール中...$(RESET)"
	$(PKG_MANAGER) install --frozen-lockfile

## 🔄 pnpm移行
migrate-to-pnpm: ## 🔄 NPMからpnpmに移行
	@echo "$(YELLOW)🔄 pnpmへの移行を開始...$(RESET)"
	@if command -v pnpm >/dev/null 2>&1; then \
		echo "$(GREEN)✅ pnpmが利用可能です$(RESET)"; \
	else \
		echo "$(RED)❌ pnpmがインストールされていません$(RESET)"; \
		echo "$(YELLOW)インストール方法:$(RESET)"; \
		echo "  npm install -g pnpm"; \
		echo "  または brew install pnpm"; \
		exit 1; \
	fi
	@if [ -f package-lock.json ]; then \
		echo "$(YELLOW)🗑️  package-lock.jsonを削除...$(RESET)"; \
		rm package-lock.json; \
	fi
	@if [ -d node_modules ]; then \
		echo "$(YELLOW)🗑️  node_modulesを削除...$(RESET)"; \
		rm -rf node_modules; \
	fi
	@echo "$(GREEN)📦 pnpmで依存関係をインストール...$(RESET)"
	pnpm install
	@echo "$(GREEN)✅ pnpm移行完了！$(RESET)"

## 🏗️ ビルド
build: ## 🏗️ TypeScriptをビルド
	@echo "$(GREEN)🏗️ TypeScriptビルド中...$(RESET)"
	$(PKG_MANAGER) run build:ts

build-watch: ## 🏗️ TypeScriptを監視モードでビルド
	@echo "$(GREEN)🏗️ TypeScript監視ビルド中...$(RESET)"
	$(PKG_MANAGER) run build:watch

dist: ## 📦 配布用パッケージをビルド
	@echo "$(GREEN)📦 配布用ビルド中...$(RESET)"
	$(PKG_MANAGER) run dist

## 🧹 クリーンアップ
clean: ## 🧹 ビルドファイルをクリーンアップ
	@echo "$(GREEN)🧹 クリーンアップ中...$(RESET)"
	rm -rf dist/
	rm -rf build/
	rm -rf coverage/
	@echo "$(GREEN)✅ クリーンアップ完了$(RESET)"

clean-all: ## 🧹 すべて（node_modules含む）をクリーンアップ
	@echo "$(GREEN)🧹 完全クリーンアップ中...$(RESET)"
	rm -rf dist/
	rm -rf build/
	rm -rf coverage/
	rm -rf node_modules/
	rm -f pnpm-lock.yaml
	@echo "$(GREEN)✅ 完全クリーンアップ完了$(RESET)"

## 🔍 品質チェック
lint: ## 🔍 ESLintチェック
	@echo "$(GREEN)🔍 ESLintチェック中...$(RESET)"
	$(PKG_MANAGER) run lint

lint-fix: ## 🔧 ESLint自動修正
	@echo "$(GREEN)🔧 ESLint自動修正中...$(RESET)"
	$(PKG_MANAGER) run lint:fix

format: ## 🎨 コードフォーマット
	@echo "$(GREEN)🎨 Prettierフォーマット中...$(RESET)"
	$(PKG_MANAGER) run format

format-check: ## 🎨 フォーマットチェック
	@echo "$(GREEN)🎨 フォーマットチェック中...$(RESET)"
	$(PKG_MANAGER) run format:check

type-check: ## 🔍 タイプチェック
	@echo "$(GREEN)🔍 タイプチェック中...$(RESET)"
	$(PKG_MANAGER) run type-check

## 🧪 テスト
test: ## 🧪 単体テストを実行
	@echo "$(GREEN)🧪 単体テストを実行中...$(RESET)"
	$(PKG_MANAGER) test

test-watch: ## 🧪 テストを監視モードで実行
	@echo "$(GREEN)🧪 テスト監視モード中...$(RESET)"
	$(PKG_MANAGER) run test:watch

test-cov: ## 🧪 カバレッジ付きテストを実行
	@echo "$(GREEN)🧪 カバレッジ付きテストを実行中...$(RESET)"
	$(PKG_MANAGER) run test:coverage

test-ci: ## 🧪 CI用テスト実行
	@echo "$(GREEN)🧪 CI用テストを実行中...$(RESET)"
	$(PKG_MANAGER) run test:ci

test-e2e: ## 🧪 E2Eテスト実行
	@echo "$(GREEN)🧪 E2Eテストを実行中...$(RESET)"
	$(PKG_MANAGER) run test:e2e

test-all: ## 🧪 全テスト実行
	@echo "$(GREEN)🧪 全テストを実行中...$(RESET)"
	$(PKG_MANAGER) run test:all

## 🎯 統合品質チェック
quality: ## 🎯 統合品質チェック（lint + format-check + type-check + test-cov）
	@echo "$(BLUE)🎯 統合品質チェックを開始...$(RESET)"
	$(MAKE) lint
	$(MAKE) format-check
	$(MAKE) type-check
	$(MAKE) test-cov
	@echo "$(GREEN)✅ 品質チェック完了$(RESET)"

quality-fix: ## 🎯 品質問題を自動修正してチェック
	@echo "$(BLUE)🎯 品質自動修正を開始...$(RESET)"
	$(MAKE) lint-fix
	$(MAKE) format
	$(MAKE) type-check
	$(MAKE) test-cov
	@echo "$(GREEN)✅ 品質修正完了$(RESET)"

## 🚀 プロダクション準備
pr-ready: ## 🚀 PR準備（品質チェック + ビルドテスト）
	@echo "$(BLUE)🚀 PR準備チェックを開始...$(RESET)"
	$(MAKE) quality
	$(MAKE) build
	$(MAKE) dist
	@echo "$(GREEN)✅ PR準備完了$(RESET)"

## 🔧 開発環境セットアップ
git-hooks: ## 🔧 Git hooksをセットアップ
	@echo "$(GREEN)🔧 Git hooksセットアップ中...$(RESET)"
	@if [ ! -d .git/hooks ]; then \
		echo "$(RED)❌ Gitリポジトリではありません$(RESET)"; \
		exit 1; \
	fi
	@echo "#!/bin/sh\nmake quality-fix" > .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "$(GREEN)✅ Pre-commit hookを設定しました$(RESET)"

## 📊 環境情報
env-info: ## 📊 開発環境情報を表示
	@echo "$(BLUE)📊 開発環境情報$(RESET)"
	@echo "$(YELLOW)Node.js:$(RESET) $$(node --version)"
	@echo "$(YELLOW)pnpm:$(RESET) $$(pnpm --version 2>/dev/null || echo 'Not installed')"
	@echo "$(YELLOW)npm:$(RESET) $$(npm --version)"
	@echo "$(YELLOW)OS:$(RESET) $$(uname -s)"
	@echo "$(YELLOW)Platform:$(RESET) $$(uname -m)"
	@if [ -f pnpm-lock.yaml ]; then \
		echo "$(YELLOW)パッケージマネージャー:$(RESET) pnpm ✅"; \
	elif [ -f package-lock.json ]; then \
		echo "$(YELLOW)パッケージマネージャー:$(RESET) npm (pnpm移行推奨)"; \
	else \
		echo "$(YELLOW)パッケージマネージャー:$(RESET) 不明"; \
	fi

## 🔄 pnpm最適化コマンド
pnpm-prune: ## 🔄 pnpmストアをクリーンアップ
	@echo "$(GREEN)🔄 pnpmストアクリーンアップ中...$(RESET)"
	pnpm store prune

pnpm-audit: ## 🔍 pnpmセキュリティ監査
	@echo "$(GREEN)🔍 pnpmセキュリティ監査中...$(RESET)"
	pnpm audit

pnpm-update: ## 📦 依存関係を安全にアップデート
	@echo "$(GREEN)📦 依存関係アップデート中...$(RESET)"
	pnpm update

pnpm-outdated: ## 📊 古い依存関係をチェック
	@echo "$(GREEN)📊 古い依存関係チェック中...$(RESET)"
	pnpm outdated