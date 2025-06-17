#!/usr/bin/env node

/**
 * Puppeteer MCP (Model Context Protocol) サーバー
 * 
 * このモジュールは、Puppeteerを使用してブラウザを操作するためのMCPサーバーを実装しています。
 * Webページのナビゲーション、スクリーンショット取得、要素のクリック、フォーム入力などの
 * 基本的なブラウザ操作とフレーム操作をAIモデルから利用可能にします。
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ツール定義のインポート
import { TOOLS } from "./tools/index.js";

// ハンドラーのインポート
import { handleToolCall } from "./handlers/index.js";

// 状態管理のインポート
import { 
  getBrowser,
  getConsoleLogs,
  getScreenshot,
  getScreenshotNames,
  getPdf,
  getPdfNames
} from "./state.js";

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

// リクエストハンドラの設定
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "console://logs",
      mimeType: "text/plain",
      name: "Browser console logs",
    },
    ...getScreenshotNames().map(name => ({
      uri: `screenshot://${name}`,
      mimeType: "image/png",
      name: `Screenshot: ${name}`,
    })),
    ...getPdfNames().map(name => ({
      uri: `pdf://${name}`,
      mimeType: "application/pdf",
      name: `PDF: ${name}`,
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
        text: getConsoleLogs().join("\n"),
      }],
    };
  }

  if (uri.startsWith("screenshot://")) {
    const name = uri.split("://")[1];
    const screenshot = getScreenshot(name);
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

  if (uri.startsWith("pdf://")) {
    const name = uri.split("://")[1];
    const pdf = getPdf(name);
    if (pdf) {
      return {
        contents: [{
          uri,
          mimeType: "application/pdf",
          blob: pdf,
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
  handleToolCall(request.params.name, request.params.arguments ?? {}, server)
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
  const browser = getBrowser();
  browser?.close();
  server.close();
});
