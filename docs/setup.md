# Filesystem MCP Server - インストールと実行

## ビルド方法

```bash
# 依存関係のインストール
bun install

# TypeScriptのコンパイル（必要な場合）
bun run build
```

## MCPサーバーの設定

Claude Desktop の設定ファイル（`claude_desktop_config.json`）に以下を追加：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": [
        "/Users/tk427/Documents/claude-ts-mcps/src/filesystem.ts",
        "/Users/tk427/Documents/claude-ts-mcps"
      ]
    }
  }
}
```

または bun を使用する場合：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "bun",
      "args": [
        "run",
        "/Users/tk427/Documents/claude-ts-mcps/src/filesystem.ts",
        "/Users/tk427/Documents/claude-ts-mcps"
      ]
    }
  }
}
```

## 動作確認

1. Claude Desktop を再起動
2. 新しいチャットを開始
3. ツールアイコンから以下の新しいツールが表示されることを確認：
   - delete_file
   - copy_file
   - append_file
   - search_content

## トラブルシューティング

### エラー: Cannot find module
```bash
# node_modules を再インストール
rm -rf node_modules
bun install
```

### エラー: Permission denied
指定したディレクトリへのアクセス権限があることを確認してください。

### ツールが表示されない
1. Claude Desktop を完全に終了（Cmd+Q / Ctrl+Q）
2. 設定ファイルのパスが正しいことを確認
3. Claude Desktop を再起動
