/**
 * その他のツール定義
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const miscTools: Tool[] = [
  {
    name: "puppeteer_add_script_tag",
    description: "Add a script tag to the page",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL of the script to add" },
        path: { type: "string", description: "Local file path of the script" },
        content: { type: "string", description: "Inline script content" },
      },
    },
  },
  {
    name: "puppeteer_clear_input",
    description: "Clear an input field",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of the input field" },
      },
      required: ["selector"],
    },
  },
];
