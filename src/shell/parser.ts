/**
 * コマンド文字列のパース処理
 */

import type { ParsedCommand } from "./types";

/**
 * コマンド文字列をパースして、クォートとエスケープを適切に処理する
 * @param commandString - パースするコマンド文字列
 * @returns パースされたコマンドと引数
 */
export function parseCommandString(commandString: string): ParsedCommand {
  const tokens: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < commandString.length; i++) {
    const char = commandString[i];

    // エスケープ処理
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    // バックスラッシュ処理
    if (char === "\\") {
      if (inSingleQuote) {
        // シングルクォート内ではエスケープは無効
        current += char;
      } else {
        escaped = true;
      }
      continue;
    }

    // シングルクォート処理
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    // ダブルクォート処理
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    // スペース処理（クォート外のみ）
    if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  // 最後のトークンを追加
  if (current) {
    tokens.push(current);
  }

  return {
    command: tokens[0] || "",
    args: tokens.slice(1),
  };
}

/**
 * 引数配列を安全な文字列に変換する（ログ用）
 * @param args - 引数配列
 * @returns フォーマットされた文字列
 */
export function formatArgsForLog(args: string[]): string {
  return args.map((arg) => `"${arg}"`).join(", ");
}

/**
 * コマンドと引数を結合して完全なコマンド文字列を作成する
 * @param command - コマンド名
 * @param args - 引数配列
 * @returns 結合されたコマンド文字列
 */
export function buildCommandString(command: string, args: string[]): string {
  if (args.length === 0) {
    return command;
  }
  return `${command} ${args.join(" ")}`;
}
