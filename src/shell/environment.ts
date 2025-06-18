/**
 * シェル環境変数の読み込みと管理
 */

import { execSync } from "child_process";
import * as path from "path";

/**
 * ユーザーのシェル環境変数を読み込む
 * @param verbose - 詳細ログを出力するかどうか
 * @returns 環境変数のマップ
 */
export function loadUserShellEnvironment(verbose: boolean = false): Record<string, string> {
  const log = (level: string, ...args: any[]) => {
    if (level === "debug" && !verbose) return;
    console.error(`[${level.toUpperCase()}]`, ...args);
  };

  let envVars: Record<string, string> = {};

  try {
    // デフォルトシェルを検出
    const shell = process.env.SHELL || "/bin/bash";
    const shellName = path.basename(shell);

    log("info", `Detected shell: ${shellName}`);

    // シェルタイプに基づいてコマンドを決定
    let command: string = "";
    if (shellName === "zsh") {
      command =
        'zsh -c "source ~/.zshrc 2>/dev/null || true; source ~/.zshenv 2>/dev/null || true; env"';
    } else if (shellName === "bash") {
      command =
        'bash -c "source ~/.bashrc 2>/dev/null || true; source ~/.bash_profile 2>/dev/null || true; env"';
    } else {
      command = `${shell} -c "env"`;
    }

    if (!command) {
      return process.env as Record<string, string>;
    }

    // 環境変数を取得
    const envOutput = execSync(command, { encoding: "utf8" });

    // 出力をパースして環境変数マップを作成
    envOutput.split("\n").forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, name, value] = match;
        if (name && value !== undefined) {
          envVars[name] = value;
        }
      }
    });

    log("info", `Loaded ${Object.keys(envVars).length} environment variables from shell profile`);
    if (verbose && envVars["PATH"]) {
      log("debug", `PATH=${envVars["PATH"]}`);
    }

    return envVars;
  } catch (error) {
    log(
      "error",
      `Failed to load shell environment: ${error instanceof Error ? error.message : String(error)}`,
    );
    return process.env as Record<string, string>;
  }
}

/**
 * 環境変数をマージする
 * @param base - ベースとなる環境変数
 * @param overrides - 上書きする環境変数
 * @returns マージされた環境変数
 */
export function mergeEnvironment(
  base: Record<string, string>,
  overrides?: Record<string, string>,
): Record<string, string> {
  return { ...base, ...(overrides || {}) };
}
