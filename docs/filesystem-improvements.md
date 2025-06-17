# Filesystem MCP Server 改善提案

## 概要
Claude Opus 4の視点から、既存のfilesystem MCPサーバー実装に対する改善提案をまとめました。

## 主な改善点

### 1. 新規ツールの追加

#### 基本操作の強化
- **delete_file**: 明示的なファイル削除（確認機能付き）
- **copy_file**: ファイルコピー（上書きオプション付き）
- **append_file**: ファイル追記（改行制御付き）

#### 高度な検索機能
- **search_content**: grep的なファイル内容検索
  - 正規表現サポート
  - 大文字小文字の制御
  - コンテキスト行表示
  - ファイルパターンフィルタ

#### 開発支援機能
- **watch_file**: ファイル変更監視
- **batch_operations**: 複数操作の一括実行
- **checksum**: ファイルハッシュ値計算

### 2. 既存ツールの機能拡張

#### edit_fileの強化
```typescript
// 行番号指定での編集
{
  type: "line",
  lineNumber: 42,
  content: "新しい内容",
  action: "replace" | "insert" | "delete"
}

// 正規表現による置換
{
  type: "regex",
  pattern: "TODO:\\s*(.+)",
  replacement: "DONE: $1",
  flags: "gi"
}
```

#### read_fileの部分読み込み
- バイト範囲指定（大きなファイル対応）
- 行範囲指定
- エンコーディング指定（utf-8, base64, hex）

### 3. MCP標準への準拠

#### アノテーションの追加
```typescript
annotations: {
  title: "ファイル読み取り",
  readOnlyHint: true,      // 読み取り専用
  idempotentHint: true,    // 冪等性あり
  openWorldHint: false,    // 外部リソースアクセスなし
  costHint: "low"          // 処理コスト
}
```

### 4. セキュリティとパフォーマンス

#### セキュリティ強化
- レート制限の実装
- 操作履歴の記録
- より詳細な権限制御

#### パフォーマンス最適化
- ストリーミング処理（大きなファイル）
- バッチ操作のトランザクション処理
- 非同期処理の最適化

## 実装優先順位

### Phase 1（すぐに実装すべき）
1. **delete_file** - 明示的な削除操作
2. **copy_file** - 基本的なコピー機能
3. **search_content** - ファイル内容検索

### Phase 2（次に実装）
1. **append_file** - ファイル追記
2. edit_fileの行番号/正規表現対応
3. アノテーションの追加

### Phase 3（将来的に検討）
1. watch_file（ファイル監視）
2. batch_operations（バッチ処理）
3. 圧縮・解凍機能

## 実装のポイント

### エラーハンドリング
- より詳細なエラーメッセージ
- エラーコードの標準化
- リトライ可能なエラーの識別

### ロギングとモニタリング
```typescript
interface OperationLog {
  timestamp: Date;
  tool: string;
  args: any;
  result: "success" | "error";
  duration: number;
  error?: string;
}
```

### 型安全性の向上
- Zodスキーマの活用
- ユニオン型による柔軟な入力
- 厳密な出力型定義

## 互換性の維持

既存のツールインターフェースは変更せず、新機能は追加的に実装することで、後方互換性を維持します。

## テスト戦略

1. 単体テスト：各ツールの個別テスト
2. 統合テスト：ツール間の連携テスト
3. セキュリティテスト：パス検証のテスト
4. パフォーマンステスト：大きなファイル処理

## まとめ

これらの改善により、filesystem MCPサーバーは：
- より豊富な機能を提供
- 開発者の生産性を向上
- セキュリティと信頼性を強化
- 最新のMCP標準に準拠

実装は段階的に進め、各フェーズでフィードバックを収集しながら改善を続けることを推奨します。
