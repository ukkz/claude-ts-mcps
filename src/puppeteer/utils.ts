/**
 * Puppeteer MCP 共通ユーティリティ
 *
 * このモジュールには、複数のハンドラーで使用される
 * 共通のユーティリティ関数が含まれています。
 */

import puppeteer, { Page, Frame } from "puppeteer";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult, TextContent, ImageContent } from "@modelcontextprotocol/sdk/types.js";
import { getBrowser, setBrowser, setPage, getPage, addConsoleLog } from "./state.js";

/**
 * 統一されたエラーレスポンスを生成
 */
export function createErrorResponse(message: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    isError: true,
  };
}

/**
 * 統一された成功レスポンスを生成
 */
export function createSuccessResponse(message: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    isError: false,
  };
}

/**
 * テキストと画像を含む成功レスポンスを生成
 */
export function createSuccessResponseWithImage(
  text: string,
  imageData: string,
  mimeType: string = "image/png",
): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: text,
      } as TextContent,
      {
        type: "image",
        data: imageData,
        mimeType: mimeType,
      } as ImageContent,
    ],
    isError: false,
  };
}

/**
 * ブラウザインスタンスが存在することを保証し、ページを返します
 * 初めて呼び出された場合、ブラウザを起動して設定します
 */
export async function ensureBrowser(server: Server): Promise<Page> {
  let browser = getBrowser();
  let page = getPage();

  if (!browser) {
    // ブラウザを起動
    browser = await puppeteer.launch({ headless: false });
    setBrowser(browser);

    const pages = await browser.pages();
    page = pages[0];
    setPage(page);

    // コンソールログのキャプチャ設定
    if (page) {
      page.on("console", (msg) => {
      const logEntry = `[${msg.type()}] ${msg.text()}`;
      addConsoleLog(logEntry);
      server.notification({
        method: "notifications/resources/updated",
        params: { uri: "console://logs" },
        });
      });
    }
  }

  if (!page) {
    throw new Error("Failed to initialize browser page");
  }
  return page;
}

/**
 * 現在のフレームコンテキストまたはメインフレームを取得
 */
export function getCurrentContextFrame(page: Page): Page | Frame {
  const currentFrame = getCurrentFrame();
  return currentFrame || page.mainFrame();
}

/**
 * フレームを検索するユーティリティ関数
 */
export async function findFrame(
  page: Page,
  args: {
    frameSelector?: string;
    frameName?: string;
    frameIndex?: number;
  },
): Promise<Frame | undefined> {
  if (args.frameSelector) {
    // CSSセレクタでフレーム要素を検索
    const frameElement = await page.$(args.frameSelector);
    if (!frameElement) return undefined;

    const frameContent = await frameElement.contentFrame();
    return frameContent || undefined;
  } else if (args.frameName) {
    // 名前でフレームを検索
    const frames = page.frames();
    return frames.find((f) => f.name() === args.frameName);
  } else if (args.frameIndex !== undefined) {
    // インデックスでフレームを検索
    const frames = page.frames();
    if (args.frameIndex < 0 || args.frameIndex >= frames.length) {
      return undefined;
    }
    return frames[args.frameIndex];
  }

  return undefined;
}

// getCurrentFrameのインポートが必要
import { getCurrentFrame } from "./state.js";
