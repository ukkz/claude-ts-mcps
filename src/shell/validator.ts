/**
 * コマンドとディレクトリのバリデーション
 */

import * as path from "path";
import * as fs from "fs";
import { ErrorMessages } from "./constants";

/**
 * コマンドが許可リストに含まれているかチェック
 * @param command - チェックするコマンド
 * @param allowedCommands - 許可されたコマンドのセット
 * @returns 許可されているかどうか
 */
export function isCommandAllowed(command: string, allowedCommands: Set<string>): boolean {
  // ベースコマンド名を抽出
  const commandName = path.basename(command);
  return allowedCommands.has(commandName);
}

/**
 * 作業ディレクトリを検証して正規化する
 * @param cwd - 検証する作業ディレクトリ
 * @param baseDirectory - 基準ディレクトリ
 * @returns 正規化されたパス
 * @throws ディレクトリが無効な場合はエラー
 */
export function validateWorkingDirectory(cwd: string | undefined, baseDirectory: string): string {
  if (!cwd) {
    return baseDirectory;
  }

  // パスを解決（相対パスをサポート）
  const resolvedPath = path.resolve(baseDirectory, cwd);

  // セキュリティ: パスが基準ディレクトリ内にあることを確認
  if (!resolvedPath.startsWith(baseDirectory)) {
    throw new Error(ErrorMessages.DIRECTORY_OUTSIDE_BASE(cwd, baseDirectory, resolvedPath));
  }

  // ディレクトリの存在確認
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(ErrorMessages.DIRECTORY_NOT_FOUND(resolvedPath, cwd, baseDirectory));
  }

  return resolvedPath;
}

/**
 * cdコマンドかどうかをチェック
 * @param command - チェックするコマンド
 * @returns cdコマンドかどうか
 */
export function isCdCommand(command: string): boolean {
  const commandName = path.basename(command).toLowerCase();
  return commandName === "cd";
}

/**
 * タイムアウト値を検証して制限内に収める
 * @param timeout - 検証するタイムアウト値
 * @param maxTimeout - 最大タイムアウト値
 * @returns 制限内のタイムアウト値
 */
export function validateTimeout(timeout: number | undefined, maxTimeout: number): number {
  if (!timeout) {
    return maxTimeout;
  }
  return Math.min(timeout, maxTimeout);
}

/**
 * 出力サイズ制限を検証
 * @param sizeMB - 検証するサイズ（MB）
 * @returns 有効なサイズ（バイト）
 */
export function validateOutputSize(sizeMB: number | undefined): number {
  const size = sizeMB || 1;
  // 最小1KB、最大100MB
  const clampedSize = Math.max(0.001, Math.min(100, size));
  return clampedSize * 1024 * 1024;
}
