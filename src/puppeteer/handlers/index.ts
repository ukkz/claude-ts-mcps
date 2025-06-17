/**
 * ハンドラーの集約
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createErrorResponse } from "../utils.js";

// ナビゲーション系
import {
  handleNavigate,
  handleScreenshot,
  handleClick,
  handleFill,
  handleSelect,
  handleHover,
  handleEvaluate
} from "./navigation.js";

// 待機系
import {
  handleWaitForSelector,
  handleWaitForTimeout,
  handleWaitForFunction,
  handleWaitForNavigation
} from "./wait.js";

// キーボード操作系
import {
  handleKeyboardPress,
  handleKeyboardType
} from "./keyboard.js";

// ページ管理系
import {
  handleSetViewport,
  handleGoBack,
  handleGoForward,
  handleReload,
  handlePdf,
  handleEmulateDevice
} from "./page.js";

// Cookie・認証系
import {
  handleSetCookies,
  handleGetCookies,
  handleAuthenticate
} from "./cookie.js";

// 情報取得系
import {
  handleGetTitle,
  handleGetUrl,
  handleGetContent,
  handleGetText,
  handleGetElementInfo
} from "./info.js";

// Frame操作系
import {
  handleGetFrames,
  handleSwitchToFrame,
  handleSwitchToMainFrame,
  handleEvaluateInFrame,
  handleSearchAcrossFrames
} from "./frame.js";

// その他
import {
  handleAddScriptTag,
  handleClearInput
} from "./misc.js";

/**
 * ツール呼び出しを処理するメインハンドラー
 */
export async function handleToolCall(
  name: string, 
  args: any,
  server: Server
): Promise<CallToolResult> {
  try {
    switch (name) {
      // ナビゲーション系
      case "puppeteer_navigate":
        return await handleNavigate(args, server);
      case "puppeteer_screenshot":
        return await handleScreenshot(args, server);
      case "puppeteer_click":
        return await handleClick(args, server);
      case "puppeteer_fill":
        return await handleFill(args, server);
      case "puppeteer_select":
        return await handleSelect(args, server);
      case "puppeteer_hover":
        return await handleHover(args, server);
      case "puppeteer_evaluate":
        return await handleEvaluate(args, server);
      
      // 待機系
      case "puppeteer_wait_for_selector":
        return await handleWaitForSelector(args, server);
      case "puppeteer_wait_for_timeout":
        return await handleWaitForTimeout(args, server);
      case "puppeteer_wait_for_function":
        return await handleWaitForFunction(args, server);
      case "puppeteer_wait_for_navigation":
        return await handleWaitForNavigation(args, server);
      
      // キーボード操作系
      case "puppeteer_keyboard_press":
        return await handleKeyboardPress(args, server);
      case "puppeteer_keyboard_type":
        return await handleKeyboardType(args, server);
      
      // ページ管理系
      case "puppeteer_set_viewport":
        return await handleSetViewport(args, server);
      case "puppeteer_go_back":
        return await handleGoBack(args, server);
      case "puppeteer_go_forward":
        return await handleGoForward(args, server);
      case "puppeteer_reload":
        return await handleReload(args, server);
      case "puppeteer_pdf":
        return await handlePdf(args, server);
      case "puppeteer_emulate_device":
        return await handleEmulateDevice(args, server);
      
      // Cookie・認証系
      case "puppeteer_set_cookies":
        return await handleSetCookies(args, server);
      case "puppeteer_get_cookies":
        return await handleGetCookies(server);
      case "puppeteer_authenticate":
        return await handleAuthenticate(args, server);
      
      // 情報取得系
      case "puppeteer_get_title":
        return await handleGetTitle(server);
      case "puppeteer_get_url":
        return await handleGetUrl(server);
      case "puppeteer_get_content":
        return await handleGetContent(args, server);
      case "puppeteer_get_text":
        return await handleGetText(args, server);
      case "puppeteer_get_element_info":
        return await handleGetElementInfo(args, server);
      
      // Frame操作系
      case "puppeteer_get_frames":
        return await handleGetFrames(args, server);
      case "puppeteer_switch_to_frame":
        return await handleSwitchToFrame(args, server);
      case "puppeteer_switch_to_main_frame":
        return await handleSwitchToMainFrame(server);
      case "puppeteer_evaluate_in_frame":
        return await handleEvaluateInFrame(args, server);
      case "puppeteer_search_across_frames":
        return await handleSearchAcrossFrames(args, server);
      
      // その他
      case "puppeteer_add_script_tag":
        return await handleAddScriptTag(args, server);
      case "puppeteer_clear_input":
        return await handleClearInput(args, server);
      
      default:
        return createErrorResponse(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return createErrorResponse(`Tool execution failed: ${(error as Error).message}`);
  }
}
