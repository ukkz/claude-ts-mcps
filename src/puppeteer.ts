#!/usr/bin/env node

/**
 * Puppeteer MCP (Model Context Protocol) サーバー
 * 
 * このモジュールは、Puppeteerを使用してブラウザを操作するためのMCPサーバーを実装しています。
 * Webページのナビゲーション、スクリーンショット取得、要素のクリック、フォーム入力などの
 * 基本的なブラウザ操作をAIモデルから利用可能にします。
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult,
  TextContent,
  ImageContent,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer, { Browser, Page } from "puppeteer";

// ツール定義
const TOOLS: Tool[] = [
  {
    name: "puppeteer_navigate",
    description: "Navigate to a URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target URL to navigate to" },
      },
      required: ["url"],
    },
  },
  {
    name: "puppeteer_screenshot",
    description: "Take a screenshot of the current page or a specific element",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name for the screenshot" },
        selector: { type: "string", description: "CSS selector for element to screenshot" },
        width: { type: "number", description: "Width in pixels (default: 800)" },
        height: { type: "number", description: "Height in pixels (default: 600)" },
      },
      required: ["name"],
    },
  },
  {
    name: "puppeteer_click",
    description: "Click an element on the page",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for element to click" },
      },
      required: ["selector"],
    },
  },
  {
    name: "puppeteer_fill",
    description: "Fill out an input field",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for input field" },
        value: { type: "string", description: "Value to fill" },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "puppeteer_select",
    description: "Select an option from a select element",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for select element" },
        value: { type: "string", description: "Value to select" },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "puppeteer_hover",
    description: "Hover over an element on the page",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for element to hover" },
      },
      required: ["selector"],
    },
  },
  {
    name: "puppeteer_evaluate",
    description: "Execute JavaScript in the browser console",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "JavaScript code to execute" },
      },
      required: ["script"],
    },
  },
];

// グローバル状態
let browser: Browser | undefined;
let page: Page | undefined;
const consoleLogs: string[] = [];
const screenshots = new Map<string, string>();

// サーバーインスタンス
const server = new Server(
  {
    name: "puppeteer-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

/**
 * グローバルなWindow型定義の拡張
 */
declare global {
  interface Window {
    mcpHelper: {
      logs: string[],
      originalConsole: Partial<typeof console>,
    }
  }
}

/**
 * ブラウザインスタンスが存在することを保証し、ページを返します
 * 初めて呼び出された場合、ブラウザを起動して設定します
 */
async function ensureBrowser(): Promise<Page> {
  if (!browser) {
    // ブラウザを起動
    browser = await puppeteer.launch({ headless: false });
    const pages = await browser.pages();
    page = pages[0];

    // コンソールログのキャプチャ設定
    page.on("console", (msg) => {
      const logEntry = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(logEntry);
      server.notification({
        method: "notifications/resources/updated",
        params: { uri: "console://logs" },
      });
    });
  }
  return page!;
}

/**
 * 統一されたエラーレスポンスを生成
 */
function createErrorResponse(message: string): CallToolResult {
  return {
    content: [{
      type: "text",
      text: message,
    }],
    isError: true,
  };
}

/**
 * 統一された成功レスポンスを生成
 */
function createSuccessResponse(message: string): CallToolResult {
  return {
    content: [{
      type: "text",
      text: message,
    }],
    isError: false,
  };
}

/**
 * URLへの移動を処理
 */
async function handleNavigate(args: { url: string }): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser();
    await page.goto(args.url);
    return createSuccessResponse(`Navigated to ${args.url}`);
  } catch (error) {
    return createErrorResponse(`Failed to navigate to ${args.url}: ${(error as Error).message}`);
  }
}

/**
 * スクリーンショット撮影を処理
 */
async function handleScreenshot(args: { 
  name: string; 
  selector?: string; 
  width?: number; 
  height?: number;
}): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser();
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
    screenshots.set(args.name, screenshot as string);
    server.notification({
      method: "notifications/resources/list_changed",
    });

    return {
      content: [
        {
          type: "text",
          text: `Screenshot '${args.name}' taken at ${width}x${height}`,
        } as TextContent,
        {
          type: "image",
          data: screenshot,
          mimeType: "image/png",
        } as ImageContent,
      ],
      isError: false,
    };
  } catch (error) {
    return createErrorResponse(`Screenshot failed: ${(error as Error).message}`);
  }
}

/**
 * 要素のクリックを処理
 */
async function handleClick(args: { selector: string }): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser();
    await page.click(args.selector);
    return createSuccessResponse(`Clicked: ${args.selector}`);
  } catch (error) {
    return createErrorResponse(`Failed to click ${args.selector}: ${(error as Error).message}`);
  }
}

/**
 * フォーム入力を処理
 */
async function handleFill(args: { selector: string; value: string }): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser();
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
async function handleSelect(args: { selector: string; value: string }): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser();
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
async function handleHover(args: { selector: string }): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser();
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
async function handleEvaluate(args: { script: string }): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser();
    
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

/**
 * ツール呼び出しを処理するメインハンドラー
 */
async function handleToolCall(name: string, args: any): Promise<CallToolResult> {
  try {
    switch (name) {
      case "puppeteer_navigate":
        return await handleNavigate(args);
      
      case "puppeteer_screenshot":
        return await handleScreenshot(args);
      
      case "puppeteer_click":
        return await handleClick(args);
      
      case "puppeteer_fill":
        return await handleFill(args);
      
      case "puppeteer_select":
        return await handleSelect(args);
      
      case "puppeteer_hover":
        return await handleHover(args);
      
      case "puppeteer_evaluate":
        return await handleEvaluate(args);
      
      default:
        return createErrorResponse(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return createErrorResponse(`Tool execution failed: ${(error as Error).message}`);
  }
}

// リクエストハンドラの設定
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "console://logs",
      mimeType: "text/plain",
      name: "Browser console logs",
    },
    ...Array.from(screenshots.keys()).map(name => ({
      uri: `screenshot://${name}`,
      mimeType: "image/png",
      name: `Screenshot: ${name}`,
    })),
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri.toString();

  if (uri === "console://logs") {
    return {
      contents: [{
        uri,
        mimeType: "text/plain",
        text: consoleLogs.join("\n"),
      }],
    };
  }

  if (uri.startsWith("screenshot://")) {
    const name = uri.split("://")[1];
    const screenshot = screenshots.get(name);
    if (screenshot) {
      return {
        contents: [{
          uri,
          mimeType: "image/png",
          blob: screenshot,
        }],
      };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  handleToolCall(request.params.name, request.params.arguments ?? {})
);

/**
 * MCPサーバーを起動
 */
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// サーバー起動
runServer().catch(console.error);

// 終了処理
process.stdin.on("close", () => {
  console.error("Puppeteer MCP Server closed");
  browser?.close();
  server.close();
});
