/**
 * 待機系ツール定義
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const waitTools: Tool[] = [
  {
    name: "puppeteer_wait_for_selector",
    description: "Wait for an element to appear on the page",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector to wait for" },
        timeout: {
          type: "number",
          description: "Maximum time to wait in milliseconds (default: 30000)",
        },
        visible: {
          type: "boolean",
          description: "Wait for element to be visible (default: false)",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "puppeteer_wait_for_timeout",
    description: "Wait for a specified amount of time",
    inputSchema: {
      type: "object",
      properties: {
        delay: { type: "number", description: "Time to wait in milliseconds" },
      },
      required: ["delay"],
    },
  },
  {
    name: "puppeteer_wait_for_function",
    description: "Wait for a JavaScript function to return true",
    inputSchema: {
      type: "object",
      properties: {
        pageFunction: {
          type: "string",
          description: "JavaScript function to evaluate in browser context",
        },
        timeout: {
          type: "number",
          description: "Maximum time to wait in milliseconds (default: 30000)",
        },
        polling: { type: "number", description: "Polling interval in milliseconds" },
      },
      required: ["pageFunction"],
    },
  },
  {
    name: "puppeteer_wait_for_navigation",
    description: "Wait for page navigation to complete",
    inputSchema: {
      type: "object",
      properties: {
        waitUntil: {
          type: "string",
          description:
            "When to consider navigation succeeded ('load', 'domcontentloaded', 'networkidle0', 'networkidle2')",
          enum: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
        },
        timeout: {
          type: "number",
          description: "Maximum time to wait in milliseconds (default: 30000)",
        },
      },
    },
  },
];
