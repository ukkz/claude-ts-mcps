/**
 * プルリクエストの作成、読み取り、管理を行うGitHubプルリクエスト操作。
 */

import { z } from 'zod';
import { githubRequest, buildUrl } from '../common/utils';
import { GitHubPullRequestSchema } from '../common/types';

// プルリクエストスキーマの定義
export const CreatePullRequestSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  title: z.string().describe("Pull request title"),
  body: z.string().describe("Pull request description"),
  head: z.string().describe("Branch containing changes"),
  base: z.string().describe("Branch to merge changes into"),
  draft: z.boolean().optional().describe("Create as draft pull request"),
});

export const GetPullRequestSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number"),
});

export const ListPullRequestsSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  state: z.enum(["open", "closed", "all"]).describe("Pull request state"),
  sort: z.enum(["created", "updated", "popularity", "long-running"]).describe("Sort field"),
  direction: z.enum(["asc", "desc"]).describe("Sort direction"),
  page: z.number().describe("Page number"),
  per_page: z.number().describe("Results per page"),
  account_profile: z.string().optional().describe("GitHub account profile to use"),
});

export const MergePullRequestSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number"),
  commit_title: z.string().optional().describe("Commit title"),
  commit_message: z.string().optional().describe("Commit message"),
  merge_method: z.enum(["merge", "squash", "rebase"]).optional().default("merge").describe("Merge method"),
});

/**
 * GitHubリポジトリに新しいプルリクエストを作成
 */
export async function createPullRequest(
  options: z.infer<typeof CreatePullRequestSchema>
) {
  const { owner, repo, ...pullRequestOptions } = options;
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
  
  const response = await githubRequest(url, {
    method: "POST",
    body: pullRequestOptions,
  });

  return GitHubPullRequestSchema.parse(response);
}

/**
 * 特定のプルリクエストの詳細を取得
 */
export async function getPullRequest(
  owner: string,
  repo: string,
  pull_number: number
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`;
  const response = await githubRequest(url);

  return GitHubPullRequestSchema.parse(response);
}

/**
 * リポジトリのプルリクエスト一覧を取得しフィルタリング
 */
export async function listPullRequests(
  owner: string,
  repo: string,
  options: {
    state: "open" | "closed" | "all";
    sort: "created" | "updated" | "popularity" | "long-running";
    direction: "asc" | "desc";
    page: number;
    per_page: number;
    account_profile?: string;
  }
) {
  // デフォルト値を設定して未定義のパラメータに対応
  const params = {
    state: options.state,
    sort: options.sort,
    direction: options.direction,
    page: options.page,
    per_page: options.per_page
  };
  
  const url = buildUrl(`https://api.github.com/repos/${owner}/${repo}/pulls`, params);

  const response = await githubRequest(url);
  return z.array(GitHubPullRequestSchema).parse(response);
}

/**
 * プルリクエストをマージ
 */
export async function mergePullRequest(
  owner: string,
  repo: string,
  pull_number: number,
  options: Omit<z.infer<typeof MergePullRequestSchema>, "owner" | "repo" | "pull_number">
) {
  // デフォルト値を設定して未定義のパラメータに対応
  const params = {
    commit_title: options.commit_title,
    commit_message: options.commit_message,
    merge_method: options.merge_method ?? "merge"
  };

  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}/merge`;
  const response = await githubRequest(url, {
    method: "PUT",
    body: params,
  });

  return response;
}
