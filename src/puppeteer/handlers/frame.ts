/**
 * Frame操作系ハンドラー
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Frame } from "puppeteer";
import { createErrorResponse, createSuccessResponse, ensureBrowser, findFrame } from "../utils.js";
import { getCurrentFrame, setCurrentFrame } from "../state.js";
import {
  GetFramesArgs,
  SwitchToFrameArgs,
  EvaluateInFrameArgs,
  SearchAcrossFramesArgs,
} from "../types.js";

/**
 * フレーム情報を取得する処理
 */
export async function handleGetFrames(
  args: GetFramesArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    // フレームツリーを再帰的に取得
    const getFrameInfo = async (frame: Frame, level: number = 0): Promise<any> => {
      const url = frame.url();
      const name = frame.name();
      const parentFrame = frame.parentFrame();

      const info: any = {
        level,
        url,
        name: name || "(unnamed)",
        isMainFrame: frame === page.mainFrame(),
        parentUrl: parentFrame ? parentFrame.url() : null,
      };

      if (args.detailed) {
        try {
          // クロスオリジンフレームの場合はアクセスできない可能性
          const title = await frame.title().catch(() => "(inaccessible)");
          info.title = title;
        } catch (e) {
          info.title = "(error)";
        }
      }

      // 子フレームを収集
      const childFrames = frame.childFrames();
      if (childFrames.length > 0) {
        info.children = [];
        for (const child of childFrames) {
          info.children.push(await getFrameInfo(child, level + 1));
        }
      }

      return info;
    };

    const frameTree = await getFrameInfo(page.mainFrame());

    return createSuccessResponse(`Frame tree:\n${JSON.stringify(frameTree, null, 2)}`);
  } catch (error) {
    return createErrorResponse(`Failed to get frames: ${(error as Error).message}`);
  }
}

/**
 * 特定のフレームに切り替える処理
 */
export async function handleSwitchToFrame(
  args: SwitchToFrameArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    const targetFrame = await findFrame(page, args);

    if (!targetFrame) {
      if (args.frameSelector) {
        return createErrorResponse(`Frame element not found: ${args.frameSelector}`);
      } else if (args.frameName) {
        return createErrorResponse(`Frame not found with name: ${args.frameName}`);
      } else if (args.frameIndex !== undefined) {
        const frames = page.frames();
        return createErrorResponse(
          `Frame index out of range: ${args.frameIndex} (available: 0-${frames.length - 1})`,
        );
      }
      return createErrorResponse("Must specify either frameSelector, frameName, or frameIndex");
    }

    // フレームコンテキストを切り替え
    setCurrentFrame(targetFrame);

    return createSuccessResponse(
      `Switched to frame:\n` +
        `URL: ${targetFrame.url()}\n` +
        `Name: ${targetFrame.name() || "(unnamed)"}`,
    );
  } catch (error) {
    return createErrorResponse(`Failed to switch to frame: ${(error as Error).message}`);
  }
}

/**
 * メインフレームに戻る処理
 */
export async function handleSwitchToMainFrame(server: Server): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    // メインフレームに切り替え
    setCurrentFrame(page.mainFrame());

    return createSuccessResponse(`Switched back to main frame\n` + `URL: ${page.url()}`);
  } catch (error) {
    return createErrorResponse(`Failed to switch to main frame: ${(error as Error).message}`);
  }
}

/**
 * 特定のフレーム内でJavaScriptを実行する処理
 */
export async function handleEvaluateInFrame(
  args: EvaluateInFrameArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    let targetFrame: Frame | undefined;

    // フレームを特定
    if (args.frameSelector || args.frameName) {
      targetFrame = await findFrame(page, args);
      if (!targetFrame) {
        return createErrorResponse(
          args.frameSelector
            ? `Frame element not found: ${args.frameSelector}`
            : `Frame not found with name: ${args.frameName}`,
        );
      }
    } else {
      // 現在のフレームコンテキストを使用
      const current = getCurrentFrame();
      targetFrame = (current as Frame) || page.mainFrame();
    }

    // スクリプトを実行
    const result = await targetFrame.evaluate(args.script);

    return createSuccessResponse(
      `Executed in frame: ${targetFrame.url()}\n` + `Result: ${JSON.stringify(result, null, 2)}`,
    );
  } catch (error) {
    return createErrorResponse(`Failed to evaluate in frame: ${(error as Error).message}`);
  }
}

/**
 * 全フレームから要素を検索する処理
 */
export async function handleSearchAcrossFrames(
  args: SearchAcrossFramesArgs,
  server: Server,
): Promise<CallToolResult> {
  try {
    const page = await ensureBrowser(server);

    const results: any[] = [];

    // フレームを再帰的に検索
    const searchInFrame = async (frame: Frame, framePath: string[]) => {
      try {
        const frameResults = await frame.evaluate(
          (selector, text, attributes) => {
            const matches: any[] = [];

            if (selector) {
              // CSSセレクタで検索
              const elements = document.querySelectorAll(selector);
              elements.forEach((el, index) => {
                matches.push({
                  type: "selector",
                  selector,
                  index,
                  tagName: el.tagName,
                  text: (el as HTMLElement).innerText || "",
                });
              });
            }

            if (text) {
              // テキストで検索
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);

              let node;
              while ((node = walker.nextNode())) {
                if (node.textContent && node.textContent.includes(text)) {
                  const parent = node.parentElement;
                  if (parent) {
                    matches.push({
                      type: "text",
                      text: node.textContent,
                      parentTag: parent.tagName,
                      parentId: parent.id,
                      parentClass: parent.className,
                    });
                  }
                }
              }
            }

            if (attributes) {
              // 属性で検索
              const allElements = document.querySelectorAll("*");
              allElements.forEach((el) => {
                let matchesAll = true;
                for (const [key, value] of Object.entries(attributes)) {
                  if (el.getAttribute(key) !== value) {
                    matchesAll = false;
                    break;
                  }
                }
                if (matchesAll) {
                  matches.push({
                    type: "attributes",
                    tagName: el.tagName,
                    attributes: attributes,
                    text: (el as HTMLElement).innerText || "",
                  });
                }
              });
            }

            return matches;
          },
          args.selector,
          args.text,
          args.attributes,
        );

        // 結果にフレームパスを追加
        frameResults.forEach((result: any) => {
          result.framePath = framePath;
          result.frameUrl = frame.url();
          results.push(result);
        });
      } catch (e) {
        // クロスオリジンフレームの場合はスキップ
      }

      // 子フレームを検索
      const childFrames = frame.childFrames();
      for (let i = 0; i < childFrames.length; i++) {
        const childFrame = childFrames[i];
        if (childFrame) {
          await searchInFrame(childFrame, [...framePath, `frame[${i}]`]);
        }
      }
    };

    await searchInFrame(page.mainFrame(), ["main"]);

    return createSuccessResponse(
      `Found ${results.length} match(es):\n${JSON.stringify(results, null, 2)}`,
    );
  } catch (error) {
    return createErrorResponse(`Failed to search across frames: ${(error as Error).message}`);
  }
}
