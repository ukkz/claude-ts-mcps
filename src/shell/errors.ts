/**
 * エラー処理とレスポンス生成
 */

import type { CommandResult } from "./types";
import { TIMEOUT_EXIT_CODE } from "./constants";

/**
 * 標準化されたエラーレスポンスを作成する
 * @param message - エラーメッセージ
 * @returns エラーレスポンス
 */
export function createErrorResponse(message: string): CommandResult {
  return {
    stdout: "",
    stderr: message,
    exitCode: 1,
    success: false,
    error: message,
  };
}

/**
 * プロセスエラーの詳細情報を生成する
 * @param error - Node.jsのエラーオブジェクト
 * @param command - 実行しようとしたコマンド
 * @param env - 環境変数
 * @returns エラーの詳細情報
 */
export function formatProcessError(
  error: Error,
  command: string,
  env?: Record<string, string>,
): string {
  const errorInfo = `Process error: ${error.message}`;
  const systemError = error as NodeJS.ErrnoException;
  let additionalInfo = "";

  if (systemError.code === "ENOENT") {
    additionalInfo = `\nCommand not found: ${command}\nPATH: ${env?.PATH || process.env.PATH}`;
  } else if (systemError.code === "EACCES") {
    additionalInfo = `\nPermission denied: ${command}`;
  } else if (systemError.code) {
    additionalInfo = `\nError code: ${systemError.code}`;
  }

  return errorInfo + additionalInfo;
}

/**
 * コマンド実行失敗時の詳細なエラーメッセージを生成する
 * @param result - コマンド実行結果
 * @param command - 実行したコマンド
 * @param args - コマンド引数
 * @param cwd - 作業ディレクトリ
 * @param baseDirectory - 基準ディレクトリ
 * @param startTime - 実行開始時刻
 * @param maxOutputSizeMB - 最大出力サイズ（MB）
 * @returns フォーマットされたエラーメッセージ
 */
export function formatCommandError(
  result: CommandResult,
  command: string,
  args: string[],
  cwd: string | undefined,
  baseDirectory: string,
  startTime: number,
  maxOutputSizeMB: number | undefined,
): string {
  let errorMessage = `Command failed: ${command} ${args.join(" ")}\n`;
  errorMessage += `Exit code: ${result.exitCode}\n`;
  errorMessage += `Directory: ${cwd || baseDirectory}\n`;

  if (result.stderr) {
    errorMessage += `\nSTDERR:\n${result.stderr}\n`;
  }
  if (result.stdout) {
    errorMessage += `\nSTDOUT:\n${result.stdout}\n`;
  }
  if (result.error) {
    errorMessage += `\nERROR: ${result.error}\n`;
  }

  errorMessage += `\nExecution time: ${Date.now() - startTime}ms\n`;
  errorMessage += `Output limit: ${maxOutputSizeMB || 1}MB\n\nSolutions:\n`;

  if (result.exitCode === TIMEOUT_EXIT_CODE) {
    errorMessage += `- Increase timeout parameter\n- Break into smaller operations\n- Use background processes\n`;
  } else if (
    result.stdout.includes("[Output truncated") ||
    result.stderr.includes("[Error output truncated")
  ) {
    errorMessage += `- Increase maxOutputSizeMB (current: ${maxOutputSizeMB || 1}MB)\n- Redirect output to file\n- Filter output\n`;
  } else {
    errorMessage += `- Check command syntax\n- Verify command exists in PATH\n- Check permissions\n`;
  }

  return errorMessage;
}

/**
 * 予期しないエラーの詳細情報を生成する
 * @param error - エラーオブジェクト
 * @param command - 実行しようとしたコマンド
 * @param args - コマンド引数
 * @param cwd - 作業ディレクトリ
 * @param baseDirectory - 基準ディレクトリ
 * @param timeout - タイムアウト
 * @param maxOutputSizeMB - 最大出力サイズ
 * @returns エラーの詳細情報
 */
export function formatUnexpectedError(
  error: unknown,
  command: string,
  args: string[],
  cwd: string | undefined,
  baseDirectory: string,
  timeout: number | undefined,
  maxOutputSizeMB: number | undefined,
): object {
  return {
    command,
    args,
    cwd: cwd || baseDirectory,
    error:
      error instanceof Error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : String(error),
    executionInfo: {
      timeout: timeout || 60000,
      maxOutputSizeMB: maxOutputSizeMB || 1,
      baseDirectory,
    },
  };
}
