/**
 * キーボード操作系ハンドラー
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createErrorResponse, createSuccessResponse, ensureBrowser } from "../utils.js";
import { KeyboardPressArgs, KeyboardTypeArgs } from "../types.js";
import { KeyInput } from "puppeteer";

/**
 * 特定のキーを押す処理
 */
export async function handleKeyboardPress(
  args: KeyboardPressArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    // 修飾キーの組み合わせを処理（例: "Control+A", "Shift+Tab"）
    const keys = args.key.split("+");

    if (keys.length > 1) {
      // 複数キーの組み合わせの場合
      // 修飾キーを押す
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (key) {
          await page.keyboard.down(key as KeyInput);
        }
      }

      // メインキーを押して離す
      const mainKey = keys[keys.length - 1];
      if (mainKey) {
        await page.keyboard.press(mainKey as KeyInput, { delay: args.delay });
      }

      // 修飾キーを離す（逆順）
      for (let i = keys.length - 2; i >= 0; i--) {
        const key = keys[i];
        if (key) {
          await page.keyboard.up(key as KeyInput);
        }
      }

      return createSuccessResponse(
        `Pressed key combination: ${args.key}` + (args.delay ? ` with ${args.delay}ms delay` : ""),
      );
    } else {
      // 単一キーの場合
      await page.keyboard.press(args.key as KeyInput, { delay: args.delay });

      return createSuccessResponse(
        `Pressed key: ${args.key}` + (args.delay ? ` with ${args.delay}ms delay` : ""),
      );
    }
  } catch (error) {
    return createErrorResponse(`Failed to press key '${args.key}': ${(error as Error).message}`);
  }
}

/**
 * テキストをタイプする処理（人間らしいタイピングシミュレーション）
 */
export async function handleKeyboardType(
  args: KeyboardTypeArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    const startTime = Date.now();

    // テキストをタイプ
    // delayが指定されている場合は各文字間に遅延を挿入
    await page.keyboard.type(args.text, { delay: args.delay });

    const elapsed = Date.now() - startTime;
    const averageDelay = args.delay || 0;
    const expectedTime = args.text.length * averageDelay;

    return createSuccessResponse(
      `Typed ${args.text.length} characters in ${elapsed}ms\n` +
        `Text: "${args.text}"\n` +
        (args.delay
          ? `Average delay per character: ${args.delay}ms\n` + `Expected time: ${expectedTime}ms`
          : "No delay between characters (instant typing)"),
    );
  } catch (error) {
    return createErrorResponse(`Failed to type text: ${(error as Error).message}`);
  }
}
