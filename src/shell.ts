/**
 * シェル操作を可能にするModel Context Protocol(MCP)サーバーの実装
 * このサーバーは、シェルコマンド実行機能を提供します
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { spawn, SpawnOptions, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parseArgs } from "node:util"

// コマンドライン引数の解析
const { values } = parseArgs({
  options: {
    baseDir: {
      type: "string",
      short: "d",
      help: "Base directory for command execution"
    },
    verbose: {
      type: "boolean",
      short: "v",
      count: true,
      default: false,
      help: "Enable verbose logging"
    }
  },
  allowPositionals: true,
});

const baseDirectory = values.baseDir || process.cwd();
const verbose = values.verbose;

// 詳細度フラグに基づいてログレベルを設定
const logLevel = verbose ? "debug" : "info";
function log(level: string, ...args: any[]) {
  if (level === "debug" && logLevel !== "debug") return;
  console.error(`[${level.toUpperCase()}]`, ...args);
}

/**
 * ユーザーのシェル環境変数を読み込む関数
 * zshrcやbashrcから環境変数を抽出します
 */
function loadUserShellEnvironment(): Record<string, string> {
  const homeDir = os.homedir();
  let envVars: Record<string, string> = {};
  
  try {
    // デフォルトのシェルを検出
    const shell = process.env.SHELL || '/bin/bash';
    const shellName = path.basename(shell);
    
    log("info", `Detected shell: ${shellName}`);
    
    // シェルタイプに基づいてプロファイルファイルを決定
    let profileFiles: string[] = [];
    
    if (shellName === 'zsh') {
      profileFiles = [
        path.join(homeDir, '.zshrc'),
        path.join(homeDir, '.zshenv'),
        path.join(homeDir, '.zprofile')
      ];
    } else if (shellName === 'bash') {
      profileFiles = [
        path.join(homeDir, '.bashrc'),
        path.join(homeDir, '.bash_profile'),
        path.join(homeDir, '.profile')
      ];
    } else {
      // その他のシェルの場合はデフォルトの.profileを使用
      profileFiles = [path.join(homeDir, '.profile')];
    }
    
    // シェルを使って環境変数をエクスポート
    let command: string;
    if (shellName === 'zsh') {
      command = 'zsh -c "source ~/.zshrc 2>/dev/null || true; source ~/.zshenv 2>/dev/null || true; env"';
    } else if (shellName === 'bash') {
      command = 'bash -c "source ~/.bashrc 2>/dev/null || true; source ~/.bash_profile 2>/dev/null || true; env"';
    } else {
      command = `${shell} -c "env"`;
    }
    
    // 環境変数を取得
    const envOutput = execSync(command, { encoding: 'utf8' });
    
    // 出力を解析して環境変数のマップを作成
    envOutput.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, name, value] = match;
        envVars[name] = value;
      }
    });
    
    log("info", `Loaded ${Object.keys(envVars).length} environment variables from shell profile`);
    if (verbose) {
      log("debug", `PATH=${envVars['PATH']}`);
    }
    
    return envVars;
  } catch (error) {
    log("error", `Failed to load shell environment: ${error instanceof Error ? error.message : String(error)}`);
    return process.env as Record<string, string>;
  }
}

// ユーザーのシェル環境変数を読み込む
const userEnv = loadUserShellEnvironment();

/**
 * シェルコマンド実行クラス
 */
class ShellExecutor {
  private allowedCommands: Set<string>;
  private baseDirectory: string;
  private maxTimeout: number;
  private shellEnvironment: Record<string, string>;
  private maxOutputSize: number; // 最大出力サイズ（バイト）

  /**
   * コンストラクタ
   */
  constructor(baseDir: string, shellEnv: Record<string, string>) {
    // 許可されたコマンドを設定（デフォルトは一般的に使用される開発ツール）
    this.allowedCommands = new Set([
      // パッケージマネージャー
      'npm', 'yarn', 'pnpm', 'bun',
      // バージョン管理
      'git',
      // ファイルシステム操作
      'ls', 'dir', 'find', 'mkdir', 'rmdir', 'cp', 'mv', 'rm', 'cat',
      // 開発ツール
      'node', 'python', 'python3', 'tsc', 'eslint', 'prettier',
      // ビルドツール
      'make', 'cargo', 'go',
      // コンテナツール
      'docker', 'docker-compose',
      // その他のユーティリティ
      'echo', 'touch', 'grep'
    ]);
    
    // ベースディレクトリを設定
    this.baseDirectory = baseDir;
    
    // 最大タイムアウトを設定（デフォルトは60秒）
    this.maxTimeout = 60000;
    
    // 最大出力サイズを設定（デフォルトは1MB）
    this.maxOutputSize = 1024 * 1024;
    
    // シェル環境変数を設定
    this.shellEnvironment = shellEnv;
  }

  /**
   * シェルコマンドを実行する
   */
  public async executeCommand(command: string, args: string[] = [], cwd?: string, env?: Record<string, string>, timeout?: number, maxOutputSizeMB?: number): Promise<{stdout: string, stderr: string, exitCode: number, success: boolean, error?: string}> {
    try {
      if (!command) {
        return this.createErrorResponse('コマンドが指定されていません');
      }
      
      // セキュリティチェック：コマンドが許可されているか確認
      if (!this.isCommandAllowed(command)) {
        return this.createErrorResponse(
          `コマンドは許可されていません: ${command}。許可されているコマンド: ${Array.from(this.allowedCommands).join(', ')}`
        );
      }
      
      // 作業ディレクトリを検証
      let workingDir: string;
      try {
        workingDir = this.validateWorkingDirectory(cwd);
      } catch (error) {
        return this.createErrorResponse(
          error instanceof Error ? error.message : String(error)
        );
      }
      
      // 環境変数を作成（ユーザーのシェル環境変数 + 追加の環境変数）
      const mergedEnv = { ...this.shellEnvironment, ...(env || {}) };
      
      // コマンドを実行して結果を返す
      return await this.spawnCommand(command, args, {
        cwd: workingDir,
        env: mergedEnv,
        timeout: Math.min(timeout || this.maxTimeout, this.maxTimeout)
      }, maxOutputSizeMB);
    } catch (error) {
      // 予期しないエラーを処理
      return this.createErrorResponse(
        `コマンドの実行に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 標準化されたエラーレスポンスを作成
   */
  private createErrorResponse(message: string): {stdout: string, stderr: string, exitCode: number, success: boolean, error: string} {
    return {
      stdout: '',
      stderr: message,
      exitCode: 1,
      success: false,
      error: message
    };
  }

  /**
   * コマンドが許可リストにあるかチェック
   */
  private isCommandAllowed(command: string): boolean {
    // ベースコマンドを抽出（パスなし）
    const commandName = path.basename(command);
    return this.allowedCommands.has(commandName);
  }

  /**
   * 作業ディレクトリを検証して正規化
   */
  private validateWorkingDirectory(cwd?: string): string {
    if (!cwd) {
      return this.baseDirectory;
    }

    // パスを解決（相対パスをサポート）
    const resolvedPath = path.resolve(this.baseDirectory, cwd);

    // セキュリティチェック：パスがベースディレクトリ内にあることを確認
    if (!resolvedPath.startsWith(this.baseDirectory)) {
      throw new Error(`作業ディレクトリ ${cwd} は許可されたベースディレクトリの外にあります`);
    }

    // ディレクトリが存在することを確認
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`ディレクトリが存在しません: ${resolvedPath}`);
    }

    return resolvedPath;
  }

  /**
   * シェルコマンドプロセスを生成して出力を処理
   */
  private spawnCommand(
    command: string,
    args: string[],
    options: SpawnOptions,
    maxOutputSizeMB?: number
  ): Promise<{stdout: string, stderr: string, exitCode: number, success: boolean, error?: string}> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let stdoutSize = 0;
      let stderrSize = 0;
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let timeoutId: NodeJS.Timeout | Timer | null = null;
      
      // カスタムまたはデフォルトの最大出力サイズ
      const maxSize = (maxOutputSizeMB || 1) * 1024 * 1024;
      
      // 最後の出力を保持するための循環バッファ
      const tailBufferSize = Math.min(10240, Math.floor(maxSize / 10)); // 最大サイズの10%または10KBの小さい方
      let stdoutTailBuffer: string[] = [];
      let stderrTailBuffer: string[] = [];
      
      // よりよいストリーム処理のためにspawnを使用
      const childProcess = spawn(command, args, {
        ...options,
        shell: true,
        stdio: 'pipe'
      });
      
      // 標準出力を収集（サイズ制限付き）
      childProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        const chunkSize = Buffer.byteLength(chunk, 'utf8');
        
        if (stdoutSize + chunkSize <= maxSize - tailBufferSize) {
          stdout += chunk;
          stdoutSize += chunkSize;
        } else {
          if (!stdoutTruncated) {
            // 最大サイズに達した場合、残りの容量分だけ追加
            const remainingSize = maxSize - tailBufferSize - stdoutSize;
            if (remainingSize > 0) {
              const truncatedChunk = chunk.substring(0, Math.floor(remainingSize / 2)); // UTF-8を考慮して半分に
              stdout += truncatedChunk;
            }
            stdout += '\n\n[出力が切り詰められました。最初の部分と最後の部分のみ表示しています]\n\n... (中略) ...\n\n';
            stdoutTruncated = true;
          }
          
          // 最後の部分を循環バッファに保存
          stdoutTailBuffer.push(chunk);
          // バッファサイズを制限
          while (stdoutTailBuffer.join('').length > tailBufferSize) {
            stdoutTailBuffer.shift();
          }
        }
      });
      
      // 標準エラーを収集（サイズ制限付き）
      childProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        const chunkSize = Buffer.byteLength(chunk, 'utf8');
        
        if (stderrSize + chunkSize <= maxSize - tailBufferSize) {
          stderr += chunk;
          stderrSize += chunkSize;
        } else {
          if (!stderrTruncated) {
            // 最大サイズに達した場合、残りの容量分だけ追加
            const remainingSize = maxSize - tailBufferSize - stderrSize;
            if (remainingSize > 0) {
              const truncatedChunk = chunk.substring(0, Math.floor(remainingSize / 2)); // UTF-8を考慮して半分に
              stderr += truncatedChunk;
            }
            stderr += '\n\n[エラー出力が切り詰められました。最初の部分と最後の部分のみ表示しています]\n\n... (中略) ...\n\n';
            stderrTruncated = true;
          }
          
          // 最後の部分を循環バッファに保存
          stderrTailBuffer.push(chunk);
          // バッファサイズを制限
          while (stderrTailBuffer.join('').length > tailBufferSize) {
            stderrTailBuffer.shift();
          }
        }
      });
      
      // プロセス完了の処理
      childProcess.on('close', (exitCode) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // 切り詰められた場合、最後の部分を追加
        if (stdoutTruncated && stdoutTailBuffer.length > 0) {
          stdout += stdoutTailBuffer.join('');
        }
        if (stderrTruncated && stderrTailBuffer.length > 0) {
          stderr += stderrTailBuffer.join('');
        }
        
        resolve({
          stdout,
          stderr,
          exitCode: exitCode !== null ? exitCode : 1,
          success: exitCode === 0
        });
      });
      
      // プロセスエラーの処理
      childProcess.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        resolve({
          stdout,
          stderr: error.message,
          exitCode: 1,
          success: false,
          error: error.message
        });
      });
      
      // タイムアウト処理の設定
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          childProcess.kill();
          resolve({
            stdout,
            stderr: `コマンドは${options.timeout}ms後にタイムアウトしました`,
            exitCode: 1,
            success: false,
            error: 'コマンド実行がタイムアウトしました'
          });
        }, options.timeout);
      }
    });
  }

  /**
   * 許可されたコマンドのリストを取得
   */
  public getAllowedCommands(): string[] {
    return Array.from(this.allowedCommands);
  }

  /**
   * コマンドを許可リストに追加
   */
  public allowCommand(command: string): void {
    this.allowedCommands.add(command);
  }

  /**
   * コマンドを許可リストから削除
   */
  public disallowCommand(command: string): void {
    this.allowedCommands.delete(command);
  }
}

// ベースディレクトリが有効かチェック
if (!fs.existsSync(baseDirectory)) {
  console.error(`Error: Base directory ${baseDirectory} does not exist.`);
  process.exit(1);
}

// シェル実行インスタンスを作成
const shellExecutor = new ShellExecutor(baseDirectory, userEnv);

// ツール入力用のZodスキーマを定義
const ShellExecuteSchema = z.object({
  command: z.string().describe("実行するシェルコマンド"),
  args: z.array(z.string()).optional().default([]).describe("コマンド引数（配列形式）"),
  cwd: z.string().optional().describe("作業ディレクトリ"),
  env: z.record(z.string()).optional().describe("環境変数"),
  timeout: z.number().optional().describe("タイムアウト（ミリ秒）"),
  maxOutputSizeMB: z.number().optional().default(1).describe("最大出力サイズ（MB単位、デフォルト: 1MB）")
});

const GetAllowedCommandsSchema = z.object({});

// シェルツール名をenumオブジェクトとして定義
const ShellTools = {
  EXECUTE: "shell_execute",
  GET_ALLOWED_COMMANDS: "shell_get_allowed_commands"
} as const;

// MCPサーバーを初期化
const server = new McpServer({
  name: "mcp-shell",
  version: "1.0.0"
});

// シェルツールを定義
server.tool(
  ShellTools.EXECUTE,
  "Executes shell commands for development operations. This tool allows running various development commands such as package managers (npm, yarn, bun), version control (git), file operations (ls, mkdir, cp), and development tools (node, python, tsc). Use this tool when you need to install dependencies, initialize projects, compile code, or perform file system operations. Commands are run in a controlled environment with security restrictions. Each command requires the base command name and optional arguments, working directory, environment variables, and timeout.",
  ShellExecuteSchema.shape,
  async (args) => {
    try {
      const result = await shellExecutor.executeCommand(
        args.command,
        args.args || [],
        args.cwd,
        args.env,
        args.timeout,
        args.maxOutputSizeMB
      );
      
      if (!result.success) {
        return {
          content: [{ 
            type: "text", 
            text: `Error: ${result.stderr || result.error || "Unknown error"}` 
          }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: result.stdout 
        }],
        isError: false
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }
);

server.tool(
  ShellTools.GET_ALLOWED_COMMANDS,
  "Retrieves the list of shell commands that are allowed to be executed by the shell_execute tool. This provides visibility into the available commands without attempting to run them. The response includes all permitted commands categorized by their function (package managers, version control, file operations, etc.). Use this tool when you need to determine which commands are available in the environment before attempting to use them with shell_execute.",
  GetAllowedCommandsSchema.shape,
  async () => {
    try {
      const commands = shellExecutor.getAllowedCommands();
      return {
        content: [{ 
          type: "text", 
          text: `Available commands:\n${commands.join(', ')}` 
        }],
        isError: false
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }
);

// サーバーを起動
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("info", `Shell MCP Server started (Base directory: ${baseDirectory})`);
    log("info", "Using user's shell environment with PATH and other variables");
  } catch (error) {
    log("error", `Server error: ${error}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
