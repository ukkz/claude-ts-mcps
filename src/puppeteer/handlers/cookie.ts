/**
 * Cookie・認証系ハンドラー
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createErrorResponse, createSuccessResponse, ensureBrowser } from "../utils.js";
import { SetCookiesArgs, AuthenticateArgs } from "../types.js";

/**
 * Cookieを設定する処理
 */
export async function handleSetCookies(
  args: SetCookiesArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    await page.setCookie(...args.cookies);

    return createSuccessResponse(
      `Set ${args.cookies.length} cookie(s):\n` +
        args.cookies.map((c) => `- ${c.name}=${c.value}`).join("\n"),
    );
  } catch (error) {
    return createErrorResponse(`Failed to set cookies: ${(error as Error).message}`);
  }
}

/**
 * Cookieを取得する処理
 */
export async function handleGetCookies(server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    const cookies = await page.cookies();

    return createSuccessResponse(
      `Found ${cookies.length} cookie(s):\n` + JSON.stringify(cookies, null, 2),
    );
  } catch (error) {
    return createErrorResponse(`Failed to get cookies: ${(error as Error).message}`);
  }
}

/**
 * HTTP認証情報を設定する処理
 */
export async function handleAuthenticate(
  args: AuthenticateArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    await page.authenticate({
      username: args.username,
      password: args.password,
    });

    return createSuccessResponse(`HTTP authentication set for user: ${args.username}`);
  } catch (error) {
    return createErrorResponse(`Failed to set authentication: ${(error as Error).message}`);
  }
}
