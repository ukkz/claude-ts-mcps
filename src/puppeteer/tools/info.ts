/**
 * 情報取得系ツール定義
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const infoTools: Tool[] = [
  {
    name: "puppeteer_get_title",
    description: "Get the page title",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "puppeteer_get_url",
    description: "Get the current page URL",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "puppeteer_get_content",
    description: "Get the full HTML content of the page",
    inputSchema: {
      type: "object",
      properties: {
        fullPage: {
          type: "boolean",
          description: "Whether to get the full HTML including doctype",
        },
      },
    },
  },
  {
    name: "puppeteer_get_text",
    description: "Get the text content of an element",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of the element" },
      },
      required: ["selector"],
    },
  },
  {
    name: "puppeteer_get_element_info",
    description: "Get detailed information about an element",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of the element" },
        includeStyles: { type: "boolean", description: "Include computed styles" },
        includeAccessibility: { type: "boolean", description: "Include accessibility information" },
      },
      required: ["selector"],
    },
  },
];
