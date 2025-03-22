/**
 * GitHub APIリクエストの作成とレスポンス処理用のユーティリティ関数。
 */

import { createGitHubError } from './errors';

/**
 * GitHub MCPサーバーのバージョン情報
 */
export const VERSION = "0.1.0";

// GitHubリクエストのオプション型
export type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * コンテントタイプに基づいてレスポンスボディをパース
 */
async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

/**
 * クエリパラメータ付きURLを生成
 */
export function buildUrl(baseUrl: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, value.toString());
    }
  });
  return url.toString();
}

const USER_AGENT = `claude-ts-mcps/github/v${VERSION}`;

/**
 * 指定したアカウントプロファイルのGitHubトークンを取得する
 * @param accountProfile アカウントプロファイル名（省略時はデフォルト）
 * @returns 対応するGitHubトークン
 */
export function getGitHubToken(accountProfile?: string): string | undefined {
  if (!accountProfile || accountProfile === 'default') {
    // 従来の環境変数名をデフォルトとして維持
    return process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  }
  
  // アカウントプロファイル名に基づいてトークンを取得
  // 例: 'work' → GITHUB_TOKEN_WORK
  const tokenEnvName = `GITHUB_TOKEN_${accountProfile.toUpperCase()}`;
  return process.env[tokenEnvName];
}

/**
 * 適切なエラー処理を伴うGitHub APIリクエストを行う
 */
export async function githubRequest(
  url: string,
  options: RequestOptions = {},
  accountProfile?: string
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    ...options.headers,
  };

  const token = getGitHubToken(accountProfile);
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw createGitHubError(response.status, responseBody);
  }

  return responseBody;
}

/**
 * GitHub操作用にブランチ名を検証
 */
export function validateBranchName(branch: string): string {
  const sanitized = branch.trim();
  if (!sanitized) {
    throw new Error("Branch name cannot be empty");
  }
  if (sanitized.includes("..")) {
    throw new Error("Branch name cannot contain '..'");
  }
  if (/[\s~^:?*[\\\]]/.test(sanitized)) {
    throw new Error("Branch name contains invalid characters");
  }
  if (sanitized.startsWith("/") || sanitized.endsWith("/")) {
    throw new Error("Branch name cannot start or end with '/'");
  }
  if (sanitized.endsWith(".lock")) {
    throw new Error("Branch name cannot end with '.lock'");
  }
  return sanitized;
}

/**
 * GitHub操作用にリポジトリ名を検証
 */
export function validateRepositoryName(name: string): string {
  const sanitized = name.trim().toLowerCase();
  if (!sanitized) {
    throw new Error("Repository name cannot be empty");
  }
  if (!/^[a-z0-9_.-]+$/.test(sanitized)) {
    throw new Error(
      "Repository name can only contain lowercase letters, numbers, hyphens, periods, and underscores"
    );
  }
  if (sanitized.startsWith(".") || sanitized.endsWith(".")) {
    throw new Error("Repository name cannot start or end with a period");
  }
  return sanitized;
}

/**
 * GitHub操作用にオーナー名を検証
 */
export function validateOwnerName(owner: string): string {
  const sanitized = owner.trim().toLowerCase();
  if (!sanitized) {
    throw new Error("Owner name cannot be empty");
  }
  if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(sanitized)) {
    throw new Error(
      "Owner name must start with a letter or number and can contain up to 39 characters"
    );
  }
  return sanitized;
}

/**
 * リポジトリ内にブランチが存在するか確認
 */
export async function checkBranchExists(
  owner: string,
  repo: string,
  branch: string
): Promise<boolean> {
  try {
    await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`
    );
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) {
      return false;
    }
    throw error;
  }
}
