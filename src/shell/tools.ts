/**
 * MCP ツールハンドラー
 */

import { z } from "zod";
import type { ShellExecutor } from "./executor";
import { formatCommandError, formatUnexpectedError } from "./errors";
import { DEFAULT_STREAMING_TIMEOUT, DEFAULT_STREAMING_BUFFER_SIZE_KB } from "./constants";

/**
 * ツール入力スキーマの定義
 */
export const ShellExecuteSchema = z.object({
  command: z
    .string()
    .describe(
      "Shell command to execute. Can include full command string with args (e.g. 'git add .'). Note: 'cd' command NOT supported - use 'cwd' parameter for directory navigation",
    ),
  args: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Command arguments array. Optional if command contains full command string"),
  cwd: z
    .string()
    .optional()
    .describe("Working directory. IMPORTANT: Use this for directory navigation, NOT 'cd' command"),
  env: z.record(z.string()).optional().describe("Environment variables"),
  timeout: z.number().optional().describe("Timeout in milliseconds"),
  maxOutputSizeMB: z
    .number()
    .optional()
    .default(1)
    .describe("Max output size in MB (default: 1MB)"),
  streaming: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Streaming mode (default: true). Returns partial output for long-running commands while allowing normal commands to complete as usual",
    ),
  streamingTimeout: z
    .number()
    .optional()
    .describe("Timeout for streaming mode in milliseconds (default: 10000)"),
  streamingBufferSizeKB: z
    .number()
    .optional()
    .describe("Buffer size limit for streaming mode in KB (default: 100)"),
  killOnStreamingTimeout: z
    .boolean()
    .optional()
    .describe("Kill process when streaming timeout is reached (default: true)"),
});

export const GetAllowedCommandsSchema = z.object({});

/**
 * shell_execute ツールのハンドラー
 * @param executor - ShellExecutorインスタンス
 * @param baseDirectory - 基準ディレクトリ
 * @returns ハンドラー関数
 */
export function createExecuteHandler(executor: ShellExecutor, baseDirectory: string) {
  return async (args: z.infer<typeof ShellExecuteSchema>) => {
    try {
      const startTime = Date.now();
      const result = await executor.executeCommand(args.command, args.args || [], {
        cwd: args.cwd,
        env: args.env,
        timeout: args.timeout,
        maxOutputSizeMB: args.maxOutputSizeMB,
        streaming: args.streaming,
        streamingTimeout: args.streamingTimeout,
        streamingBufferSizeKB: args.streamingBufferSizeKB,
        killOnStreamingTimeout: args.killOnStreamingTimeout,
      });

      if (!result.success && !result.streamingResult) {
        const errorMessage = formatCommandError(
          result,
          args.command,
          args.args || [],
          args.cwd,
          baseDirectory,
          startTime,
          args.maxOutputSizeMB,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: errorMessage,
            },
          ],
          isError: true,
        };
      }

      // ストリーミング結果の場合は、追加情報を含める
      let responseText = result.stdout;
      if (result.streamingResult) {
        const processStatus = result.processRunning
          ? "Process is still running in the background"
          : "Process has been terminated";

        responseText = [
          `[STREAMING MODE - ${processStatus}]`,
          `Partial output returned after ${args.streamingTimeout || DEFAULT_STREAMING_TIMEOUT}ms or ${args.streamingBufferSizeKB || DEFAULT_STREAMING_BUFFER_SIZE_KB}KB buffer`,
          "",
          "=== STDOUT ===",
          result.stdout || "(no output yet)",
          "",
          "=== STDERR ===",
          result.stderr || "(no error output yet)",
          "",
          `Note: ${processStatus}.`,
          result.processRunning ? "To keep process running, use killOnStreamingTimeout: false" : "",
        ]
          .filter((line) => line !== "")
          .join("\n");
      }

      return {
        content: [
          {
            type: "text" as const,
            text: responseText,
          },
        ],
        isError: false,
      };
    } catch (error) {
      const errorDetails = formatUnexpectedError(
        error,
        args.command,
        args.args || [],
        args.cwd,
        baseDirectory,
        args.timeout,
        args.maxOutputSizeMB,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Unexpected error:\n${JSON.stringify(errorDetails, null, 2)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * shell_get_allowed_commands ツールのハンドラー
 * @param executor - ShellExecutorインスタンス
 * @returns ハンドラー関数
 */
export function createGetAllowedCommandsHandler(executor: ShellExecutor) {
  return async () => {
    try {
      const commands = executor.getAllowedCommands();
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Available commands: ${commands.join(", ")}\n\n` +
              `Note: 'cd' command not supported - use 'cwd' parameter for directory navigation\n` +
              `Each command runs independently without state persistence`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}
