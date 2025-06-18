/**
 * MCP ツールハンドラー
 */

import { z } from "zod";
import type { ShellExecutor } from "./executor";
import { formatCommandError, formatUnexpectedError } from "./errors";

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
      });

      if (!result.success) {
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

      return {
        content: [
          {
            type: "text" as const,
            text: result.stdout,
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
