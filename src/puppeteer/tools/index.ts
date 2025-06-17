/**
 * ツール定義の集約
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { navigationTools } from "./navigation.js";
import { waitTools } from "./wait.js";
import { keyboardTools } from "./keyboard.js";
import { pageTools } from "./page.js";
import { cookieTools } from "./cookie.js";
import { infoTools } from "./info.js";
import { frameTools } from "./frame.js";
import { miscTools } from "./misc.js";

/**
 * すべてのツール定義
 */
export const TOOLS: Tool[] = [
  ...navigationTools,
  ...waitTools,
  ...keyboardTools,
  ...pageTools,
  ...cookieTools,
  ...infoTools,
  ...frameTools,
  ...miscTools,
];
