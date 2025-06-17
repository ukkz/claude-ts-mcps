/**
 * Frame操作系ツール定義
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const frameTools: Tool[] = [
  {
    name: "puppeteer_get_frames",
    description: "Get information about all frames on the page",
    inputSchema: {
      type: "object",
      properties: {
        detailed: { type: "boolean", description: "Include detailed frame information" },
      },
    },
  },
  {
    name: "puppeteer_switch_to_frame",
    description: "Switch context to a specific frame",
    inputSchema: {
      type: "object",
      properties: {
        frameSelector: { type: "string", description: "CSS selector for the frame element" },
        frameName: { type: "string", description: "Name attribute of the frame" },
        frameIndex: { type: "number", description: "Index of the frame (0-based)" },
      },
    },
  },
  {
    name: "puppeteer_switch_to_main_frame",
    description: "Switch context back to the main frame",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "puppeteer_evaluate_in_frame",
    description: "Execute JavaScript in a specific frame",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "JavaScript code to execute" },
        frameSelector: { type: "string", description: "CSS selector for the frame element" },
        frameName: { type: "string", description: "Name attribute of the frame" },
      },
      required: ["script"],
    },
  },
  {
    name: "puppeteer_search_across_frames",
    description: "Search for elements across all frames",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector to search for" },
        text: { type: "string", description: "Text content to search for" },
        attributes: {
          type: "object",
          description: "Attribute conditions to match",
          additionalProperties: { type: "string" },
        },
      },
    },
  },
];
