/**
 * 情報取得系ハンドラー
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createErrorResponse, createSuccessResponse, ensureBrowser } from "../utils.js";
import { GetContentArgs, GetTextArgs, GetElementInfoArgs } from "../types.js";

/**
 * ページタイトルを取得する処理
 */
export async function handleGetTitle(server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    const title = await page.title();

    return createSuccessResponse(`Page title: "${title}"`);
  } catch (error) {
    return createErrorResponse(`Failed to get title: ${(error as Error).message}`);
  }
}

/**
 * 現在のURLを取得する処理
 */
export async function handleGetUrl(server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    const url = page.url();

    return createSuccessResponse(`Current URL: ${url}`);
  } catch (error) {
    return createErrorResponse(`Failed to get URL: ${(error as Error).message}`);
  }
}

/**
 * ページのHTMLコンテンツを取得する処理
 */
export async function handleGetContent(
  _args: GetContentArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    const content = await page.content();
    const length = content.length;

    // コンテンツが大きすぎる場合は省略
    const maxLength = 10000;
    const displayContent =
      length > maxLength ? content.substring(0, maxLength) + "\n\n... (truncated)" : content;

    return createSuccessResponse(`HTML content (${length} characters):\n\n${displayContent}`);
  } catch (error) {
    return createErrorResponse(`Failed to get content: ${(error as Error).message}`);
  }
}

/**
 * 要素のテキストを取得する処理
 */
export async function handleGetText(args: GetTextArgs, server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    const element = await page.$(args.selector);
    if (!element) {
      return createErrorResponse(`Element not found: ${args.selector}`);
    }

    const text = await page.evaluate((el) => el.textContent || "", element);

    return createSuccessResponse(`Text content of ${args.selector}:\n"${text}"`);
  } catch (error) {
    return createErrorResponse(`Failed to get text: ${(error as Error).message}`);
  }
}

/**
 * 要素の詳細情報を取得する処理
 */
export async function handleGetElementInfo(
  args: GetElementInfoArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    const element = await page.$(args.selector);
    if (!element) {
      return createErrorResponse(`Element not found: ${args.selector}`);
    }

    const info = await page.evaluate(
      (selector, includeStyles, includeAccessibility) => {
        const el = document.querySelector(selector);
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        const info: any = {
          tagName: el.tagName,
          id: el.id,
          className: el.className,
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
          },
          attributes: {} as any,
          isVisible: rect.width > 0 && rect.height > 0,
          text: (el as HTMLElement).innerText || "",
        };

        // 属性を収集
        for (const attr of el.attributes) {
          info.attributes[attr.name] = attr.value;
        }

        // クリック可能性の判定
        const style = window.getComputedStyle(el);
        info.isClickable =
          style.pointerEvents !== "none" &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          parseFloat(style.opacity) > 0;

        if (includeStyles) {
          // 計算済みスタイルを取得
          info.computedStyles = {
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            position: style.position,
            zIndex: style.zIndex,
            pointerEvents: style.pointerEvents,
            color: style.color,
            backgroundColor: style.backgroundColor,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
          };
        }

        if (includeAccessibility) {
          // アクセシビリティ情報
          info.accessibility = {
            role: el.getAttribute("role"),
            ariaLabel: el.getAttribute("aria-label"),
            ariaDescribedBy: el.getAttribute("aria-describedby"),
            ariaHidden: el.getAttribute("aria-hidden"),
            tabIndex: el.getAttribute("tabindex"),
          };
        }

        return info;
      },
      args.selector,
      args.includeStyles,
      args.includeAccessibility,
    );

    return createSuccessResponse(
      `Element info for ${args.selector}:\n${JSON.stringify(info, null, 2)}`,
    );
  } catch (error) {
    return createErrorResponse(`Failed to get element info: ${(error as Error).message}`);
  }
}
