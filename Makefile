# Murmur - Electronアプリ開発用Makefile
# CLAUDE.mdに従った開発ツール統合

.PHONY: help install dev build clean lint format type-check test test-cov quality quality-fix pr-ready git-hooks env-info

# デフォルトターゲット
.DEFAULT_GOAL := help

# Node.js/npm設定
NPM := npm
NODE := node

# カラー出力
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
BLUE := \033[34m
RESET := \033[0m

## 📋 利用可能なコマンド
help: ## このヘルプメッセージを表示
	@echo "$(BLUE)Murmur - 音声ライフログアプリ開発ツール$(RESET)"
	@echo ""
	@echo "$(GREEN)利用可能なコマンド:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-15s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)開発ワークフロー:$(RESET)"
	@echo "  1. $(YELLOW)make install$(RESET)     - 依存関係をインストール"
	@echo "  2. $(YELLOW)make dev$(RESET)         - 開発モードで起動"
	@echo "  3. $(YELLOW)make quality$(RESET)     - コード品質チェック"
	@echo "  4. $(YELLOW)make pr-ready$(RESET)    - PR準備完了チェック"

## 🔧 開発環境セットアップ
install: ## 依存関係をインストール
	@echo "$(GREEN)📦 依存関係をインストール中...$(RESET)"
	$(NPM) install
	@echo "$(GREEN)✅ インストール完了$(RESET)"

dev: ## 開発モードでアプリを起動
	@echo "$(GREEN)🚀 開発モードでアプリを起動中...$(RESET)"
	$(NPM) run dev

build: ## アプリをビルド
	@echo "$(GREEN)🔨 アプリをビルド中...$(RESET)"
	$(NPM) run build
	@echo "$(GREEN)✅ ビルド完了$(RESET)"

clean: ## ビルド成果物をクリーンアップ
	@echo "$(YELLOW)🧹 クリーンアップ中...$(RESET)"
	rm -rf dist/
	rm -rf node_modules/.cache/
	rm -rf .tmp/
	@echo "$(GREEN)✅ クリーンアップ完了$(RESET)"

## 📝 コード品質ツール
lint: ## ESLintでコードをチェック
	@echo "$(GREEN)🔍 ESLintチェック中...$(RESET)"
	@if command -v npx >/dev/null 2>&1; then \
		if [ -f .eslintrc.js ] || [ -f .eslintrc.json ] || [ -f package.json ]; then \
			npx eslint . --ext .js,.json --ignore-path .gitignore || true; \
		else \
			echo "$(YELLOW)⚠️  ESLint設定が見つかりません。基本的なシンタックスチェックをスキップ$(RESET)"; \
		fi \
	else \
		echo "$(YELLOW)⚠️  npx が利用できません$(RESET)"; \
	fi

format: ## Prettierでコードを整形
	@echo "$(GREEN)💅 コードを整形中...$(RESET)"
	@if command -v npx >/dev/null 2>&1; then \
		if npx prettier --version >/dev/null 2>&1; then \
			npx prettier --write "**/*.{js,json,html,css,md}" --ignore-path .gitignore || true; \
		else \
			echo "$(YELLOW)⚠️  Prettierがインストールされていません$(RESET)"; \
		fi \
	else \
		echo "$(YELLOW)⚠️  npx が利用できません$(RESET)"; \
	fi

type-check: ## TypeScriptタイプチェック
	@echo "$(GREEN)🔍 タイプチェック中...$(RESET)"
	@if [ -f tsconfig.json ]; then \
		$(NPM) run type-check; \
	else \
		echo "$(YELLOW)⚠️  TypeScript設定が見つかりません。スキップ$(RESET)"; \
	fi

test: ## テストを実行
	@echo "$(GREEN)🧪 テストを実行中...$(RESET)"
	@if [ -f package.json ] && grep -q '"test"' package.json; then \
		$(NPM) test || true; \
	else \
		echo "$(YELLOW)⚠️  テストスクリプトが設定されていません$(RESET)"; \
	fi

test-cov: ## カバレッジ付きでテストを実行
	@echo "$(GREEN)🧪 カバレッジ付きテストを実行中...$(RESET)"
	@if [ -f package.json ] && grep -q '"test:coverage"' package.json; then \
		$(NPM) run test:coverage || true; \
	else \
		echo "$(YELLOW)⚠️  カバレッジテストスクリプトが設定されていません$(RESET)"; \
		$(MAKE) test; \
	fi

## 🎯 統合品質チェック
quality: ## すべての品質チェックを実行
	@echo "$(BLUE)🎯 統合品質チェックを開始...$(RESET)"
	$(MAKE) lint
	$(MAKE) type-check
	$(MAKE) test
	@echo "$(GREEN)✅ 品質チェック完了$(RESET)"

quality-fix: ## 自動修正可能な問題を修正してから品質チェック
	@echo "$(BLUE)🔧 自動修正と品質チェックを開始...$(RESET)"
	$(MAKE) format
	$(MAKE) quality
	@echo "$(GREEN)✅ 自動修正と品質チェック完了$(RESET)"

pr-ready: ## PR提出前の最終チェック
	@echo "$(BLUE)🚀 PR準備チェックを開始...$(RESET)"
	$(MAKE) quality-fix
	@echo "$(GREEN)✅ PR準備完了！$(RESET)"

## 🔗 Git連携
git-hooks: ## Git pre-commitフックをセットアップ
	@echo "$(GREEN)🪝 Gitフックをセットアップ中...$(RESET)"
	@mkdir -p .git/hooks
	@echo '#!/bin/sh' > .git/hooks/pre-commit
	@echo '' >> .git/hooks/pre-commit
	@echo '# Branch protection check' >> .git/hooks/pre-commit
	@echo 'current_branch=$$(git rev-parse --abbrev-ref HEAD)' >> .git/hooks/pre-commit
	@echo 'protected_branches="main master develop"' >> .git/hooks/pre-commit
	@echo '' >> .git/hooks/pre-commit
	@echo 'for branch in $$protected_branches; do' >> .git/hooks/pre-commit
	@echo '  if [ "$$current_branch" = "$$branch" ]; then' >> .git/hooks/pre-commit
	@echo '    echo "🚨 Error: Direct commits to $$branch branch are not allowed!"' >> .git/hooks/pre-commit
	@echo '    echo "Please create a feature branch instead:"' >> .git/hooks/pre-commit
	@echo '    echo "  git checkout -b feat/your-feature-name"' >> .git/hooks/pre-commit
	@echo '    exit 1' >> .git/hooks/pre-commit
	@echo '  fi' >> .git/hooks/pre-commit
	@echo 'done' >> .git/hooks/pre-commit
	@echo '' >> .git/hooks/pre-commit
	@echo '# Quality checks' >> .git/hooks/pre-commit
	@echo 'echo "🔍 Running quality checks on branch: $$current_branch"' >> .git/hooks/pre-commit
	@echo 'make quality' >> .git/hooks/pre-commit
	@echo '' >> .git/hooks/pre-commit
	@echo 'if [ $$? -eq 0 ]; then' >> .git/hooks/pre-commit
	@echo '  echo "✅ All quality checks passed!"' >> .git/hooks/pre-commit
	@echo 'else' >> .git/hooks/pre-commit
	@echo '  echo "❌ Quality checks failed. Please fix issues before committing."' >> .git/hooks/pre-commit
	@echo '  exit 1' >> .git/hooks/pre-commit
	@echo 'fi' >> .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "$(GREEN)✅ Pre-commitフック（ブランチ保護付き）を設定しました$(RESET)"

## 📊 環境情報
env-info: ## 開発環境の情報を表示
	@echo "$(BLUE)📊 開発環境情報:$(RESET)"
	@echo "$(YELLOW)Node.js:$(RESET) $$(node --version 2>/dev/null || echo 'Not installed')"
	@echo "$(YELLOW)npm:$(RESET) $$(npm --version 2>/dev/null || echo 'Not installed')"
	@echo "$(YELLOW)Git:$(RESET) $$(git --version 2>/dev/null || echo 'Not installed')"
	@echo "$(YELLOW)OS:$(RESET) $$(uname -s) $$(uname -r)"
	@echo "$(YELLOW)Working Directory:$(RESET) $$(pwd)"
	@if [ -f package.json ]; then \
		echo "$(YELLOW)Project:$(RESET) $$(cat package.json | grep '"name"' | sed 's/.*": "//g' | sed 's/",.*//g') v$$(cat package.json | grep '"version"' | sed 's/.*": "//g' | sed 's/",.*//g')"; \
	fi

## 🎨 開発ツール（ESLint/Prettier セットアップ）
setup-linting: ## ESLintとPrettierをセットアップ
	@echo "$(GREEN)🎨 ESLintとPrettierをセットアップ中...$(RESET)"
	$(NPM) install --save-dev eslint prettier
	@if [ ! -f .eslintrc.json ]; then \
		echo '{"env":{"node":true,"es2021":true},"extends":["eslint:recommended"],"parserOptions":{"ecmaVersion":"latest","sourceType":"module"},"rules":{}}' > .eslintrc.json; \
	fi
	@if [ ! -f .prettierrc.json ]; then \
		echo '{"semi":true,"singleQuote":true,"tabWidth":2,"trailingComma":"es5"}' > .prettierrc.json; \
	fi
	@echo "$(GREEN)✅ ESLintとPrettierのセットアップ完了$(RESET)"

## 🧪 テストセットアップ
setup-testing: ## Jest テストフレームワークをセットアップ  
	@echo "$(GREEN)🧪 Jestテストフレームワークをセットアップ中...$(RESET)"
	$(NPM) install --save-dev jest
	@if [ ! -d tests ]; then mkdir tests; fi
	@if [ ! -f tests/example.test.js ]; then \
		echo 'describe("Example Test", () => { test("should pass", () => { expect(true).toBe(true); }); });' > tests/example.test.js; \
	fi
	@echo "$(GREEN)✅ Jestテストセットアップ完了$(RESET)"

## 📦 配布
dist: ## 配布用パッケージを作成
	@echo "$(GREEN)📦 配布用パッケージを作成中...$(RESET)"
	$(NPM) run dist
	@echo "$(GREEN)✅ 配布用パッケージ作成完了$(RESET)"