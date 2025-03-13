/**
 * Brave検索APIを利用したModel Context Protocol(MCP)サーバーの実装
 * このサーバーは、ウェブ検索とローカル検索の2つの機能を提供します
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"





/**
 * MCPサーバーの初期化
 * サーバー名、バージョン、機能を定義します
 */
const server = new McpServer({
  name: "brave-search",
  version: "0.1.0",
})

/**
 * APIキーの確認
 * 環境変数からBrave APIキーを取得し、存在しない場合はエラーを表示して終了します
 */
const BRAVE_API_KEY = process.env.BRAVE_API_KEY!
if (!BRAVE_API_KEY) {
  console.error("Error: BRAVE_API_KEY environment variable is required")
  process.exit(1)
}

/**
 * レート制限の設定
 * APIの利用制限を定義：毎秒1リクエスト、毎月15000リクエストまで
 */
const RATE_LIMIT = {
  perSecond: 1,
  perMonth: 15000
}

/**
 * リクエストカウンターの初期化
 * APIリクエストの回数を追跡するためのオブジェクト
 */
let requestCount = {
  second: 0,
  month: 0,
  lastReset: Date.now()
}

/**
 * レート制限をチェックする関数
 * 現在のリクエスト頻度が制限を超えていないか確認し、超えている場合はエラーをスローします
 */
function checkRateLimit() {
  const now = Date.now()
  if (now - requestCount.lastReset > 1000) {
    requestCount.second = 0
    requestCount.lastReset = now
  }
  if (requestCount.second >= RATE_LIMIT.perSecond ||
    requestCount.month >= RATE_LIMIT.perMonth) {
    throw new Error('Rate limit exceeded')
  }
  requestCount.second++
  requestCount.month++
}

/**
 * ウェブ検索結果のインターフェース定義
 * BraveのWeb検索APIからのレスポンス形式を定義します
 */
interface BraveWeb {
  web?: {
    results?: Array<{
      title: string
      description: string
      url: string
      language?: string
      published?: string
      rank?: number
    }>
  }
  locations?: {
    results?: Array<{
      id: string // Required by API
      title?: string
    }>
  }
}

/**
 * 場所情報のインターフェース定義
 * Braveのローカル検索APIで返される場所の詳細情報の形式を定義します
 */
interface BraveLocation {
  id: string
  name: string
  address: {
    streetAddress?: string
    addressLocality?: string
    addressRegion?: string
    postalCode?: string
  }
  coordinates?: {
    latitude: number
    longitude: number
  }
  phone?: string
  rating?: {
    ratingValue?: number
    ratingCount?: number
  }
  openingHours?: string[]
  priceRange?: string
}

/**
 * POI(Point of Interest)レスポンスのインターフェース定義
 * ローカル検索で返される場所のリスト形式を定義します
 */
interface BravePoiResponse {
  results: BraveLocation[]
}

/**
 * 場所の説明情報のインターフェース定義
 * 場所IDと説明文の対応を定義します
 */
interface BraveDescription {
  descriptions: { [id: string]: string }
}

/**
 * ウェブ検索引数の型チェック関数
 * 引数が正しくウェブ検索に必要なフォーマットであるかを確認します
 */
function isBraveWebSearchArgs(args: unknown): args is { query: string; count?: number } {
  return (
    typeof args === "object" &&
    args !== null &&
    "query" in args &&
    typeof (args as { query: string }).query === "string"
  )
}

/**
 * ローカル検索引数の型チェック関数
 * 引数が正しくローカル検索に必要なフォーマットであるかを確認します
 */
function isBraveLocalSearchArgs(args: unknown): args is { query: string; count?: number } {
  return (
    typeof args === "object" &&
    args !== null &&
    "query" in args &&
    typeof (args as { query: string }).query === "string"
  )
}

/**
 * ウェブ検索を実行する非同期関数
 * BraveのWeb検索APIを呼び出し、結果を整形して返します
 * 
 * @param query 検索クエリ
 * @param count 取得する結果の数（デフォルト: 10）
 * @param offset ページネーションのオフセット（デフォルト: 0）
 * @returns 整形された検索結果の文字列
 */
async function performWebSearch(query: string, count: number = 10, offset: number = 0) {
  checkRateLimit()
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', Math.min(count, 20).toString()) // API limit
  url.searchParams.set('offset', offset.toString())

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  })

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${await response.text()}`)
  }

  const data = await response.json() as BraveWeb

  // ウェブ検索結果のみを抽出
  const results = (data.web?.results || []).map(result => ({
    title: result.title || '',
    description: result.description || '',
    url: result.url || ''
  }))

  return results.map(r =>
    `Title: ${r.title}\nDescription: ${r.description}\nURL: ${r.url}`
  ).join('\n\n')
}

/**
 * ローカル検索を実行する非同期関数
 * BraveのLocal検索APIを呼び出し、結果を整形して返します
 * ローカル結果が見つからない場合はウェブ検索にフォールバックします
 * 
 * @param query 検索クエリ
 * @param count 取得する結果の数（デフォルト: 5）
 * @returns 整形された検索結果の文字列
 */
async function performLocalSearch(query: string, count: number = 5) {
  checkRateLimit()
  // 場所IDを取得するための初期検索
  const webUrl = new URL('https://api.search.brave.com/res/v1/web/search')
  webUrl.searchParams.set('q', query)
  webUrl.searchParams.set('search_lang', 'en')
  webUrl.searchParams.set('result_filter', 'locations')
  webUrl.searchParams.set('count', Math.min(count, 20).toString())

  const webResponse = await fetch(webUrl, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  })

  if (!webResponse.ok) {
    throw new Error(`Brave API error: ${webResponse.status} ${webResponse.statusText}\n${await webResponse.text()}`)
  }

  const webData = await webResponse.json() as BraveWeb
  const locationIds = webData.locations?.results?.filter((r): r is { id: string; title?: string } => r.id != null).map(r => r.id) || []

  if (locationIds.length === 0) {
    return performWebSearch(query, count) // ウェブ検索へのフォールバック
  }

  // POIの詳細と説明を並列で取得
  const [poisData, descriptionsData] = await Promise.all([
    getPoisData(locationIds),
    getDescriptionsData(locationIds)
  ])

  return formatLocalResults(poisData, descriptionsData)
}

/**
 * 場所の詳細情報を取得する非同期関数
 * 
 * @param ids 場所IDの配列
 * @returns 場所の詳細情報
 */
async function getPoisData(ids: string[]): Promise<BravePoiResponse> {
  checkRateLimit()
  const url = new URL('https://api.search.brave.com/res/v1/local/pois')
  ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id))
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  })

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${await response.text()}`)
  }

  const poisResponse = await response.json() as BravePoiResponse
  return poisResponse
}

/**
 * 場所の説明情報を取得する非同期関数
 * 
 * @param ids 場所IDの配列
 * @returns 場所の説明情報
 */
async function getDescriptionsData(ids: string[]): Promise<BraveDescription> {
  checkRateLimit()
  const url = new URL('https://api.search.brave.com/res/v1/local/descriptions')
  ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id))
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  })

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${await response.text()}`)
  }

  const descriptionsData = await response.json() as BraveDescription
  return descriptionsData
}

/**
 * ローカル検索結果を整形する関数
 * 場所の詳細情報と説明を組み合わせて、読みやすい形式に整形します
 * 
 * @param poisData 場所の詳細情報
 * @param descData 場所の説明情報
 * @returns 整形された検索結果の文字列
 */
function formatLocalResults(poisData: BravePoiResponse, descData: BraveDescription): string {
  return (poisData.results || []).map(poi => {
    const address = [
      poi.address?.streetAddress ?? '',
      poi.address?.addressLocality ?? '',
      poi.address?.addressRegion ?? '',
      poi.address?.postalCode ?? ''
    ].filter(part => part !== '').join(', ') || 'N/A'

    return `Name: ${poi.name}
Address: ${address}
Phone: ${poi.phone || 'N/A'}
Rating: ${poi.rating?.ratingValue ?? 'N/A'} (${poi.rating?.ratingCount ?? 0} reviews)
Price Range: ${poi.priceRange || 'N/A'}
Hours: ${(poi.openingHours || []).join(', ') || 'N/A'}
Description: ${descData.descriptions[poi.id] || 'No description available'}
`
  }).join('\n---\n') || 'No local results found'
}

/**
 * ウェブ検索ツールの実装
 * BraveのWebサーチAPIを利用して検索を実行します
 */
server.tool(
  "brave_web_search",
  "Retrieves up-to-date information from the web using Brave Search. You should proactively use this tool whenever you need current information beyond your knowledge cutoff, when answering questions about recent events, when asked about specific facts you're uncertain about, or when providing comprehensive answers. Search automatically when you suspect information might be outdated or when greater detail would improve your response. Use this for news, technical information, current events, product details, or any topic where fresh, accurate data would enhance your answer quality.",
  {
    query: z.string().describe("Search query (max 400 chars, 50 words)"),
    count: z.number().optional().describe("Number of results (1-20, default 10)"),
    offset: z.number().optional().describe("Pagination offset (max 9, default 0)")
  },
  async (args) => {
    try {
      if (!isBraveWebSearchArgs(args)) {
        throw new Error("Invalid arguments for brave_web_search")
      }
      const { query, count = 10 } = args
      const results = await performWebSearch(query, count)
      return {
        content: [{ type: "text", text: results }],
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

/**
 * ローカル検索ツールの実装
 * BraveのLocalサーチAPIを利用して場所の検索を実行します
 */
server.tool(
  "brave_local_search",
  "Finds information about local businesses, services, attractions, and locations with real-time data. Use this tool proactively whenever a query mentions specific places or location-based information. This is especially useful for questions about restaurants, shops, tourist attractions, local services, or any place-based inquiry. You should automatically search when users ask about places 'near' somewhere, business hours, local reviews, addresses, or location details that would benefit from current information. This provides much more accurate and up-to-date information than your built-in knowledge.",
  {
    query: z.string().describe("Local search query (e.g. 'pizza near Central Park')"),
    count: z.number().optional().describe("Number of results (1-20, default 5)")
  },
  async (args) => {
    try {
      if (!isBraveLocalSearchArgs(args)) {
        throw new Error("Invalid arguments for brave_local_search")
      }
      const { query, count = 5 } = args
      const results = await performLocalSearch(query, count)
      return {
        content: [{ type: "text", text: results }],
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

// Start server
async function runServer() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Secure MCP Brave Web Search Server running on stdio")
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error)
  process.exit(1)
})