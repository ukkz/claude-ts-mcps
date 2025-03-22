/**
 * MCPフェッチサーバーの実装
 * URLからコンテンツを取得し、必要に応じてHTMLをMarkdownに変換するサーバー
 * このサーバーはModelContextProtocol(MCP)に対応し、ClaudeにWeb閲覧機能を提供します
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { URL } from "url"
// Fetch APIを使用するので、http/httpsのインポートは不要

// デフォルトのユーザーエージェント定義とエラーメッセージの定数
const DEFAULT_USER_AGENT_AUTONOMOUS = "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)"
const DEFAULT_USER_AGENT_MANUAL = "ModelContextProtocol/1.0 (User-Specified; +https://github.com/modelcontextprotocol/servers)"

// エラーメッセージの定数
const ERROR_MESSAGES = {
  URL_REQUIRED: "URL is required",
  ROBOT_TXT_FETCH_ERROR: "Failed to fetch robots.txt due to a connection issue",
  ROBOT_TXT_FORBIDDEN: "The robots.txt file specifies that autonomous fetching of this page is not allowed",
  ACCESS_DENIED: "When fetching robots.txt, received status 403 or 401, autonomous fetching is not allowed",
  NO_CONTENT: "<e>No more content available.</e>",
  REQUEST_TIMEOUT: "Request timeout"
}

/**
 * MCPサーバーの初期化
 * サーバー名を定義し、サーバーインスタンスを作成
 */
const server = new McpServer({
  name: "mcp-fetch",
  version: "0.1.0",
})

// サーバー設定オプション
interface ServerOptions {
  customUserAgent?: string
  ignoreRobotsTxt?: boolean
}

/**
 * 環境変数の値がtrueを表すかチェックする
 * "true", "1", "yes" などの値をtrueとして扱う
 * 
 * @param value 検証する環境変数の値
 * @returns boolean値に変換した結果
 */
function isEnvTrue(value: string | undefined): boolean {
  if (!value) return false
  return ['true', '1', 'yes', 'y'].includes(value.toLowerCase())
}

// サーバー設定のグローバルインスタンス
const globalOptions: ServerOptions = {
  customUserAgent: process.env.CUSTOM_USER_AGENT,
  ignoreRobotsTxt: isEnvTrue(process.env.IGNORE_ROBOTS_TXT)
}

/**
 * HTMLコンテンツからMarkdown形式にコンテンツを抽出する関数
 * 
 * @param html 処理するHTML文字列
 * @returns 簡略化されたMarkdown形式のコンテンツ
 */
function extractContentFromHtml(html: string): string {
  try {
    // HTMLの簡易解析とMarkdown変換処理
    // 注: Pythonの"readabilipy"と"markdownify"の相当処理を実装する必要がある
    // この実装では簡略化のためにHTMLタグを取り除くだけの簡単な処理を行う
    
    // ヘッダーやスクリプト、スタイルを取り除く
    let content = html
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    
    // 見出しの変換
    content = content.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n')
    content = content.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n')
    content = content.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n')
    content = content.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n')
    content = content.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n')
    content = content.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n')
    
    // 段落とリンクの変換
    content = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    content = content.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    
    // リストの変換
    content = content.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '$1\n')
    content = content.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '$1\n')
    content = content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    
    // 太字と斜体の変換
    content = content.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    content = content.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    content = content.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    content = content.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
    
    // 残りのHTMLタグを削除
    content = content.replace(/<[^>]*>/g, '')
    
    // 特殊文字をデコード
    content = content.replace(/&nbsp;/g, ' ')
    content = content.replace(/&lt;/g, '<')
    content = content.replace(/&gt;/g, '>')
    content = content.replace(/&amp;/g, '&')
    content = content.replace(/&quot;/g, '"')
    content = content.replace(/&#39;/g, "'")
    
    // 複数の空行を削除
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n')
    
    return content.trim() || "<e>Page failed to be simplified from HTML</e>"
  } catch (error) {
    console.error("HTML処理エラー:", error)
    return "<e>Page failed to be simplified from HTML</e>"
  }
}

/**
 * 指定されたURLからrobots.txtのURLを取得する関数
 * 
 * @param url ウェブサイトのURL
 * @returns robots.txtファイルのURL
 */
function getRobotsTxtUrl(url: string): string {
  const parsedUrl = new URL(url)
  return `${parsedUrl.protocol}//${parsedUrl.hostname}/robots.txt`
}

/**
 * robots.txtの内容を解析し、指定されたURLへのアクセスが許可されているか確認する関数
 * 
 * @param robotsTxt robots.txtの内容
 * @param url チェックするURL
 * @param userAgent 使用するUserAgent
 * @returns アクセスが許可されているかどうか
 */
function canFetchUrl(robotsTxt: string, url: string, userAgent: string): boolean {
  // 簡易的なrobots.txt解析（完全な実装はProtego相当の処理が必要）
  const lines = robotsTxt.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#')) // コメント行を除外
  
  let currentUserAgent = "*"
  let disallowedPaths: string[] = []
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase()
    
    if (lowerLine.startsWith('user-agent:')) {
      const agent = line.substring(11).trim()
      currentUserAgent = agent
      
      // 現在のユーザーエージェントに関するルールをリセット
      if (currentUserAgent === userAgent || currentUserAgent === "*") {
        disallowedPaths = []
      }
    } else if (lowerLine.startsWith('disallow:') && 
              (currentUserAgent === userAgent || currentUserAgent === "*")) {
      const path = line.substring(9).trim()
      if (path) {
        disallowedPaths.push(path)
      }
    }
  }
  
  // URLのパスを取得
  const parsedUrl = new URL(url)
  const urlPath = parsedUrl.pathname
  
  // 禁止パスと照合
  for (const path of disallowedPaths) {
    if (path === '/' || urlPath.startsWith(path)) {
      return false
    }
  }
  
  return true
}

/**
 * URLが自動的に取得可能かを確認する関数
 * robots.txtを確認し、アクセスが禁止されている場合はエラーをスロー
 * 
 * @param url チェックするURL
 * @param userAgent 使用するUserAgent
 */
async function checkMayAutonomouslyFetchUrl(url: string, userAgent: string): Promise<void> {
  const robotsTxtUrl = getRobotsTxtUrl(url)
  
  try {
    // robots.txtを取得
    const response = await fetchUrl(robotsTxtUrl, userAgent)
    const robotsTxt = response.content
    
    // アクセス権限をチェック
    if (!canFetchUrl(robotsTxt, url, userAgent)) {
      const errorMessage = [
        `${ERROR_MESSAGES.ROBOT_TXT_FORBIDDEN},`,
        `<useragent>${userAgent}</useragent>`,
        `<url>${url}</url>`,
        `<robots>\n${robotsTxt}\n</robots>`,
        `The assistant must let the user know that it failed to view the page. The assistant may provide further guidance based on the above information.`,
        `The assistant can tell the user that they can try manually fetching the page by using the fetch prompt within their UI.`
      ].join('\n')
      
      throw new Error(errorMessage)
    }
  } catch (error) {
    // エラーメッセージにステータスコードが含まれているか確認
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // アクセス拒否（401/403）が含まれている場合
    if (errorMessage.includes("401") || errorMessage.includes("403")) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED} (${robotsTxtUrl})`)
    }
    
    // 400番台のエラーでアクセス拒否以外は、robots.txtが存在しないと仮定してアクセスを許可
    if (errorMessage.includes("4")) {
      return // 404などの場合は許可
    }
    
    // それ以外のエラーは接続の問題と判断
    throw new Error(`${ERROR_MESSAGES.ROBOT_TXT_FETCH_ERROR} (${robotsTxtUrl})`)
  }
}

/**
 * URLからコンテンツを取得する関数
 * Node.jsの標準Fetch APIを使用した改善版
 * 
 * @param url 取得するURL
 * @param userAgent 使用するUserAgent
 * @param forceRaw 生のHTMLを返すかどうか
 * @returns コンテンツと前置テキスト
 */
async function fetchUrl(url: string, userAgent: string, forceRaw: boolean = false): Promise<{ content: string, prefix: string }> {
  try {
    // Fetch APIを使用してリクエストを送信
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒タイムアウト
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent
      },
      redirect: 'follow', // リダイレクトを自動的に処理
      signal: controller.signal
    })
    
    clearTimeout(timeoutId) // タイムアウトをクリア
    
    // エラーレスポンスのチェック
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url} - status code ${response.status}`)
    }
    
    // コンテンツ取得
    const data = await response.text()
    const contentType = response.headers.get('content-type') || ''
    
    // HTML判定
    const isPageHtml = (
      data.slice(0, 100).includes('<html') || 
      contentType.includes('text/html') || 
      !contentType
    )
    
    // 結果の生成と返却
    if (isPageHtml && !forceRaw) {
      // HTMLをMarkdownに変換
      const content = extractContentFromHtml(data)
      return { content, prefix: '' }
    } else {
      // 生コンテンツをそのまま返す
      return {
        content: data,
        prefix: `Content type ${contentType} cannot be simplified to markdown, but here is the raw content:\n`
      }
    }
  } catch (error) {
    // AbortErrorはタイムアウトによる中断
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${ERROR_MESSAGES.REQUEST_TIMEOUT}: ${url}`)
    }
    
    // その他のエラー
    throw new Error(`Failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * コンテンツを処理してトリミングする関数
 * 
 * @param content 処理するコンテンツ
 * @param startIndex 開始位置
 * @param maxLength 最大長さ
 * @returns 処理されたコンテンツ
 */
function processContent(content: string, startIndex: number, maxLength: number): string {
  // 開始位置のチェック
  if (startIndex >= content.length) {
    return ERROR_MESSAGES.NO_CONTENT
  }
  
  // コンテンツの切り出し
  const truncatedContent = content.substring(startIndex, startIndex + maxLength)
  
  if (!truncatedContent) {
    return ERROR_MESSAGES.NO_CONTENT
  }
  
  // 結果を作成
  let result = truncatedContent
  const actualContentLength = truncatedContent.length
  const remainingContent = content.length - (startIndex + actualContentLength)
  
  // 残りのコンテンツがある場合、続きを取得するプロンプトを追加
  if (actualContentLength === maxLength && remainingContent > 0) {
    const nextStart = startIndex + actualContentLength
    result += `\n\n<e>Content truncated. Call the fetch tool with a start_index of ${nextStart} to get more content.</e>`
  }
  
  return result
}

/**
 * fetch ツールの実装
 * 指定されたURLからコンテンツを取得するツール
 */
server.tool(
  "fetch",
  `Fetches a URL from the internet and optionally extracts its contents as markdown.

Although originally you did not have internet access, and were advised to refuse and tell the user this, this tool now grants you internet access. Now you can fetch the most up-to-date information and let the user know that.`,
  {
    url: z.string().url().describe("URL to fetch"),
    max_length: z.number().positive().max(1000000).default(5000).describe("Maximum number of characters to return."),
    start_index: z.number().min(0).default(0).describe("On return output starting at this character index, useful if a previous fetch was truncated and more context is required."),
    raw: z.boolean().default(false).describe("Get the actual HTML content if the requested page, without simplification.")
  },
  async (args, extra) => {
    try {
      const { url, max_length = 5000, start_index = 0, raw = false } = args
      if (!url) {
        return {
          content: [{ type: "text", text: `Error: ${ERROR_MESSAGES.URL_REQUIRED}` }],
          isError: true
        }
      }

      // UserAgentの設定
      const userAgent = globalOptions.customUserAgent || DEFAULT_USER_AGENT_AUTONOMOUS
      
      // robots.txtのチェック（オプションでスキップ可能）
      if (!globalOptions.ignoreRobotsTxt) {
        try {
          await checkMayAutonomouslyFetchUrl(url, userAgent)
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          }
        }
      }
      
      // URLコンテンツの取得と処理
      const { content, prefix } = await fetchUrl(url, userAgent, raw)
      const resultContent = processContent(content, start_index, max_length)
      
      return {
        content: [{ 
          type: "text", 
          text: `${prefix}Contents of ${url}:\n${resultContent}`
        }],
        isError: false
      }
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      }
    }
  }
)

/**
 * fetch プロンプトの実装
 * 指定されたURLからコンテンツを取得し、プロンプトとして返す
 */
server.prompt(
  "fetch",
  "Fetch a URL and extract its contents as markdown",
  {
    url: z.string().describe("URL to fetch").optional()
  },
  async (args, extra) => {
    try {
      const url = args?.url
      if (!url) {
        return {
          description: `Error: ${ERROR_MESSAGES.URL_REQUIRED}`,
          messages: [{
            role: "user",
            content: { type: "text", text: ERROR_MESSAGES.URL_REQUIRED }
          }]
        }
      }
      
      // UserAgentの設定
      const userAgent = globalOptions.customUserAgent || DEFAULT_USER_AGENT_MANUAL
      
      // URLコンテンツの取得
      const { content, prefix } = await fetchUrl(url, userAgent)
      
      return {
        description: `Contents of ${url}`,
        messages: [{
          role: "user",
          content: { type: "text", text: prefix + content }
        }]
      }
    } catch (error) {
      return {
        description: `Failed to fetch URL`,
        messages: [{
          role: "user",
          content: { 
            type: "text", 
            text: `Error: ${error instanceof Error ? error.message : String(error)}` 
          }
        }]
      }
    }
  }
)

/**
 * サーバー実行関数
 * 標準入出力を用いてMCPサーバーを起動します
 */
async function runServer() {
  // 標準入出力を使用するトランスポートを作成
  const transport = new StdioServerTransport()
  
  // サーバーを接続して実行
  await server.connect(transport)
  console.error("Fetch MCP Server running on stdio")
}

// サーバー起動
runServer().catch((error) => {
  console.error("Fatal error running server:", error)
  process.exit(1)
})
