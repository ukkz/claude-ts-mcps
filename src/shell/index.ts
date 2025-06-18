/**
 * Shell MCP サーバーのメインエントリーポイント
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseArgs } from "node:util";
import * as fs from "fs";

import { ShellExecutor } from "./executor";
import { loadUserShellEnvironment } from "./environment";
import {
  ShellExecuteSchema,
  GetAllowedCommandsSchema,
  createExecuteHandler,
  createGetAllowedCommandsHandler,
} from "./tools";
import { ShellTools, SERVER_INFO } from "./constants";

/**
 * コマンドライン引数をパース
 */
const { values } = parseArgs({
  options: {
    baseDir: {
      type: "string",
      short: "d",
    },
    verbose: {
      type: "boolean",
      short: "v",
      default: false,
    },
    help: {
      type: "boolean",
      short: "h",
      default: false,
    },
  },
  allowPositionals: true,
});

// ヘルプメッセージを表示
if (values.help) {
  console.log(`Shell MCP Server v${SERVER_INFO.version}
`);
  console.log("Usage: shell-mcp [options]");
  console.log("\nOptions:");
  console.log(
    "  -d, --baseDir <dir>  Base directory for command execution (default: current directory)",
  );
  console.log("  -v, --verbose        Enable verbose logging");
  console.log("  -h, --help           Show this help message");
  process.exit(0);
}

const baseDirectory = values.baseDir || process.cwd();
const verbose = values.verbose;

// ログレベルを設定
const logLevel = verbose ? "debug" : "info";

/**
 * ログ出力関数
 */
function log(level: string, ...args: any[]) {
  if (level === "debug" && logLevel !== "debug") return;
  console.error(`[${level.toUpperCase()}]`, ...args);
}

/**
 * メインエントリーポイント
 */
async function main() {
  try {
    // 基準ディレクトリの存在確認
    if (!fs.existsSync(baseDirectory)) {
      console.error(`Error: Base directory ${baseDirectory} does not exist.`);
      process.exit(1);
    }

    // ユーザーのシェル環境変数を読み込み
    const userEnv = loadUserShellEnvironment(verbose as boolean);

    // ShellExecutorインスタンスを作成
    const shellExecutor = new ShellExecutor({
      baseDirectory,
      shellEnvironment: userEnv,
    });

    // MCPサーバーを初期化
    const server = new McpServer({
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
    });

    // ツールを定義
    server.tool(
      ShellTools.EXECUTE,
      "Execute shell commands for development tasks. You can use either: 1) command='git add .' (complete command string - recommended), or 2) command='git' args=['add', '.']. **IMPORTANT: Directory navigation must be done using the 'cwd' parameter, NOT with 'cd' commands. The 'cd' command will have no effect as each command runs in isolation.** Supports package managers (npm, pnpm, yarn, bun), git, file operations, and dev tools (node, python, tsc). Runs in controlled environment with security restrictions. Each command execution is stateless - use 'cwd' parameter to set working directory.",
      ShellExecuteSchema.shape,
      createExecuteHandler(shellExecutor, baseDirectory),
    );

    server.tool(
      ShellTools.GET_ALLOWED_COMMANDS,
      "Get list of allowed shell commands. Shows available commands without executing them. Useful to check what commands can be run before using shell_execute. Note: 'cd' command is NOT supported - use 'cwd' parameter instead for directory navigation.",
      GetAllowedCommandsSchema.shape,
      createGetAllowedCommandsHandler(shellExecutor),
    );

    // サーバーを開始
    const transport = new StdioServerTransport();
    await server.connect(transport);

    log("info", `Shell MCP Server started (Base directory: ${baseDirectory})`);
    log("info", "Using user's shell environment with PATH and other variables");
  } catch (error) {
    log("error", `Server error: ${error}`);
    process.exit(1);
  }
}

// エラーハンドリング付きでメイン関数を実行
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
