/**
 * キーボード操作系ツール定義
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const keyboardTools: Tool[] = [
  {
    name: "puppeteer_keyboard_press",
    description: "Press a specific key or key combination",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description:
            "Key to press (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown', 'Space', 'Control+A', 'Shift+Tab')",
        },
        delay: {
          type: "number",
          description: "Delay between keydown and keyup in milliseconds",
        },
      },
      required: ["key"],
    },
  },
  {
    name: "puppeteer_keyboard_type",
    description: "Type text with fine-grained control over typing speed",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to type",
        },
        delay: {
          type: "number",
          description: "Delay between each character in milliseconds (simulates human typing)",
        },
      },
      required: ["text"],
    },
  },
];
