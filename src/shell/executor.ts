/**
 * シェルコマンド実行エンジン
 */

import { spawn, SpawnOptions } from "child_process";
import type { CommandResult, ExecuteOptions, ShellExecutorConfig } from "./types";
import {
  DEFAULT_ALLOWED_COMMANDS,
  DEFAULT_MAX_TIMEOUT,
  DEFAULT_STREAMING_TIMEOUT,
  DEFAULT_STREAMING_BUFFER_SIZE_KB,
  ErrorMessages,
  TIMEOUT_EXIT_CODE,
  STREAMING_EXIT_CODE,
} from "./constants";
import { parseCommandString } from "./parser";
import {
  isCommandAllowed,
  isCdCommand,
  validateWorkingDirectory,
  validateTimeout,
  validateOutputSize,
} from "./validator";
import { createErrorResponse, formatProcessError } from "./errors";
import {
  createOutputBuffer,
  appendToBuffer,
  finalizeBuffer,
  formatTimeoutInfo,
} from "./output-buffer";
import { mergeEnvironment } from "./environment";

/**
 * シェルコマンド実行クラス
 */
export class ShellExecutor {
  private allowedCommands: Set<string>;
  private baseDirectory: string;
  private maxTimeout: number;
  private shellEnvironment: Record<string, string>;

  constructor(config: ShellExecutorConfig) {
    this.allowedCommands = new Set(DEFAULT_ALLOWED_COMMANDS);
    this.baseDirectory = config.baseDirectory;
    this.maxTimeout = config.maxTimeout || DEFAULT_MAX_TIMEOUT;
    this.shellEnvironment = config.shellEnvironment;
  }

  /**
   * シェルコマンドを実行する
   */
  public async executeCommand(
    command: string,
    args: string[] = [],
    options: ExecuteOptions = {},
  ): Promise<CommandResult> {
    try {
      if (!command) {
        return createErrorResponse(ErrorMessages.COMMAND_NOT_SPECIFIED);
      }

      // コマンドと引数を解析
      let actualCommand = command;
      let actualArgs = args;

      if (args.length === 0 && command.includes(" ")) {
        const parsed = parseCommandString(command);
        actualCommand = parsed.command;
        actualArgs = parsed.args;

        console.error(
          `[DEBUG] Auto-split: "${command}" -> cmd: "${actualCommand}", args: [${actualArgs.map((arg) => `"${arg}"`).join(", ")}]`,
        );
      }

      // セキュリティチェック
      const validationResult = this.validateCommand(actualCommand);
      if (validationResult) {
        return validationResult;
      }

      // 作業ディレクトリを検証
      let workingDir: string;
      try {
        workingDir = validateWorkingDirectory(options.cwd, this.baseDirectory);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return createErrorResponse(
          `${errorMessage}\n` +
            `Base: ${this.baseDirectory}\n` +
            `Specified: ${options.cwd || "(not specified)"}`,
        );
      }

      // 環境変数をマージ
      const mergedEnv = mergeEnvironment(this.shellEnvironment, options.env);

      // タイムアウトと出力サイズを検証
      const timeout = validateTimeout(options.timeout, this.maxTimeout);
      const maxOutputSize = validateOutputSize(options.maxOutputSizeMB);

      // コマンドを実行
      return await this.spawnCommand(
        actualCommand,
        actualArgs,
        {
          cwd: workingDir,
          env: mergedEnv,
          timeout,
        },
        maxOutputSize,
        options.streaming,
        options.streamingTimeout,
        options.streamingBufferSizeKB,
        options.killOnStreamingTimeout,
      );
    } catch (error) {
      // 予期しないエラーを処理
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      return createErrorResponse(
        `Failed to execute: ${errorMessage}\n` +
          `Command: ${command} ${args.join(" ")}\n` +
          `Directory: ${options.cwd || this.baseDirectory}` +
          (errorStack ? `\n${errorStack}` : ""),
      );
    }
  }

  /**
   * コマンドを検証する
   */
  private validateCommand(command: string): CommandResult | null {
    // cdコマンドのチェック
    if (isCdCommand(command)) {
      return createErrorResponse(ErrorMessages.CD_NOT_SUPPORTED(this.baseDirectory));
    }

    // 許可リストのチェック
    if (!isCommandAllowed(command, this.allowedCommands)) {
      const availableCommands = Array.from(this.allowedCommands).sort();
      return createErrorResponse(ErrorMessages.COMMAND_NOT_ALLOWED(command, availableCommands));
    }

    return null;
  }

  /**
   * コマンドプロセスを生成して実行する
   */
  private spawnCommand(
    command: string,
    args: string[],
    options: SpawnOptions & { timeout?: number },
    maxOutputSize: number,
    streaming?: boolean,
    streamingTimeout?: number,
    streamingBufferSizeKB?: number,
    killOnStreamingTimeout?: boolean,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      // 出力バッファを初期化
      const stdoutBuffer = createOutputBuffer();
      const stderrBuffer = createOutputBuffer();
      let timeoutId: NodeJS.Timeout | Timer | null = null;
      let streamingTimeoutId: NodeJS.Timeout | Timer | null = null;
      let processExited = false;
      let resultReturned = false;

      // ストリーミングモードの設定
      const isStreamingMode = streaming === true;
      const effectiveStreamingTimeout = streamingTimeout || DEFAULT_STREAMING_TIMEOUT;
      const effectiveStreamingBufferSizeKB =
        streamingBufferSizeKB || DEFAULT_STREAMING_BUFFER_SIZE_KB;
      const streamingBufferSizeBytes = effectiveStreamingBufferSizeKB * 1024;
      const effectiveKillOnTimeout = killOnStreamingTimeout !== false; // デフォルトはtrue

      // プロセスを生成
      const childProcess = spawn(command, args, {
        ...options,
        shell: true,
        stdio: "pipe",
      });

      // ストリーミングモードでの早期返却関数
      const checkStreamingConditions = () => {
        if (!isStreamingMode || processExited || resultReturned) {
          return;
        }

        // バッファサイズが闾値を超えた場合
        if (stdoutBuffer.size + stderrBuffer.size >= streamingBufferSizeBytes) {
          returnStreamingResult();
        }
      };

      // ストリーミング結果を返す関数
      const returnStreamingResult = () => {
        if (resultReturned) {
          return;
        }
        resultReturned = true;

        if (streamingTimeoutId) {
          clearTimeout(streamingTimeoutId);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // プロセスをkillするか判断
        const willKillProcess = effectiveKillOnTimeout && !processExited;
        const processStatus = willKillProcess ? "will be terminated" : "still running";

        resolve({
          stdout: finalizeBuffer(stdoutBuffer),
          stderr: finalizeBuffer(stderrBuffer),
          exitCode: STREAMING_EXIT_CODE,
          success: false,
          processRunning: !willKillProcess,
          streamingResult: true,
          error: `Streaming result returned after ${effectiveStreamingTimeout}ms or ${effectiveStreamingBufferSizeKB}KB buffer (process ${processStatus})`,
        });

        // プロセスをkillする
        if (willKillProcess) {
          // まずSIGTERMを送信
          childProcess.kill("SIGTERM");

          // 1秒後に強制終了
          setTimeout(() => {
            if (!childProcess.killed && !processExited) {
              childProcess.kill("SIGKILL");
            }
          }, 1000);
        }
      };

      // 標準出力を収集
      childProcess.stdout?.on("data", (data) => {
        appendToBuffer(
          stdoutBuffer,
          data.toString(),
          maxOutputSize,
          ErrorMessages.OUTPUT_TRUNCATED,
        );
        checkStreamingConditions();
      });

      // 標準エラー出力を収集
      childProcess.stderr?.on("data", (data) => {
        appendToBuffer(
          stderrBuffer,
          data.toString(),
          maxOutputSize,
          ErrorMessages.ERROR_OUTPUT_TRUNCATED,
        );
        checkStreamingConditions();
      });

      // プロセス完了を処理
      childProcess.on("close", (exitCode) => {
        processExited = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (streamingTimeoutId) {
          clearTimeout(streamingTimeoutId);
        }

        // まだ結果を返していない場合のみ返す
        if (!resultReturned) {
          resolve({
            stdout: finalizeBuffer(stdoutBuffer),
            stderr: finalizeBuffer(stderrBuffer),
            exitCode: exitCode !== null ? exitCode : 1,
            success: exitCode === 0,
          });
        }
      });

      // プロセスエラーを処理
      childProcess.on("error", (error) => {
        processExited = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (streamingTimeoutId) {
          clearTimeout(streamingTimeoutId);
        }

        const errorInfo = formatProcessError(
          error,
          command,
          options.env as Record<string, string> | undefined,
        );

        // まだ結果を返していない場合のみ返す
        if (!resultReturned) {
          resolve({
            stdout: finalizeBuffer(stdoutBuffer),
            stderr: finalizeBuffer(stderrBuffer) + errorInfo,
            exitCode: 1,
            success: false,
            error: error.message,
          });
        }
      });

      // ストリーミングタイムアウトを設定
      if (isStreamingMode) {
        streamingTimeoutId = setTimeout(() => {
          returnStreamingResult();
        }, effectiveStreamingTimeout);
      }

      // タイムアウト処理を設定
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          childProcess.kill("SIGTERM");

          // 1秒後に強制終了
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill("SIGKILL");
            }
          }, 1000);

          const timeoutInfo = formatTimeoutInfo(
            options.timeout!,
            stdoutBuffer.size,
            stderrBuffer.size,
          );

          // まだ結果を返していない場合のみ返す
          if (!resultReturned) {
            resultReturned = true;
            resolve({
              stdout: finalizeBuffer(stdoutBuffer),
              stderr: finalizeBuffer(stderrBuffer) + timeoutInfo,
              exitCode: TIMEOUT_EXIT_CODE,
              success: false,
              error: `Command timed out after ${options.timeout}ms`,
            });
          }
        }, options.timeout);
      }
    });
  }

  /**
   * 許可されたコマンドのリストを取得する
   */
  public getAllowedCommands(): string[] {
    return Array.from(this.allowedCommands);
  }

  /**
   * コマンドを許可リストに追加する
   */
  public allowCommand(command: string): void {
    this.allowedCommands.add(command);
  }

  /**
   * コマンドを許可リストから削除する
   */
  public disallowCommand(command: string): void {
    this.allowedCommands.delete(command);
  }
}
