/**
 * Shell MCP サーバーの定数定義
 */

/**
 * 許可されたコマンドのデフォルトセット
 */
export const DEFAULT_ALLOWED_COMMANDS = new Set([
  // パッケージマネージャー
  "npm",
  "yarn",
  "pnpm",
  "bun",
  // バージョン管理
  "git",
  // ファイルシステム
  "ls",
  "dir",
  "find",
  "mkdir",
  "rmdir",
  "cp",
  "mv",
  "rm",
  "cat",
  // 開発ツール
  "node",
  "python",
  "python3",
  "tsc",
  "eslint",
  "prettier",
  // ビルドツール
  "make",
  "cargo",
  "go",
  // コンテナツール
  "docker",
  "docker-compose",
  // その他のユーティリティ
  "echo",
  "touch",
  "grep",
]);

/**
 * デフォルトの最大タイムアウト（60秒）
 */
export const DEFAULT_MAX_TIMEOUT = 60000;

/**
 * デフォルトの最大出力サイズ（1MB）
 */
export const DEFAULT_MAX_OUTPUT_SIZE_MB = 1;

/**
 * 末尾バッファのデフォルトサイズ（10KB）
 */
export const DEFAULT_TAIL_BUFFER_SIZE = 10240;

/**
 * タイムアウト時の終了コード（GNU timeout互換）
 */
export const TIMEOUT_EXIT_CODE = 124;

/**
 * ストリーミングモードのデフォルトタイムアウト（10秒）
 * 通常のコマンドが完了するのに十分な時間を確保しつつ、
 * 長時間実行されるコマンドの出力を適切なタイミングで取得
 */
export const DEFAULT_STREAMING_TIMEOUT = 10000;

/**
 * ストリーミングモードのデフォルトバッファサイズ（100KB）
 */
export const DEFAULT_STREAMING_BUFFER_SIZE_KB = 100;

/**
 * ストリーミング結果の終了コード
 */
export const STREAMING_EXIT_CODE = -1;

/**
 * ツール名の定義
 */
export const ShellTools = {
  EXECUTE: "shell_execute",
  GET_ALLOWED_COMMANDS: "shell_get_allowed_commands",
} as const;

/**
 * エラーメッセージテンプレート
 */
export const ErrorMessages = {
  COMMAND_NOT_SPECIFIED: "Command not specified",
  COMMAND_NOT_ALLOWED: (command: string, allowed: string[]) =>
    `Command not allowed: ${command}\nAllowed commands: ${allowed.join(", ")}\nCheck command spelling or request additional commands if needed`,
  CD_NOT_SUPPORTED: (baseDir: string) =>
    `'cd' command not supported. Each command runs in isolation.\n` +
    `Use 'cwd' parameter instead:\n` +
    `Example: {"command": "ls", "cwd": "./src"}\n` +
    `Base directory: ${baseDir}`,
  DIRECTORY_OUTSIDE_BASE: (cwd: string, base: string, resolved: string) =>
    `Directory ${cwd} outside allowed base\nBase: ${base}\nResolved: ${resolved}`,
  DIRECTORY_NOT_FOUND: (resolved: string, cwd: string, base: string) =>
    `Directory not found: ${resolved}\nSpecified: ${cwd}\nBase: ${base}`,
  OUTPUT_TRUNCATED: "\n[Output truncated - showing first/last portions]\n[...middle omitted...]\n",
  ERROR_OUTPUT_TRUNCATED:
    "\n[Error truncated - showing first/last portions]\n[...middle omitted...]\n",
} as const;

/**
 * サーバー情報
 */
export const SERVER_INFO = {
  name: "mcp-shell",
  version: "1.0.0",
} as const;
