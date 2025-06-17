/**
 * Cookie・認証系ツール定義
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const cookieTools: Tool[] = [
  {
    name: "puppeteer_set_cookies",
    description: "Set cookies for the current page",
    inputSchema: {
      type: "object",
      properties: {
        cookies: {
          type: "array",
          description: "Array of cookie objects",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              value: { type: "string" },
              domain: { type: "string" },
              path: { type: "string" },
              expires: { type: "number" },
              httpOnly: { type: "boolean" },
              secure: { type: "boolean" },
              sameSite: { type: "string", enum: ["Strict", "Lax", "None"] },
            },
            required: ["name", "value"],
          },
        },
      },
      required: ["cookies"],
    },
  },
  {
    name: "puppeteer_get_cookies",
    description: "Get all cookies for the current page",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "puppeteer_authenticate",
    description: "Set HTTP authentication credentials",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Username for authentication" },
        password: { type: "string", description: "Password for authentication" },
      },
      required: ["username", "password"],
    },
  },
];
