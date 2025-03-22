/**
 * コード、Issue/PR、ユーザーなどを検索するGitHub検索操作。
 */

import { z } from 'zod';
import { githubRequest, buildUrl } from '../common/utils';

// 検索スキーマ
export const SearchCodeSchema = z.object({
  query: z.string().describe("Search query"),
  page: z.number().optional().describe("Page number"),
  perPage: z.number().optional().describe("Results per page"),
  sort: z.enum(["indexed", "best-match"]).optional().describe("Sort field"),
  order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
});

export const SearchIssuesSchema = z.object({
  query: z.string().describe("Search query"),
  page: z.number().optional().describe("Page number"),
  perPage: z.number().optional().describe("Results per page"),
  sort: z.enum(["created", "updated", "comments"]).optional().describe("Sort field"),
  order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
});

export const SearchUsersSchema = z.object({
  query: z.string().describe("Search query"),
  page: z.number().optional().describe("Page number"),
  perPage: z.number().optional().describe("Results per page"),
  sort: z.enum(["followers", "repositories", "joined"]).optional().describe("Sort field"),
  order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
});

/**
 * GitHubリポジトリ全体でコードを検索
 */
export async function searchCode(options: z.infer<typeof SearchCodeSchema>) {
  // デフォルト値を設定して未定義のパラメータに対応
  const params = {
    q: options.query,
    page: options.page,
    per_page: options.perPage,
    sort: options.sort,
    order: options.order,
  };
  
  const url = buildUrl(`https://api.github.com/search/code`, params);

  const response = await githubRequest(url);
  return response;
}

/**
 * GitHubリポジトリ全体でIssueとプルリクエストを検索
 */
export async function searchIssues(options: z.infer<typeof SearchIssuesSchema>) {
  // デフォルト値を設定して未定義のパラメータに対応
  const params = {
    q: options.query,
    page: options.page,
    per_page: options.perPage,
    sort: options.sort,
    order: options.order,
  };
  
  const url = buildUrl(`https://api.github.com/search/issues`, params);

  const response = await githubRequest(url);
  return response;
}

/**
 * GitHub上のユーザーを検索
 */
export async function searchUsers(options: z.infer<typeof SearchUsersSchema>) {
  // デフォルト値を設定して未定義のパラメータに対応
  const params = {
    q: options.query,
    page: options.page,
    per_page: options.perPage,
    sort: options.sort,
    order: options.order,
  };
  
  const url = buildUrl(`https://api.github.com/search/users`, params);

  const response = await githubRequest(url);
  return response;
}
