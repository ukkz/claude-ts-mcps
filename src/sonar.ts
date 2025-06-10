/**
 * Perplexity Sonar API MCPサーバー実装
 * 自然言語での質問に対してWeb検索と引用元付きの回答を提供
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { 
  PerplexityRequest, 
  PerplexityResponse, 
  Message, 
  SearchContextSize, 
  SonarModel 
} from "./sonar/types.js"

// サーバーの初期化
const server = new McpServer({
  name: "perplexity-sonar",
  version: "0.1.0",
})

// APIキーの確認
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY!
if (!PERPLEXITY_API_KEY) {
  console.error("Error: PERPLEXITY_API_KEY environment variable is required")
  process.exit(1)
}

// リクエスト間隔の管理（1分間に50リクエストの制限 = 1.2秒間隔）
const MIN_REQUEST_INTERVAL_MS = 1200
let lastRequestTime = 0

/**
 * レート制限を管理する関数
 * 前回のリクエストから最低1.2秒が経過するまで待機
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    // 必要な待機時間を計算
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest
    
    // 指定時間だけ待機
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }
  
  // 現在時刻を記録
  lastRequestTime = Date.now()
}

/**
 * Sonar APIリクエストを実行する関数
 * 
 * @param query 自然言語による質問
 * @param model 使用するモデル（sonar, sonar-pro, sonar-reasoning, sonar-reasoning-pro, sonar-deep-research）
 * @param searchContextSize 検索コンテキストのサイズ（low: 簡単な事実確認, medium: 標準的な質問, high: 複雑な調査）
 * @returns Perplexity APIからのレスポンス
 */
async function performSonarQuery(
  query: string, 
  model: SonarModel = "sonar", 
  searchContextSize: SearchContextSize = "medium"
): Promise<PerplexityResponse> {
  // レート制限に対応するための待機
  await waitForRateLimit()
  
  const messages: Message[] = [
    {
      role: "system",
      content: "Provide accurate, concise, and factual information with proper citations."
    },
    {
      role: "user",
      content: query
    }
  ]
  
  const requestData: PerplexityRequest = {
    model: model,
    messages: messages,
    max_tokens: 2000,
    temperature: 0.1,
    stream: false,
    web_search_options: { search_context_size: searchContextSize }
  }
  
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify(requestData)
    })
    
    if (!response.ok) {
      const errorBody = await response.text()
      let errorMessage = `API error: ${response.status} ${response.statusText}`
      
      // エラーコードに対する詳細なメッセージを追加
      if (response.status === 401) {
        errorMessage += " - Invalid API key. Please check your PERPLEXITY_API_KEY environment variable."
      } else if (response.status === 429) {
        errorMessage += " - Rate limit exceeded. Please wait before making another request."
      } else if (response.status === 400) {
        errorMessage += ` - Bad request. Model '${model}' might not be available for your account. Error: ${errorBody}`
      }
      
      throw new Error(errorMessage)
    }
    
    return await response.json() as PerplexityResponse
  } catch (error) {
    // ネットワークエラーの場合の詳細メッセージ
    if (error instanceof Error && error.message.includes('fetch failed')) {
      throw new Error(`Network error: Unable to connect to Perplexity API. Please check your internet connection.`)
    }
    throw new Error(`Failed to query Sonar API: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 結果をマークダウン形式にフォーマットする関数
 * 
 * @param data Perplexity APIからのレスポンス
 * @returns マークダウン形式の回答と引用元
 */
function formatResultsAsMarkdown(data: PerplexityResponse): string {
  if (!data?.choices?.[0]?.message?.content) {
    return "No response content available"
  }
  
  const answer = data.choices[0].message.content
  const citations = data.citations || []
  
  let markdownResult = answer
  
  // 引用元がある場合は追加（より読みやすいフォーマットで）
  if (citations.length > 0) {
    markdownResult += "\n\n## Sources\n\n"
    citations.forEach((url, index) => {
      // URLからドメイン名を抽出して表示
      try {
        const domain = new URL(url).hostname.replace('www.', '')
        markdownResult += `[${index + 1}] [${domain}](${url})\n`
      } catch {
        // URL解析に失敗した場合はそのまま表示
        markdownResult += `[${index + 1}] [${url}](${url})\n`
      }
    })
  }
  
  return markdownResult
}

// 英語での説明文（他のWeb検索ツールとの差別化を明確化）
const TOOL_DESCRIPTION = "AI-powered web search that returns synthesized, comprehensive answers with citations. Unlike keyword-based searches, this tool understands natural language questions and provides coherent responses by analyzing multiple sources. Best for complex questions requiring in-depth understanding and verified information. Returns AI-generated answers with numbered citations linking to sources."

// ツールの実装
server.tool(
  "sonar_search",
  TOOL_DESCRIPTION.trim(),
  {
    query: z.string().describe("Natural language question (e.g. 'What are the latest developments in quantum computing?')"),
    model: z.enum(["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro", "sonar-deep-research"]).optional().describe("Model to use - sonar: fast general-purpose, sonar-pro: complex queries (200k context), sonar-reasoning: chain-of-thought, sonar-reasoning-pro: advanced reasoning, sonar-deep-research: comprehensive research (default: sonar)"),
    search_context_size: z.enum(["low", "medium", "high"]).optional().describe("Search depth - low: simple facts (cost-efficient), medium: moderate complexity (balanced), high: complex research (maximum depth) (default: medium)")
  },
  async (args) => {
    try {
      if (
        typeof args !== "object" ||
        args === null ||
        !("query" in args) ||
        typeof args.query !== "string"
      ) {
        throw new Error("Invalid arguments: 'query' must be a string")
      }
      
      const { query } = args
      const model = typeof args.model === "string" ? args.model as SonarModel : "sonar"
      const searchContextSize = typeof args.search_context_size === "string" 
        ? args.search_context_size as SearchContextSize
        : "medium"
      
      const data = await performSonarQuery(query, model, searchContextSize)
      const formattedResult = formatResultsAsMarkdown(data)
      
      return {
        content: [{ type: "text", text: formattedResult }],
        isError: false,
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      }
    }
  }
)

// マルチクエリツールの実装
server.tool(
  "sonar_multi_search",
  "Performs multiple related searches simultaneously and returns combined results. Ideal for complex research questions that benefit from being broken down into simpler components. Each query receives its own dedicated response with proper citations, enabling comprehensive information synthesis.",
  {
    queries: z.array(z.string()).describe("List of related natural language questions - each will receive a full AI-synthesized answer"),
    model: z.enum(["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro", "sonar-deep-research"]).optional().describe("Model to use across all queries - consider sonar-pro or sonar-deep-research for complex research (default: sonar)"),
    search_context_size: z.enum(["low", "medium", "high"]).optional().describe("Search depth for each query - use 'high' for comprehensive multi-query research (default: low for efficiency)")
  },
  async (args) => {
    try {
      if (
        typeof args !== "object" ||
        args === null ||
        !("queries" in args) ||
        !Array.isArray(args.queries) ||
        !args.queries.every(q => typeof q === "string")
      ) {
        throw new Error("Invalid arguments: 'queries' must be an array of strings")
      }
      
      const { queries } = args
      const model = typeof args.model === "string" ? args.model as SonarModel : "sonar"
      const searchContextSize = typeof args.search_context_size === "string" 
        ? args.search_context_size as SearchContextSize
        : "low"
      
      // 各クエリに対して順次検索を実行（レート制限対応のため並列実行しない）
      const results: PerplexityResponse[] = []
      for (const query of queries) {
        const result = await performSonarQuery(query, model, searchContextSize)
        results.push(result)
      }
      
      // 結果を統合（より読みやすいフォーマットで）
      let combinedResult = "# Combined AI-Powered Search Results\n\n"
      combinedResult += `*Performed ${results.length} searches using Sonar ${model} model with ${searchContextSize} search depth*\n\n`
      
      results.forEach((result, index) => {
        combinedResult += `## Query ${index + 1}: "${queries[index]}"\n\n`
        combinedResult += formatResultsAsMarkdown(result)
        if (index < results.length - 1) {
          combinedResult += "\n\n---\n\n"
        }
      })
      
      return {
        content: [{ type: "text", text: combinedResult }],
        isError: false,
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      }
    }
  }
)

// タイムアウト付きの検索実行
server.tool(
  "sonar_search_with_timeout",
  "Performs a natural language search with a strict timeout to ensure fast responses. If the search takes too long, it returns partial results or a timeout message. Useful for time-sensitive queries where some information is better than none.",
  {
    query: z.string().describe("Natural language question for quick AI-powered answer"),
    timeout_ms: z.number().optional().describe("Maximum time to wait for response in milliseconds (default: 20000)"),
    model: z.enum(["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro", "sonar-deep-research"]).optional().describe("Model to use - note that complex models may timeout more frequently (default: sonar for speed)")
  },
  async (args) => {
    try {
      if (
        typeof args !== "object" ||
        args === null ||
        !("query" in args) ||
        typeof args.query !== "string"
      ) {
        throw new Error("Invalid arguments: 'query' must be a string")
      }
      
      const { query } = args
      const timeoutMs = typeof args.timeout_ms === "number" ? args.timeout_ms : 20000 // デフォルト20秒に変更
      const model = typeof args.model === "string" ? args.model as SonarModel : "sonar"
      
      // タイムアウト付きの検索実行
      const timeoutPromise = new Promise<PerplexityResponse>((_, reject) => {
        setTimeout(() => reject(new Error("Search timed out")), timeoutMs)
      })
      
      const searchPromise = performSonarQuery(query, model, "low")
      
      try {
        const data = await Promise.race([searchPromise, timeoutPromise])
        const formattedResult = formatResultsAsMarkdown(data)
        
        return {
          content: [{ type: "text", text: formattedResult }],
          isError: false,
        }
      } catch (timeoutError) {
        return {
          content: [
            {
              type: "text",
              text: `The AI-powered search timed out after ${timeoutMs}ms. This can happen when:\n\n- The query is too complex for quick processing\n- Using advanced models (${model}) that require more computation\n- Network latency is high\n\nSuggestions:\n- Try the standard sonar_search tool without timeout constraints\n- Use a simpler model like 'sonar' for faster responses\n- Break your question into simpler, more focused queries\n- Increase the timeout_ms parameter if needed`,
            },
          ],
          isError: false, // タイムアウトは正常な動作として扱う
        }
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      }
    }
  }
)

// サーバー起動
async function runServer() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Perplexity Sonar AI-Powered Search MCP Server v0.1.0")
  console.error("Ready to provide AI-synthesized answers with citations")
  console.error(`Available models: sonar, sonar-pro, sonar-reasoning, sonar-reasoning-pro, sonar-deep-research`)
}

runServer().catch((error) => {
  console.error("Fatal error running Sonar MCP server:", error)
  if (error instanceof Error && error.message.includes('PERPLEXITY_API_KEY')) {
    console.error("\nPlease set the PERPLEXITY_API_KEY environment variable with your Perplexity API key.")
    console.error("You can get an API key from: https://docs.perplexity.ai/home")
  }
  process.exit(1)
})
