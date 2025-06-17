/**
 * その他のハンドラー
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createErrorResponse, createSuccessResponse, ensureBrowser } from "../utils.js";
import { AddScriptTagArgs, ClearInputArgs } from "../types.js";

/**
 * スクリプトタグを追加する処理
 */
export async function handleAddScriptTag(
  args: AddScriptTagArgs,
  server: Server
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    
    const options: any = {};
    if (args.url) {
      options.url = args.url;
    } else if (args.path) {
      options.path = args.path;
    } else if (args.content) {
      options.content = args.content;
    } else {
      return createErrorResponse(
        "Must specify either url, path, or content for script tag"
      );
    }
    
    await page.addScriptTag(options);
    
    return createSuccessResponse(
      `Script tag added successfully\n` +
      (args.url ? `URL: ${args.url}` : '') +
      (args.path ? `Path: ${args.path}` : '') +
      (args.content ? `Content: ${args.content.length} characters` : '')
    );
  } catch (error) {
    return createErrorResponse(
      `Failed to add script tag: ${(error as Error).message}`
    );
  }
}

/**
 * 入力フィールドをクリアする処理
 */
export async function handleClearInput(
  args: ClearInputArgs,
  server: Server
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    
    // 要素を検索
    const element = await page.$(args.selector);
    if (!element) {
      return createErrorResponse(`Input field not found: ${args.selector}`);
    }
    
    // 3回クリックして全選択
    await element.click({ clickCount: 3 });
    
    // Backspaceキーを押して削除
    await page.keyboard.press('Backspace');
    
    return createSuccessResponse(
      `Cleared input field: ${args.selector}`
    );
  } catch (error) {
    return createErrorResponse(
      `Failed to clear input: ${(error as Error).message}`
    );
  }
}
