/**
 * Puppeteer MCP グローバル状態管理
 * 
 * このモジュールは、ブラウザインスタンス、ページ、フレーム、
 * リソースなどのグローバル状態を管理します。
 */

import { Browser, Page, Frame } from "puppeteer";

/**
 * グローバル状態の型定義
 */
interface GlobalState {
  browser: Browser | undefined;
  page: Page | undefined;
  currentFrame: Page | Frame | undefined;
  consoleLogs: string[];
  screenshots: Map<string, string>;
  pdfs: Map<string, string>;
}

/**
 * グローバル状態
 */
const state: GlobalState = {
  browser: undefined,
  page: undefined,
  currentFrame: undefined,
  consoleLogs: [],
  screenshots: new Map<string, string>(),
  pdfs: new Map<string, string>(),
};

/**
 * ブラウザインスタンスを取得
 */
export function getBrowser(): Browser | undefined {
  return state.browser;
}

/**
 * ブラウザインスタンスを設定
 */
export function setBrowser(browser: Browser | undefined): void {
  state.browser = browser;
}

/**
 * ページインスタンスを取得
 */
export function getPage(): Page | undefined {
  return state.page;
}

/**
 * ページインスタンスを設定
 */
export function setPage(page: Page | undefined): void {
  state.page = page;
}

/**
 * 現在のフレームコンテキストを取得
 */
export function getCurrentFrame(): Page | Frame | undefined {
  return state.currentFrame;
}

/**
 * 現在のフレームコンテキストを設定
 */
export function setCurrentFrame(frame: Page | Frame | undefined): void {
  state.currentFrame = frame;
}

/**
 * コンソールログを追加
 */
export function addConsoleLog(log: string): void {
  state.consoleLogs.push(log);
}

/**
 * すべてのコンソールログを取得
 */
export function getConsoleLogs(): string[] {
  return state.consoleLogs;
}

/**
 * スクリーンショットを保存
 */
export function saveScreenshot(name: string, data: string): void {
  state.screenshots.set(name, data);
}

/**
 * スクリーンショットを取得
 */
export function getScreenshot(name: string): string | undefined {
  return state.screenshots.get(name);
}

/**
 * すべてのスクリーンショット名を取得
 */
export function getScreenshotNames(): string[] {
  return Array.from(state.screenshots.keys());
}

/**
 * PDFを保存
 */
export function savePdf(name: string, data: string): void {
  state.pdfs.set(name, data);
}

/**
 * PDFを取得
 */
export function getPdf(name: string): string | undefined {
  return state.pdfs.get(name);
}

/**
 * すべてのPDF名を取得
 */
export function getPdfNames(): string[] {
  return Array.from(state.pdfs.keys());
}

/**
 * すべての状態をクリア
 */
export function clearState(): void {
  state.browser = undefined;
  state.page = undefined;
  state.currentFrame = undefined;
  state.consoleLogs = [];
  state.screenshots.clear();
  state.pdfs.clear();
}
