/**
 * コマンド実行時の出力バッファ管理
 */

import type { OutputBuffer } from "./types";
import { DEFAULT_TAIL_BUFFER_SIZE } from "./constants";

/**
 * 出力バッファを初期化する
 * @returns 初期化された出力バッファ
 */
export function createOutputBuffer(): OutputBuffer {
  return {
    content: "",
    size: 0,
    truncated: false,
    tailBuffer: [],
  };
}

/**
 * 出力バッファにデータを追加する
 * @param buffer - 出力バッファ
 * @param chunk - 追加するデータチャンク
 * @param maxSize - 最大サイズ（バイト）
 * @param truncateMessage - 切り詰めメッセージ
 */
export function appendToBuffer(
  buffer: OutputBuffer,
  chunk: string,
  maxSize: number,
  truncateMessage: string,
): void {
  const chunkSize = Buffer.byteLength(chunk, "utf8");
  const tailBufferSize = Math.min(DEFAULT_TAIL_BUFFER_SIZE, Math.floor(maxSize / 10));

  if (buffer.size + chunkSize <= maxSize - tailBufferSize) {
    // バッファに追加
    buffer.content += chunk;
    buffer.size += chunkSize;
  } else {
    if (!buffer.truncated) {
      // 最大サイズに達した場合、残りの容量分だけ追加
      const remainingSize = maxSize - tailBufferSize - buffer.size;
      if (remainingSize > 0) {
        const truncatedChunk = chunk.substring(0, Math.floor(remainingSize / 2));
        buffer.content += truncatedChunk;
      }
      buffer.content += truncateMessage;
      buffer.truncated = true;
    }

    // 循環バッファに保存
    buffer.tailBuffer.push(chunk);
    // バッファサイズを制限
    while (buffer.tailBuffer.join("").length > tailBufferSize) {
      buffer.tailBuffer.shift();
    }
  }
}

/**
 * 出力バッファを最終的な文字列に変換する
 * @param buffer - 出力バッファ
 * @returns 最終的な出力文字列
 */
export function finalizeBuffer(buffer: OutputBuffer): string {
  if (buffer.truncated && buffer.tailBuffer.length > 0) {
    return buffer.content + buffer.tailBuffer.join("");
  }
  return buffer.content;
}

/**
 * タイムアウト情報を生成する
 * @param timeout - タイムアウト値（ミリ秒）
 * @param stdoutSize - 標準出力のサイズ
 * @param stderrSize - 標準エラー出力のサイズ
 * @returns タイムアウト情報の文字列
 */
export function formatTimeoutInfo(timeout: number, stdoutSize: number, stderrSize: number): string {
  return `\nTimeout: ${timeout}ms, stdout: ${stdoutSize}B, stderr: ${stderrSize}B`;
}
