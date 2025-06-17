/**
 * Puppeteer MCP 型定義
 * 
 * このファイルには、Puppeteer MCPサーバーで使用される
 * すべての型定義が含まれています。
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

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
 * ツールハンドラーの引数型定義
 */
export interface NavigateArgs {
  url: string;
}

export interface ScreenshotArgs {
  name: string;
  selector?: string;
  width?: number;
  height?: number;
}

export interface ClickArgs {
  selector: string;
}

export interface FillArgs {
  selector: string;
  value: string;
}

export interface SelectArgs {
  selector: string;
  value: string;
}

export interface HoverArgs {
  selector: string;
}

export interface EvaluateArgs {
  script: string;
}

export interface WaitForSelectorArgs {
  selector: string;
  timeout?: number;
  visible?: boolean;
}

export interface WaitForTimeoutArgs {
  delay: number;
}

export interface WaitForFunctionArgs {
  pageFunction: string;
  timeout?: number;
  polling?: number;
}

export interface WaitForNavigationArgs {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  timeout?: number;
}

export interface KeyboardPressArgs {
  key: string;
  delay?: number;
}

export interface KeyboardTypeArgs {
  text: string;
  delay?: number;
}

export interface SetViewportArgs {
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
}

export interface GoBackArgs {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
}

export interface GoForwardArgs {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
}

export interface ReloadArgs {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
}

export interface PdfArgs {
  path?: string;
  format?: string;
  printBackground?: boolean;
}

export interface EmulateDeviceArgs {
  device: string;
}

export interface CookieObject {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface SetCookiesArgs {
  cookies: CookieObject[];
}

export interface AuthenticateArgs {
  username: string;
  password: string;
}

export interface GetContentArgs {
  fullPage?: boolean;
}

export interface GetTextArgs {
  selector: string;
}

export interface GetFramesArgs {
  detailed?: boolean;
}

export interface SwitchToFrameArgs {
  frameSelector?: string;
  frameName?: string;
  frameIndex?: number;
}

export interface EvaluateInFrameArgs {
  script: string;
  frameSelector?: string;
  frameName?: string;
}

export interface GetElementInfoArgs {
  selector: string;
  includeStyles?: boolean;
  includeAccessibility?: boolean;
}

export interface SearchAcrossFramesArgs {
  selector?: string;
  text?: string;
  attributes?: Record<string, string>;
}

export interface AddScriptTagArgs {
  url?: string;
  path?: string;
  content?: string;
}

export interface ClearInputArgs {
  selector: string;
}

/**
 * ツールカテゴリ
 */
export enum ToolCategory {
  Navigation = 'navigation',
  Wait = 'wait',
  Keyboard = 'keyboard',
  Page = 'page',
  Cookie = 'cookie',
  Info = 'info',
  Frame = 'frame',
  Misc = 'misc',
}

/**
 * ツール定義型
 */
export type ToolDefinition = Tool;
