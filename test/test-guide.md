# Phase 1 実装テストガイド

## 新機能のテスト方法

### 1. テスト用ファイルの準備

```typescript
// test/sample.txt を作成
await write_file({
  path: "test/sample.txt",
  content:
    "これはテスト用のファイルです。\nTODO: 何かを実装する\nFIXME: バグを修正する",
});

// test/sample2.txt を作成
await write_file({
  path: "test/sample2.txt",
  content: "別のテストファイル",
});
```

### 2. delete_file のテスト

```typescript
// ファイルを削除
await delete_file({
  path: "test/sample2.txt",
});

// 確認
await list_directory({ path: "test" });
// sample2.txt が削除されているはず
```

### 3. copy_file のテスト

```typescript
// ファイルをコピー
await copy_file({
  source: "test/sample.txt",
  destination: "test/sample_copy.txt",
  overwrite: false,
});

// 内容確認
await read_file({ path: "test/sample_copy.txt" });

// 上書きテスト
await copy_file({
  source: "test/sample.txt",
  destination: "test/sample_copy.txt",
  overwrite: true,
});
```

### 4. append_file のテスト

```typescript
// ファイルに追記
await append_file({
  path: "test/sample.txt",
  content: "追記されたテキスト",
  ensureNewline: true,
});

// 結果確認
await read_file({ path: "test/sample.txt" });

// 新規ファイルへの追記（ファイル作成）
await append_file({
  path: "test/new_file.txt",
  content: "新しいファイルの内容",
  ensureNewline: true,
});
```

### 5. search_content のテスト

```typescript
// キーワード検索
await search_content({
  path: "test",
  pattern: "TODO",
  caseSensitive: false,
  maxResults: 10,
});

// 正規表現検索
await search_content({
  path: "test",
  pattern: "(TODO|FIXME):",
  regex: true,
  caseSensitive: true,
});

// ファイルパターン付き検索
await search_content({
  path: ".",
  pattern: "async function",
  filePattern: ".ts",
  maxResults: 20,
});
```

## エラーケースのテスト

### 1. 存在しないファイルの削除

```typescript
await delete_file({ path: "test/not_exist.txt" });
// エラー: ENOENT
```

### 2. 上書き禁止でのコピー

```typescript
await copy_file({
  source: "test/sample.txt",
  destination: "test/sample_copy.txt",
  overwrite: false,
});
// エラー: Destination file already exists
```

### 3. 許可されていないディレクトリへのアクセス

```typescript
await search_content({
  path: "/etc",
  pattern: "password",
});
// エラー: Access denied
```

## 実際の使用例

### コードベース内のTODOを検索

```typescript
await search_content({
  path: "src",
  pattern: "TODO:",
  filePattern: ".ts",
  caseSensitive: false,
  maxResults: 50,
});
```

### ログファイルにエラーを追記

```typescript
await append_file({
  path: "logs/error.log",
  content: `[${new Date().toISOString()}] エラーが発生しました`,
  ensureNewline: true,
});
```

### バックアップの作成

```typescript
await copy_file({
  source: "config/settings.json",
  destination: "config/settings.backup.json",
  overwrite: true,
});
```
