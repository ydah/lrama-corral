# CLAUDE.md - lrama-corral

## プロジェクト概要

**プロジェクト名**: lrama-corral

**目的**: Ruby製LALR(1)パーサージェネレーター「Lrama」の文法ファイル（.yファイル）をブラウザ上でビジュアルに編集できるWebアプリケーションを開発する。

**技術スタック**:
- Ruby Wasm（Lramaをブラウザで実行）
- GitHub Pages（ホスティング）
- フロントエンド: React or Vanilla JS + Monaco Editor

**リポジトリ**: ruby/lrama - https://github.com/ruby/lrama

---

## 対象ユーザー

1. **独自言語開発者** - Lramaを使って新しいプログラミング言語やDSLを作る開発者
2. **Ruby parse.y貢献者** - CRubyのパーサーに貢献したい開発者
3. **パーサー/コンパイラ学習者** - LALR構文解析を学んでいる学生・エンジニア

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│                Browser (GitHub Pages)                │
├─────────────────────────────────────────────────────┤
│  ┌───────────────────┐  ┌────────────────────────┐  │
│  │    UI Components   │  │    Monaco Editor       │  │
│  │    - ルール一覧     │  │    (.yファイル編集)     │  │
│  │    - 構造ビュー     │  │                        │  │
│  │    - エラー表示     │  │                        │  │
│  └─────────┬─────────┘  └───────────┬────────────┘  │
│            │                        │               │
│            ▼                        ▼               │
│  ┌─────────────────────────────────────────────┐    │
│  │            JavaScript Bridge                 │    │
│  │    - Ruby VM との通信                        │    │
│  │    - データ変換 (Ruby Object <-> JSON)       │    │
│  └──────────────────────┬──────────────────────┘    │
│                         │                           │
│                         ▼                           │
│  ┌─────────────────────────────────────────────┐    │
│  │         Ruby Wasm + Lrama gem                │    │
│  │    - .yファイルのパース                       │    │
│  │    - 文法の検証・エラー検出                   │    │
│  │    - Grammar構造データの生成                  │    │
│  │    - .yファイルの再生成                       │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

---

## 開発フェーズ

### Phase 1: 技術検証 - ✅ **完了**（モック実装）

**目標**: ブラウザ上で.yファイルの編集・パースができる基本UIを実装する

**実装状況**: 2025-12-21

Ruby Wasm統合の複雑さを考慮し、Phase 1ではモック実装でUIの動作確認を優先しました。
実際のLrama統合はPhase 2で実装予定です。

**完了したタスク**:

1. **プロジェクト基盤の構築**
   - [x] プロジェクト構造の作成
   - [x] package.json の作成（Vite、依存関係）
   - [x] Vite設定の構成
   - [x] Gemfile の作成（Phase 2用）
   - [x] .gitignore の設定

2. **フロントエンド実装**
   - [x] index.html の作成（シンプルなUI）
   - [x] テキストエディタ（textarea）
   - [x] Parse/Validateボタン
   - [x] 結果表示エリア（JSON）
   - [x] ステータス表示
   - [x] Favicon (SVG)

3. **パーサー実装（モック）**
   - [x] lrama-bridge-mock.js の実装
     - トークン抽出（%token）
     - ルール抽出（簡易的）
     - 非終端記号抽出
     - バリデーション（基本チェック）
   - [x] JavaScript統合（main.js）

4. **Ruby Wasm準備（Phase 2用）**
   - [x] lrama_api.rb の設計・実装
   - [x] lrama-bridge.js の実装
   - [x] build-wasm.sh スクリプトの作成

5. **ドキュメント**
   - [x] README.md の作成
   - [x] セットアップ手順の記載
   - [x] Phase 1/2の区別を明記

**成果物**:
- ✅ 動作するWeb UI（モック実装）
- ✅ プロジェクト構造
- ✅ セットアップドキュメント
- 🔄 Ruby Wasm統合（Phase 2へ延期）

**Phase 1で得られた知見**:
- Ruby Wasmでgemを含むビルドは複雑（jsonすら標準で含まれない）
- まずUIを動作させてフィードバックを得る方が効率的
- Phase 2でRuby Wasmビルドの最適化に注力すべき

---

### Phase 2: MVP（Minimum Viable Product）- ✅ **完了**（基本機能）

**目標**: 実際のLramaパーサーを統合し、実用的な文法ファイル編集環境を構築する

**優先順位の高いタスク**:

1. **Ruby Wasm統合（Phase 1からの移行）**
   - [x] Ruby Wasmビルド環境の最適化
     - 必要なgemを含むカスタムビルドの作成
     - json, lramaなどの依存関係の解決
   - [x] Lramaの実際のパース機能の統合
   - [x] エラーハンドリングの改善
   - [x] パフォーマンスの検証

2. **ファイル操作**
   - [x] .yファイルのアップロード（ドラッグ&ドロップ対応）
   - [x] サンプル.yファイルの読み込み（プリセット）
   - [x] 編集後の.yファイルのダウンロード

3. **テキストエディタの強化**
   - [x] Monaco Editor の統合
   - [x] Bison/Yacc シンタックスハイライト
   - [x] 基本的なコード補完

4. **構造ビューの実装**
   - [x] パース結果の構造的な表示
     - 終端記号（terminals）一覧
     - 非終端記号（nonterminals）一覧
     - ルール（rules/productions）一覧
     - 優先順位（precedence）情報
   - [x] ルールのクリックでエディタの該当行にジャンプ

5. **バリデーションの強化**
   - [x] 実際のLramaによる構文エラーの検出
   - [x] エラー位置情報の抽出と表示
   - [ ] エラーメッセージの日本語/英語対応（将来対応）

**非機能要件**:
- 初回ロード時間: 10秒以内（Wasmロード込み）
- パース処理: 1000行程度の.yファイルを1秒以内に処理
- オフライン動作可能（PWA化は将来検討）

**技術タスク**:
- [x] プロジェクト構造の決定
- [x] フロントエンドフレームワークの選定と導入（Vanilla JS + Vite）
- [x] Monaco Editor の設定
- [x] Ruby Wasm との通信レイヤー実装
- [x] UI コンポーネントの実装
- [x] GitHub Pages へのデプロイ設定（GitHub Actions）

**成果物**:
- ✅ 動作するWebアプリケーション（localhost:3002で稼働中）
- 🔄 GitHub Pages でのホスティング（設定完了、push待ち）
- ✅ README.md（使い方）

---

### Phase 3: GUI強化 - ✅ **完了**（UX改善 + ビジュアル編集）

**目標**: より直感的なビジュアル編集機能を追加する

**実装状況**: 2025-12-22

Phase 3では、UX改善、ビジュアル編集機能、および高度な分析機能を実装しました。

**完了したタスク**:

1. **ルールのビジュアル編集**
   - [x] ルールをカード/ノード形式で表示
     - グリッドレイアウト（自動調整）
     - 色分けされたシンボル表示（終端記号=緑、非終端記号=青）
     - ホバーエフェクト（影、ボーダー、移動）
     - Rule ID と行番号の表示
   - [x] フォームベースでのルール追加・編集
     - フローティングアクションボタン（FAB）
     - モーダルフォーム（LHS/RHSの編集）
     - シンボル管理（追加/削除）
     - Enterキー対応
     - エディタへの自動挿入・更新
   - [x] 終端記号/非終端記号の管理UI
     - テーブル形式での一覧表示
     - 編集/削除ボタン付き
     - モーダルフォームでの追加/編集
     - 型情報とトークンIDの管理

2. **高度な分析機能** - ✅ **完了** (2025-12-22)
   - [x] First集合の計算と表示
     - Lramaの内部APIを活用
     - 各非終端記号のFirst集合を計算
     - カード形式での視覚的表示
   - [x] Follow集合の計算と表示
     - LALR状態機械の構築
     - 各非終端記号のFollow集合を計算
     - カード形式での視覚的表示
   - [x] Shift/Reduce コンフリクトの検出と可視化
     - コンフリクト発生状態とトークンの特定
     - 関連するルールIDの表示
     - エラーカード形式での警告表示
   - [x] Reduce/Reduce コンフリクトの検出と可視化
     - コンフリクト発生状態とトークンの特定
     - 関連するルールIDの表示
     - エラーカード形式でのエラー表示

3. **構文図（Syntax Diagram）**（将来のPhase 4として検討）
   - [ ] Lramaの構文図生成機能との連携
   - [ ] インタラクティブな構文図表示
   - [ ] SVG/PNG エクスポート

4. **UX改善**
   - [x] Undo/Redo 機能
     - UIボタン（↶ Undo / ↷ Redo）
     - Monaco Editorの履歴と連動
     - 自動的な有効/無効切り替え
   - [x] キーボードショートカット
     - `Ctrl/Cmd + Enter`: Parse
     - `Ctrl/Cmd + Shift + Enter`: Validate
     - `Ctrl/Cmd + S`: Download
     - `Ctrl/Cmd + O`: Upload
     - Mac/Windows自動判定
   - [x] ダークモード対応
     - CSS変数による完全なテーマシステム
     - ライト/ダークの2つのテーマ
     - Monaco Editorテーマとの連携
     - LocalStorageによる設定の永続化
     - ヘッダーのトグルボタン
   - [x] レスポンシブデザイン
     - モバイル（480px以下）対応
     - タブレット（768px以下）対応
     - グリッドレイアウトの自動調整
     - ボタンサイズの最適化

**成果物**:
- ✅ ルールカード表示（カードビュー / ターミナルビュー切り替え）
- ✅ フォームベース編集UI（モーダル + FAB）
- ✅ シンボル管理UI（終端記号/非終端記号の追加・編集・削除）
- ✅ First/Follow集合の計算と表示
- ✅ Shift/Reduce コンフリクト検出と可視化
- ✅ Reduce/Reduce コンフリクト検出と可視化
- ✅ HTMLレポートエクスポート機能（First/Follow集合、コンフリクト情報を含む）
- ✅ ダークモード完全対応
- ✅ レスポンシブデザイン完全対応
- ✅ キーボードショートカット
- ✅ Undo/Redo UI

---

## ディレクトリ構造（案）

```
lrama-corral/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Pages デプロイ
├── public/
│   └── index.html
├── src/
│   ├── components/             # UIコンポーネント
│   │   ├── Editor.jsx          # Monaco Editor ラッパー
│   │   ├── RuleList.jsx        # ルール一覧
│   │   ├── SymbolList.jsx      # シンボル一覧
│   │   └── ErrorPanel.jsx      # エラー表示
│   ├── lib/
│   │   └── lrama-bridge.js     # Ruby Wasm との通信
│   ├── App.jsx
│   └── main.jsx
├── ruby/
│   ├── Gemfile                 # Lrama等の依存関係
│   ├── Gemfile.lock
│   └── src/
│       └── lrama_api.rb        # JSから呼び出すAPI
├── scripts/
│   └── build-wasm.sh           # Wasmビルドスクリプト
├── dist/                       # ビルド成果物
│   └── ruby.wasm
├── package.json
├── vite.config.js              # or webpack等
├── CLAUDE.md                   # この文書
└── README.md
```

---

## Ruby Wasm API 設計

### lrama_api.rb

JavaScriptから呼び出すRuby側のAPIを定義する。

```ruby
# ruby/src/lrama_api.rb
require 'json'
require 'lrama'

module LramaAPI
  class << self
    # .yファイルの内容をパースして構造を返す
    # @param source [String] .yファイルの内容
    # @return [String] JSON形式のパース結果
    def parse(source)
      # TODO: 実装
      # Lramaの内部APIを使用してパース
      # 結果をJSON形式で返す
    end

    # 文法の検証を行う
    # @param source [String] .yファイルの内容
    # @return [String] JSON形式のバリデーション結果
    def validate(source)
      # TODO: 実装
    end

    # 構造データから.yファイルを生成する
    # @param grammar_json [String] JSON形式の文法データ
    # @return [String] .yファイルの内容
    def generate(grammar_json)
      # TODO: 実装
    end
  end
end
```

### JavaScript Bridge

```javascript
// src/lib/lrama-bridge.js

class LramaBridge {
  constructor() {
    this.vm = null;
    this.ready = false;
  }

  async init() {
    // Ruby Wasm の初期化
    // TODO: 実装
  }

  async parse(source) {
    // LramaAPI.parse を呼び出し
    // TODO: 実装
  }

  async validate(source) {
    // LramaAPI.validate を呼び出し
    // TODO: 実装
  }
}

export const lramaBridge = new LramaBridge();
```

---

## パース結果のデータ構造（案）

```typescript
// TypeScript型定義（参考）

interface ParseResult {
  success: boolean;
  grammar?: Grammar;
  errors?: ParseError[];
}

interface Grammar {
  // プロローグ部分（%{ ... %}）
  prologue: string;
  
  // 宣言部分
  declarations: {
    tokens: Token[];           // %token
    types: TypeDecl[];         // %type
    precedences: Precedence[]; // %left, %right, %nonassoc
    start: string | null;      // %start
  };
  
  // ルール部分
  rules: Rule[];
  
  // エピローグ部分
  epilogue: string;
}

interface Token {
  name: string;
  type?: string;
  value?: number;
  location: Location;
}

interface Rule {
  lhs: string;              // 左辺（非終端記号）
  rhs: RhsElement[][];      // 右辺（複数の選択肢）
  action?: string;          // アクションコード
  location: Location;
}

interface RhsElement {
  symbol: string;
  type: 'terminal' | 'nonterminal';
  alias?: string;           // $name の形式
}

interface Location {
  line: number;
  column: number;
}

interface ParseError {
  message: string;
  location: Location;
  severity: 'error' | 'warning';
}
```

---

## 注意事項・制約

### Ruby Wasm の制約

1. **C拡張のgem は使用不可** - Pure Ruby gem のみ使用可能
2. **ファイルI/O制限** - 仮想ファイルシステム経由でのみアクセス
3. **ネットワークアクセス制限** - fetch API経由のみ

### Lrama の内部API

- Lramaの内部APIは変更される可能性がある
- 可能であればLrama側に安定したAPIを提案・実装することも検討

### ブラウザ互換性

- 対象: Chrome, Firefox, Safari, Edge の最新2バージョン
- WebAssembly と ES2020+ のサポートが必要

---

## 参考リンク

- [Lrama GitHub](https://github.com/ruby/lrama)
- [Lrama Documentation](https://ruby.github.io/lrama/)
- [ruby.wasm](https://github.com/ruby/ruby.wasm)
- [ruby.wasm Documentation](https://ruby.github.io/ruby.wasm/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Bison Manual](https://www.gnu.org/software/bison/manual/)

---

## 作業ログ

### 2025-12-21
- **Phase 1 完了（モック実装）**
  - プロジェクト構造の構築完了
  - フロントエンドUI実装完了（Vanilla JS + Vite）
  - モックパーサー実装完了（lrama-bridge-mock.js）
  - 基本的な.yファイルのパース・バリデーション機能を実装
  - README、CLAUDE.mdのドキュメント整備完了

- **技術的な課題と対応**
  - Ruby Wasmでのgem統合の複雑さを確認
  - json標準ライブラリすら含まれない問題に遭遇
  - Phase 1ではモック実装で先行、Phase 2でRuby Wasm統合を計画

- **次のステップ**
  - Phase 2でRuby Wasmビルドの最適化に取り組む
  - Monaco Editorの統合
  - 実際のLramaパーサーとの統合

### 2025-12-22
- **Phase 2 完了（基本機能実装）**
  - Ruby Wasm統合の完了
    - `grammar.start_symbol`メソッドの不在エラーを修正
    - 開始シンボルの適切な抽出ロジックを実装
    - デバッグコードのクリーンアップ

  - ファイル操作機能の実装
    - `.y`ファイルのダウンロード機能
    - ファイルアップロード機能（ボタンクリック）
    - ドラッグ&ドロップ対応（`.y`, `.yacc`, `.yy`ファイル）
    - ドラッグ時の視覚的フィードバック

  - 構造ビューの実装
    - トークン一覧（テーブル形式）
    - 非終端記号一覧（テーブル形式）
    - ルール一覧（シンタックスハイライト付き）
    - 開始シンボルの表示

  - エラーハンドリングの改善
    - エラー位置情報の抽出（行番号、カラム番号）
    - エラーメッセージの改善表示
    - バックトレースの簡略化

  - **Monaco Editorの統合（Phase 2で完了）**
    - Monaco Editorの初期化と設定
    - Yacc/Bison言語のシンタックスハイライト（Monarchトークナイザー）
    - カスタムテーマ設定（yacc-theme）
    - 基本的なコード補完機能
      - ディレクティブ補完（%token, %type, %left, %right等）
      - 区切り記号補完（%%）
      - ルールテンプレートスニペット
    - ルールクリックでエディタジャンプ機能
      - ルール一覧からワンクリックで該当行へジャンプ
      - ホバー時の視覚的フィードバック
    - ドラッグ&ドロップのMonaco Editor対応

- **技術的な成果**
  - SimpleJSONモジュールによるJSON生成（json gemなしでの動作）
  - Lramaの内部APIを活用した文法情報の抽出
  - ブラウザ上での完全なLramaパース機能の実現
  - Monaco Editorの完全統合（シンタックスハイライト、コード補完、ジャンプ機能）

- **Phase 2 完全完了**
  - すべての計画タスクが実装完了
  - GitHub Pagesへのデプロイ設定完了
  - 実用的なMVPとして機能

### 2025-12-22（続き）
- **Phase 3 完了（GUI強化：UX改善 + ビジュアル編集）**

  - **Phase 3.1: UX改善の実装**
    - ダークモード対応
      - CSS変数システム（`:root` と `[data-theme="dark"]`）
      - Monaco Editorテーマ連携（yacc-theme / yacc-theme-dark）
      - LocalStorageによる設定の永続化
      - ヘッダーにトグルボタン追加
    - レスポンシブデザイン
      - モバイル（480px以下）とタブレット（768px以下）の2つのブレークポイント
      - グリッドレイアウトの自動調整
      - ボタンサイズとレイアウトの最適化
    - キーボードショートカット
      - `Ctrl/Cmd + Enter`: Parse
      - `Ctrl/Cmd + Shift + Enter`: Validate
      - `Ctrl/Cmd + S`: Download
      - `Ctrl/Cmd + O`: Upload
      - Mac/Windows自動判定
    - Undo/Redo UI
      - ボタン追加（↶ Undo / ↷ Redo）
      - Monaco Editorの`canUndo()`/`canRedo()`と連動
      - 自動的な有効/無効切り替え

  - **Phase 3.2: ビジュアル編集の実装**
    - ルールカード表示
      - グリッドレイアウト（`grid-template-columns: repeat(auto-fill, minmax(400px, 1fr))`）
      - 色分けされたシンボル表示
        - 終端記号: 緑（`rgba(46, 204, 113, 0.15)`）
        - 非終端記号: 青（`rgba(52, 152, 219, 0.15)`）
        - 空ルール: グレー（イタリック体）
      - ホバーエフェクト（影、ボーダー色変更、上移動）
      - クリックでエディタの該当行にジャンプ
      - Rule ID と行番号の表示
    - 表示モード切り替え
      - カードビュー（ビジュアル表示）
      - ターミナルビュー（テキストベース表示）
      - トグルボタンでの切り替え
    - フォームベース編集UI
      - フローティングアクションボタン（FAB）
        - 右下固定配置
        - パース成功時のみ表示
        - 円形デザイン（60px × 60px）
      - モーダルフォーム
        - LHS入力フィールド
        - RHSシンボル管理（タグ形式）
        - シンボル追加/削除機能
        - Enterキーでシンボル追加
        - 保存/キャンセルボタン
        - モーダル外クリックで閉じる
      - 既存ルール編集
        - 各カードに「✏️ Edit」ボタン
        - 既存データの自動読み込み
        - エディタの該当行を更新
      - エディタ連携
        - `%%` セクションへの自動挿入
        - カーソルの自動移動
        - フォーカスの自動復帰

- **技術的な成果**
  - CSS変数による柔軟なテーマシステム
  - Monaco Editorの高度な履歴管理連携
  - レスポンシブなグリッドレイアウト
  - モダンなUI/UXパターン（FAB、モーダル、カード）
  - アクセシブルなキーボード操作

- **Phase 3 完全完了（UX改善 + ビジュアル編集 + 高度な分析機能）**
  - UX改善機能がすべて実装完了
  - ビジュアル編集の基本機能が実装完了
  - 高度な分析機能が実装完了
    - First/Follow集合の計算と表示
    - Shift/Reduce コンフリクトの検出と可視化
    - Reduce/Reduce コンフリクトの検出と可視化
  - シンボル管理UI（終端記号/非終端記号の追加・編集・削除）の実装完了

### 2025-12-22（Phase 3高度な分析機能の実装）
- **First/Follow集合とコンフリクト検出の実装**
  - lrama_api.rbの更新
    - `grammar.prepare`, `grammar.compute_nullable`, `grammar.compute_first_set`を呼び出し
    - Lrama::Statesの構築と`states.compute`の実行
    - First集合の抽出（非終端記号ごと）
    - Follow集合の抽出（非終端記号ごと）
  - コンフリクト検出の実装
    - Shift/Reduce コンフリクト
      - 発生状態とトークンの特定
      - 関連するルールIDの抽出
      - 警告レベル（warning）での表示
    - Reduce/Reduce コンフリクト
      - 発生状態とトークンの特定
      - 関連するルールIDの抽出（2つのルール）
      - エラーレベル（error）での表示
  - UI表示機能（既存）の活用
    - `createFirstFollowSection`によるFirst/Follow集合の視覚化
    - `createConflictsSection`によるコンフリクトの視覚化
    - カード形式での読みやすい表示
  - HTMLレポートエクスポート
    - First/Follow集合情報の含有
    - コンフリクト情報の含有
    - スタンドアロンHTMLファイルとして保存可能

- **技術的な成果**
  - LramaのLALR(1)状態機械構築機能の活用
  - First集合計算アルゴリズムの利用
  - Follow集合計算（Digraphアルゴリズム）の利用
  - コンフリクト検出ロジックの統合
  - エラーハンドリング（First/Follow計算エラー時も基本情報は返す）

- **Phase 3 完全完了**
  - すべての計画機能が実装完了
  - 高度な分析機能により、パーサー開発者に有用な情報を提供
  - 次のフェーズ（Phase 4）では構文図生成などを検討可能

---

## メモ・検討事項

- [ ] Lrama本体への貢献（安定API、Wasm対応）の可能性
- [ ] 多言語対応（i18n）の必要性
- [ ] アクセシビリティ対応
- [ ] テスト戦略（E2E, Unit）