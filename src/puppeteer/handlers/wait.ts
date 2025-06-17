/**
 * 待機系ハンドラー
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createErrorResponse, createSuccessResponse, ensureBrowser } from "../utils.js";
import {
  WaitForSelectorArgs,
  WaitForTimeoutArgs,
  WaitForFunctionArgs,
  WaitForNavigationArgs,
} from "../types.js";

/**
 * 要素の出現を待機する処理
 */
export async function handleWaitForSelector(
  args: WaitForSelectorArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    const startTime = Date.now();

    // デフォルトタイムアウトは30秒
    const timeout = args.timeout ?? 30000;

    // waitForSelectorのオプション設定
    const options: any = { timeout };
    if (args.visible) {
      options.visible = true;
    }

    // 要素が現れるまで待機
    const element = await page.waitForSelector(args.selector, options);

    if (!element) {
      return createErrorResponse(`Element not found: ${args.selector}`);
    }

    // 要素の情報を取得
    const elementInfo = await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;

      const rect = el.getBoundingClientRect();
      return {
        tagName: el.tagName,
        visible: rect.width > 0 && rect.height > 0,
        position: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        text: (el as HTMLElement).innerText || "",
      };
    }, args.selector);

    const elapsed = Date.now() - startTime;

    return createSuccessResponse(
      `Element found: ${args.selector}\n` +
        `Waited for: ${elapsed}ms\n` +
        `Element info: ${JSON.stringify(elementInfo, null, 2)}`,
    );
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      return createErrorResponse(
        `Timeout waiting for selector: ${args.selector} (timeout: ${args.timeout ?? 30000}ms)`,
      );
    }
    return createErrorResponse(
      `Failed to wait for selector ${args.selector}: ${(error as Error).message}`,
    );
  }
}

/**
 * 指定時間待機する処理
 */
export async function handleWaitForTimeout(
  args: WaitForTimeoutArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    // ensureBrowserを呼び出して、ブラウザが初期化されていることを確認
    await ensureBrowser(server);
    const startTime = Date.now();

    // 待機実行
    // waitForTimeoutは廃止されたため、Node.jsのsetTimeoutを使用
    await new Promise(resolve => setTimeout(resolve, args.delay));

    const actualDelay = Date.now() - startTime;

    return createSuccessResponse(`Waited for ${actualDelay}ms (requested: ${args.delay}ms)`);
  } catch (error) {
    return createErrorResponse(`Failed to wait for timeout: ${(error as Error).message}`);
  }
}

/**
 * JavaScript関数の条件が満たされるまで待機する処理
 */
export async function handleWaitForFunction(
  args: WaitForFunctionArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    const startTime = Date.now();

    // デフォルトタイムアウトは30秒
    const timeout = args.timeout ?? 30000;

    // waitForFunctionのオプション設定
    const options: any = { timeout };
    if (args.polling) {
      options.polling = args.polling;
    }

    // 関数が真を返すまで待機
    await page.waitForFunction(args.pageFunction, options);

    const elapsed = Date.now() - startTime;

    // 最終的な評価結果を取得
    const finalValue = await page.evaluate(args.pageFunction);

    return createSuccessResponse(
      `Function returned true after ${elapsed}ms\n` +
        `Final value: ${JSON.stringify(finalValue, null, 2)}\n` +
        `Function: ${args.pageFunction}`,
    );
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      return createErrorResponse(
        `Timeout waiting for function: ${args.pageFunction} (timeout: ${args.timeout ?? 30000}ms)`,
      );
    }
    return createErrorResponse(
      `Failed to wait for function: ${(error as Error).message}\n` +
        `Function: ${args.pageFunction}`,
    );
  }
}

/**
 * ページナビゲーションの完了を待機する処理
 */
export async function handleWaitForNavigation(
  args: WaitForNavigationArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    const startTime = Date.now();

    // デフォルトタイムアウトは30秒
    const timeout = args.timeout ?? 30000;

    // 現在のURLを記録
    const initialUrl = page.url();

    // ナビゲーションを待機
    await page.waitForNavigation({
      waitUntil: args.waitUntil || "load",
      timeout,
    });

    const elapsed = Date.now() - startTime;
    const finalUrl = page.url();

    return createSuccessResponse(
      `Navigation completed after ${elapsed}ms\n` +
        `Initial URL: ${initialUrl}\n` +
        `Final URL: ${finalUrl}\n` +
        `Wait condition: ${args.waitUntil || "load"}`,
    );
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      return createErrorResponse(
        `Timeout waiting for navigation (timeout: ${args.timeout ?? 30000}ms)`,
      );
    }
    return createErrorResponse(`Failed to wait for navigation: ${(error as Error).message}`);
  }
}
