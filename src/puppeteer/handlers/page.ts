/**
 * ページ管理系ハンドラー
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import puppeteer from "puppeteer";
import { createErrorResponse, createSuccessResponse, ensureBrowser } from "../utils.js";
import { savePdf } from "../state.js";
import {
  SetViewportArgs,
  GoBackArgs,
  GoForwardArgs,
  ReloadArgs,
  PdfArgs,
  EmulateDeviceArgs
} from "../types.js";

/**
 * ビューポートサイズを設定する処理
 */
export async function handleSetViewport(
  args: SetViewportArgs,
  server: Server
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    
    await page.setViewport({
      width: args.width,
      height: args.height,
      deviceScaleFactor: args.deviceScaleFactor ?? 1,
      isMobile: args.isMobile ?? false,
      hasTouch: args.hasTouch ?? false,
    });
    
    return createSuccessResponse(
      `Viewport set to ${args.width}x${args.height}\n` +
      `Device scale factor: ${args.deviceScaleFactor ?? 1}\n` +
      `Mobile emulation: ${args.isMobile ?? false}\n` +
      `Touch support: ${args.hasTouch ?? false}`
    );
  } catch (error) {
    return createErrorResponse(
      `Failed to set viewport: ${(error as Error).message}`
    );
  }
}

/**
 * ブラウザ履歴を戻る処理
 */
export async function handleGoBack(
  args: GoBackArgs,
  server: Server
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    const startTime = Date.now();
    const initialUrl = page.url();
    
    const response = await page.goBack({
      waitUntil: args.waitUntil || 'load',
    });
    
    if (!response) {
      return createErrorResponse("No previous page in history");
    }
    
    const elapsed = Date.now() - startTime;
    const finalUrl = page.url();
    
    return createSuccessResponse(
      `Navigated back in ${elapsed}ms\n` +
      `From: ${initialUrl}\n` +
      `To: ${finalUrl}`
    );
  } catch (error) {
    return createErrorResponse(
      `Failed to go back: ${(error as Error).message}`
    );
  }
}

/**
 * ブラウザ履歴を進む処理
 */
export async function handleGoForward(
  args: GoForwardArgs,
  server: Server
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    const startTime = Date.now();
    const initialUrl = page.url();
    
    const response = await page.goForward({
      waitUntil: args.waitUntil || 'load',
    });
    
    if (!response) {
      return createErrorResponse("No forward page in history");
    }
    
    const elapsed = Date.now() - startTime;
    const finalUrl = page.url();
    
    return createSuccessResponse(
      `Navigated forward in ${elapsed}ms\n` +
      `From: ${initialUrl}\n` +
      `To: ${finalUrl}`
    );
  } catch (error) {
    return createErrorResponse(
      `Failed to go forward: ${(error as Error).message}`
    );
  }
}

/**
 * ページをリロードする処理
 */
export async function handleReload(
  args: ReloadArgs,
  server: Server
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    const startTime = Date.now();
    const url = page.url();
    
    await page.reload({
      waitUntil: args.waitUntil || 'load',
    });
    
    const elapsed = Date.now() - startTime;
    
    return createSuccessResponse(
      `Page reloaded in ${elapsed}ms\n` +
      `URL: ${url}\n` +
      `Wait condition: ${args.waitUntil || 'load'}`
    );
  } catch (error) {
    return createErrorResponse(
      `Failed to reload page: ${(error as Error).message}`
    );
  }
}

/**
 * PDFを生成する処理
 */
export async function handlePdf(
  args: PdfArgs,
  server: Server
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    const pdfName = args.path || `pdf_${Date.now()}.pdf`;
    
    const pdfOptions: any = {
      printBackground: args.printBackground ?? false,
    };
    
    if (args.format) {
      pdfOptions.format = args.format;
    }
    
    // PDFを生成
    const pdfBuffer = await page.pdf(pdfOptions);
    const pdfBase64 = pdfBuffer.toString('base64');
    
    // PDFを保存
    savePdf(pdfName, pdfBase64);
    
    // リソースリストを更新
    server.notification({
      method: "notifications/resources/list_changed",
    });
    
    return createSuccessResponse(
      `PDF generated: ${pdfName}\n` +
      `Format: ${args.format || 'default'}\n` +
      `Print background: ${args.printBackground ?? false}\n` +
      `Size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`
    );
  } catch (error) {
    return createErrorResponse(
      `Failed to generate PDF: ${(error as Error).message}`
    );
  }
}

/**
 * デバイスをエミュレートする処理
 */
export async function handleEmulateDevice(
  args: EmulateDeviceArgs,
  server: Server
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);
    
    // Puppeteerの事前定義デバイスを取得
    const devices = puppeteer.devices;
    const device = devices[args.device];
    
    if (!device) {
      // 利用可能なデバイス名をリストアップ
      const availableDevices = Object.keys(devices).join(', ');
      return createErrorResponse(
        `Device '${args.device}' not found.\n` +
        `Available devices: ${availableDevices}`
      );
    }
    
    await page.emulate(device);
    
    return createSuccessResponse(
      `Emulating device: ${args.device}\n` +
      `Viewport: ${device.viewport.width}x${device.viewport.height}\n` +
      `User Agent: ${device.userAgent}\n` +
      `Has touch: ${device.viewport.hasTouch}\n` +
      `Is mobile: ${device.viewport.isMobile}`
    );
  } catch (error) {
    return createErrorResponse(
      `Failed to emulate device: ${(error as Error).message}`
    );
  }
}
