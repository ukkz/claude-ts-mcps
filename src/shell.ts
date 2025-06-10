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
      return this.createErrorResponse('Command not specified');
      }
      
      // セキュリティチェック：コマンドが許可されているか確認
      if (!this.isCommandAllowed(command)) {
        const availableCommands = Array.from(this.allowedCommands).sort();
        return this.createErrorResponse(
          `Command not allowed: ${command}\n\n` +
          `=== ALLOWED COMMANDS ===\n${availableCommands.join(', ')}\n\n` +
          `=== HINTS ===\n` +
          `- Check for typos in the command name\n` +
          `- Contact the administrator if you need additional commands`
        );
      }
      
      // 作業ディレクトリを検証
      let workingDir: string;
      try {
        workingDir = this.validateWorkingDirectory(cwd);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return this.createErrorResponse(
          `${errorMessage}\n\n` +
          `=== DEBUG INFO ===\n` +
          `Base directory: ${this.baseDirectory}\n` +
          `Specified directory: ${cwd || '(not specified)'}`
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      return this.createErrorResponse(
        `Failed to execute command: ${errorMessage}\n\n` +
        `=== COMMAND INFO ===\n` +
        `Command: ${command} ${args.join(' ')}\n` +
        `Working directory: ${cwd || this.baseDirectory}\n` +
        (errorStack ? `\n=== STACK TRACE ===\n${errorStack}` : '')
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
      throw new Error(
        `Working directory ${cwd} is outside the allowed base directory\n` +
        `Base directory: ${this.baseDirectory}\n` +
        `Resolved path: ${resolvedPath}`
      );
    }

    // ディレクトリが存在することを確認
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(
        `Directory does not exist: ${resolvedPath}\n` +
        `Specified path: ${cwd}\n` +
        `Base directory: ${this.baseDirectory}`
      );
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
            stdout += '\n\n[Output truncated. Showing first and last portions]\n\n... (middle portion omitted) ...\n\n';
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
            stderr += '\n\n[Error output truncated. Showing first and last portions]\n\n... (middle portion omitted) ...\n\n';
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
        
        // エラーの詳細情報を含める
        const errorInfo = `Process error: ${error.message}`;
        const systemError = error as NodeJS.ErrnoException;
        let additionalInfo = '';
        
        if (systemError.code === 'ENOENT') {
          additionalInfo = `\nCommand not found: ${command}`;
          additionalInfo += `\nPATH: ${options.env?.PATH || process.env.PATH}`;
        } else if (systemError.code === 'EACCES') {
          additionalInfo = `\nPermission denied: ${command}`;
        } else if (systemError.code) {
          additionalInfo = `\nError code: ${systemError.code}`;
        }
        
        resolve({
          stdout,
          stderr: stderr + errorInfo + additionalInfo,
          exitCode: 1,
          success: false,
          error: error.message + additionalInfo
        });
      });
      
      // タイムアウト処理の設定
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          childProcess.kill('SIGTERM');
          
          // 1秒後に強制終了
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 1000);
          
          const timeoutInfo = `\n\n=== TIMEOUT INFO ===\n`;
          const timeoutDetails = {
            timeout: options.timeout,
            command: command,
            args: args,
            stdout_size: stdoutSize,
            stderr_size: stderrSize,
            stdout_truncated: stdoutTruncated,
            stderr_truncated: stderrTruncated
          };
          
          resolve({
            stdout: stdout + (stdoutTruncated ? stdoutTailBuffer.join('') : ''),
            stderr: stderr + (stderrTruncated ? stderrTailBuffer.join('') : '') + timeoutInfo + JSON.stringify(timeoutDetails, null, 2),
            exitCode: 124, // GNU timeout 互換の終了コード
            success: false,
            error: `Command timed out after ${options.timeout}ms`
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

// MCPサーバーとClaude間の通信制限について
// - デフォルトタイムアウト: 60秒（TypeScript SDK）
// - メッセージサイズ制限: 明確な仕様はないが、大きすぎる応答はClaude Desktopがクラッシュする可能性あり
// - エラーコード: -32001 (RequestTimeout)

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
      const startTime = Date.now();
      const result = await shellExecutor.executeCommand(
        args.command,
        args.args || [],
        args.cwd,
        args.env,
        args.timeout,
        args.maxOutputSizeMB
      );
      
      if (!result.success) {
        // エラー時により詳細な情報を提供
        const errorDetails = {
          command: args.command,
          args: args.args || [],
          cwd: args.cwd || baseDirectory,
          exitCode: result.exitCode,
          stdout: result.stdout || '(no stdout)',
          stderr: result.stderr || '(no stderr)',
          error: result.error || null,
          executionInfo: {
            timeout: args.timeout || 60000,
            maxOutputSizeMB: args.maxOutputSizeMB || 1,
            baseDirectory: baseDirectory
          }
        };
        
        // エラーメッセージの構築
        let errorMessage = `Command failed: ${args.command} ${(args.args || []).join(' ')}\n`;
        errorMessage += `Exit code: ${result.exitCode}\n`;
        errorMessage += `Working directory: ${args.cwd || baseDirectory}\n\n`;
        
        if (result.stderr) {
          errorMessage += `=== STDERR ===\n${result.stderr}\n\n`;
        }
        
        if (result.stdout) {
          errorMessage += `=== STDOUT ===\n${result.stdout}\n\n`;
        }
        
        if (result.error) {
          errorMessage += `=== ERROR ===\n${result.error}\n\n`;
        }
        
        errorMessage += `=== DEBUGGING INFO ===\n`;
        errorMessage += `Command executed: ${args.command} ${(args.args || []).join(' ')}\n`;
        errorMessage += `Total execution time: ${Date.now() - startTime}ms\n`;
        errorMessage += `MCP transport limits:\n`;
        errorMessage += `- Default MCP timeout: 60 seconds (TypeScript SDK)\n`;
        errorMessage += `- Output size limit: ${args.maxOutputSizeMB || 1}MB (configurable)\n`;
        errorMessage += `- Large outputs may cause Claude Desktop to fail\n\n`;
        errorMessage += `=== POSSIBLE SOLUTIONS ===\n`;
        
        if (result.exitCode === 124) {
          errorMessage += `- Increase timeout using the timeout parameter\n`;
          errorMessage += `- Break down the task into smaller operations\n`;
          errorMessage += `- Use background processes for long-running tasks\n`;
        } else if (result.stdout.includes('[Output truncated') || result.stderr.includes('[Error output truncated')) {
          errorMessage += `- Increase maxOutputSizeMB parameter (current: ${args.maxOutputSizeMB || 1}MB)\n`;
          errorMessage += `- Redirect output to a file instead\n`;
          errorMessage += `- Filter or summarize the output\n`;
        } else {
          errorMessage += `- Check command syntax and arguments\n`;
          errorMessage += `- Verify the command exists and is in PATH\n`;
          errorMessage += `- Check file/directory permissions\n`;
        }
        
        return {
          content: [{ 
            type: "text", 
            text: errorMessage
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
      // 予期しないエラーの場合も詳細情報を提供
      const errorDetails = {
        command: args.command,
        args: args.args || [],
        cwd: args.cwd || baseDirectory,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : String(error),
        executionInfo: {
          timeout: args.timeout || 60000,
          maxOutputSizeMB: args.maxOutputSizeMB || 1,
          baseDirectory: baseDirectory
        }
      };
      
      return {
        content: [{ 
          type: "text", 
          text: `Unexpected error during command execution:\n\n${JSON.stringify(errorDetails, null, 2)}` 
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
