/**
 * ナビゲーション系ハンドラー
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { 
  createErrorResponse, 
  createSuccessResponse, 
  createSuccessResponseWithImage,
  ensureBrowser 
} from "../utils.js";
import { saveScreenshot } from "../state.js";
import {
  NavigateArgs,
  ScreenshotArgs,
  ClickArgs,
  FillArgs,
  SelectArgs,
  HoverArgs,
  EvaluateArgs
} from "../types.js";

/**
 * URLへの移動を処理
 */
export async function handleNavigate(args: NavigateArgs, server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    await page.goto(args.url);
    return createSuccessResponse(`Navigated to ${args.url}`);
  } catch (error) {
    return createErrorResponse(`Failed to navigate to ${args.url}: ${(error as Error).message}`);
  }
}

/**
 * スクリーンショット撮影を処理
 */
export async function handleScreenshot(args: ScreenshotArgs, server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    const width = args.width ?? 800;
    const height = args.height ?? 600;
    
    await page.setViewport({ width, height });

    const screenshot = await (args.selector
      ? (await page.$(args.selector))?.screenshot({ encoding: "base64" })
      : page.screenshot({ encoding: "base64", fullPage: false }));

    if (!screenshot) {
      return createErrorResponse(
        args.selector ? `Element not found: ${args.selector}` : "Screenshot failed"
      );
    }

    // スクリーンショットを保存
    saveScreenshot(args.name, screenshot as string);
    server.notification({
      method: "notifications/resources/list_changed",
    });

    return createSuccessResponseWithImage(
      `Screenshot '${args.name}' taken at ${width}x${height}`,
      screenshot as string
    );
  } catch (error) {
    return createErrorResponse(`Screenshot failed: ${(error as Error).message}`);
  }
}

/**
 * 要素のクリックを処理
 */
export async function handleClick(args: ClickArgs, server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    await page.click(args.selector);
    return createSuccessResponse(`Clicked: ${args.selector}`);
  } catch (error) {
    return createErrorResponse(`Failed to click ${args.selector}: ${(error as Error).message}`);
  }
}

/**
 * フォーム入力を処理
 */
export async function handleFill(args: FillArgs, server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    await page.waitForSelector(args.selector);
    await page.type(args.selector, args.value);
    return createSuccessResponse(`Filled ${args.selector} with: ${args.value}`);
  } catch (error) {
    return createErrorResponse(`Failed to fill ${args.selector}: ${(error as Error).message}`);
  }
}

/**
 * セレクト要素の選択を処理
 */
export async function handleSelect(args: SelectArgs, server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    await page.waitForSelector(args.selector);
    await page.select(args.selector, args.value);
    return createSuccessResponse(`Selected ${args.value} in ${args.selector}`);
  } catch (error) {
    return createErrorResponse(`Failed to select ${args.selector}: ${(error as Error).message}`);
  }
}

/**
 * 要素へのホバーを処理
 */
export async function handleHover(args: HoverArgs, server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    await page.waitForSelector(args.selector);
    await page.hover(args.selector);
    return createSuccessResponse(`Hovered ${args.selector}`);
  } catch (error) {
    return createErrorResponse(`Failed to hover ${args.selector}: ${(error as Error).message}`);
  }
}

/**
 * JavaScriptコードの実行を処理
 */
export async function handleEvaluate(args: EvaluateArgs, server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    
    // コンソールログキャプチャを設定
    await page.evaluate(() => {
      window.mcpHelper = {
        logs: [],
        originalConsole: { ...console },
      };

      ['log', 'info', 'warn', 'error'].forEach(method => {
        (console as any)[method] = (...args: any[]) => {
          window.mcpHelper.logs.push(`[${method}] ${args.join(' ')}`);
          (window.mcpHelper.originalConsole as any)[method](...args);
        };
      });
    });

    // スクリプトを実行
    const result = await page.evaluate(args.script);

    // ログを取得して元のコンソールに戻す
    const logs = await page.evaluate(() => {
      const logs = window.mcpHelper.logs;
      Object.assign(console, window.mcpHelper.originalConsole);
      delete (window as any).mcpHelper;
      return logs;
    });

    return {
      content: [{
        type: "text",
        text: `Execution result:\n${JSON.stringify(result, null, 2)}\n\nConsole output:\n${logs.join('\n')}`,
      }],
      isError: false,
    };
  } catch (error) {
    return createErrorResponse(`Script execution failed: ${(error as Error).message}`);
  }
}
