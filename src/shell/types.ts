/**
 * Shell MCP サーバーの型定義
 */

/**
 * コマンド実行結果の型
 */
export interface CommandResult {
  /** 標準出力 */
  stdout: string;
  /** 標準エラー出力 */
  stderr: string;
  /** 終了コード */
  exitCode: number;
  /** 実行成功フラグ */
  success: boolean;
  /** エラーメッセージ（エラー時のみ） */
  error?: string;
}

/**
 * コマンド実行オプションの型
 */
export interface ExecuteOptions {
  /** 作業ディレクトリ */
  cwd?: string;
  /** 環境変数 */
  env?: Record<string, string>;
  /** タイムアウト（ミリ秒） */
  timeout?: number;
  /** 最大出力サイズ（MB） */
  maxOutputSizeMB?: number;
}

/**
 * パースされたコマンドの型
 */
export interface ParsedCommand {
  /** コマンド名 */
  command: string;
  /** 引数リスト */
  args: string[];
}

/**
 * ShellExecutor設定の型
 */
export interface ShellExecutorConfig {
  /** 基準ディレクトリ */
  baseDirectory: string;
  /** シェル環境変数 */
  shellEnvironment: Record<string, string>;
  /** 最大タイムアウト（ミリ秒） */
  maxTimeout?: number;
}

/**
 * 出力バッファ管理用の型
 */
export interface OutputBuffer {
  /** 現在の出力内容 */
  content: string;
  /** 現在のサイズ（バイト） */
  size: number;
  /** 切り詰められたかどうか */
  truncated: boolean;
  /** 末尾バッファ（循環バッファ） */
  tailBuffer: string[];
}
