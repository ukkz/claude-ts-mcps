/**
 * ページ管理系ツール定義
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const pageTools: Tool[] = [
  {
    name: "puppeteer_set_viewport",
    description: "Set the viewport size of the page",
    inputSchema: {
      type: "object",
      properties: {
        width: { type: "number", description: "Viewport width in pixels" },
        height: { type: "number", description: "Viewport height in pixels" },
        deviceScaleFactor: { type: "number", description: "Device scale factor (default: 1)" },
        isMobile: { type: "boolean", description: "Whether to emulate mobile device" },
        hasTouch: { type: "boolean", description: "Whether to support touch events" },
      },
      required: ["width", "height"],
    },
  },
  {
    name: "puppeteer_go_back",
    description: "Navigate back in browser history",
    inputSchema: {
      type: "object",
      properties: {
        waitUntil: {
          type: "string",
          description: "When to consider navigation succeeded",
          enum: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
        },
      },
    },
  },
  {
    name: "puppeteer_go_forward",
    description: "Navigate forward in browser history",
    inputSchema: {
      type: "object",
      properties: {
        waitUntil: {
          type: "string",
          description: "When to consider navigation succeeded",
          enum: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
        },
      },
    },
  },
  {
    name: "puppeteer_reload",
    description: "Reload the current page",
    inputSchema: {
      type: "object",
      properties: {
        waitUntil: {
          type: "string",
          description: "When to consider reload succeeded",
          enum: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
        },
      },
    },
  },
  {
    name: "puppeteer_pdf",
    description: "Generate PDF from the current page",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional path to save PDF" },
        format: {
          type: "string",
          description: "Paper format",
          enum: ["Letter", "Legal", "Tabloid", "Ledger", "A0", "A1", "A2", "A3", "A4", "A5", "A6"],
        },
        printBackground: {
          type: "boolean",
          description: "Print background graphics (default: false)",
        },
      },
    },
  },
  {
    name: "puppeteer_emulate_device",
    description: "Emulate a specific device",
    inputSchema: {
      type: "object",
      properties: {
        device: {
          type: "string",
          description: "Device name (e.g., 'iPhone 12', 'iPad', 'iPhone SE', 'Pixel 5')",
        },
      },
      required: ["device"],
    },
  },
];
