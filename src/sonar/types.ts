// APIのリクエスト型定義
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface WebSearchOptions {
  search_context_size?: "low" | "medium" | "high";
}

export interface ResponseFormat {
  type?: "json_schema" | "regex";
  json_schema?: { schema: Record<string, any> };
  regex?: { regex: string };
}

export interface PerplexityRequest {
  model: string;
  messages: Message[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  search_domain_filter?: string[];
  return_images?: boolean;
  return_related_questions?: boolean;
  search_recency_filter?: string;
  top_k?: number;
  stream?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
  response_format?: ResponseFormat;
  web_search_options?: WebSearchOptions;
}

// APIのレスポンス型定義
export interface PerplexityResponse {
  id: string;
  model: string;
  created: number;
  object: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    search_context_size?: string;
    citation_tokens?: number;
    num_search_queries?: number;
    reasoning_tokens?: number;
  };
  citations?: string[];
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
    delta?: {
      role?: string;
      content?: string;
    };
  }[];
}

// 検索コンテキストサイズの型
export type SearchContextSize = "low" | "medium" | "high";

// 使用可能なモデル名の型
export type SonarModel =
  | "sonar"
  | "sonar-pro"
  | "sonar-deep-research"
  | "sonar-reasoning"
  | "sonar-reasoning-pro";
