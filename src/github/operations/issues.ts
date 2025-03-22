/**
 * Issueの作成、読み取り、管理を行うGitHubIssue操作。
 */

import { z } from 'zod';
import { githubRequest, buildUrl } from '../common/utils';
import { GitHubIssueSchema } from '../common/types';

// Issueスキーマの定義
export const CreateIssueSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  title: z.string().describe("Issue title"),
  body: z.string().describe("Issue body"),
  assignees: z.array(z.string()).optional().describe("List of assignee usernames"),
  labels: z.array(z.string()).optional().describe("List of labels"),
  milestone: z.number().optional().describe("Milestone number"),
});

export const GetIssueSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  issue_number: z.number().describe("Issue number"),
});

export const ListIssuesOptionsSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  state: z.enum(["open", "closed", "all"]).describe("Issue state"),
  sort: z.enum(["created", "updated", "comments"]).describe("Sort field"),
  direction: z.enum(["asc", "desc"]).describe("Sort direction"),
  page: z.number().describe("Page number"),
  per_page: z.number().describe("Results per page"),
  account_profile: z.string().optional().describe("GitHub account profile to use"),
});

export const UpdateIssueOptionsSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  issue_number: z.number().describe("Issue number"),
  title: z.string().optional().describe("New title"),
  body: z.string().optional().describe("New body"),
  state: z.enum(["open", "closed"]).optional().describe("New issue state"),
  assignees: z.array(z.string()).optional().describe("List of assignee usernames"),
  labels: z.array(z.string()).optional().describe("List of labels"),
  milestone: z.number().nullable().optional().describe("Milestone number"),
});

export const IssueCommentSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  issue_number: z.number().describe("Issue number"),
  body: z.string().describe("Comment body"),
});

/**
 * GitHubリポジトリに新しいIssueを作成
 */
export async function createIssue(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof CreateIssueSchema>, "owner" | "repo">
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
  const response = await githubRequest(url, {
    method: "POST",
    body: options,
  });

  return GitHubIssueSchema.parse(response);
}

/**
 * GitHubリポジトリの特定のIssueの詳細を取得
 */
export async function getIssue(
  owner: string,
  repo: string,
  issue_number: number
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`;
  const response = await githubRequest(url);

  return GitHubIssueSchema.parse(response);
}

/**
 * フィルタリングオプションを指定してGitHubリポジトリのIssue一覧を取得
 */
export async function listIssues(
  owner: string,
  repo: string,
  options: {
    state: "open" | "closed" | "all";
    sort: "created" | "updated" | "comments";
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
  
  const url = buildUrl(`https://api.github.com/repos/${owner}/${repo}/issues`, params);

  const response = await githubRequest(url);
  return z.array(GitHubIssueSchema).parse(response);
}

/**
 * GitHubリポジトリの既存のIssueを更新
 */
export async function updateIssue(
  owner: string,
  repo: string,
  issue_number: number,
  options: Omit<z.infer<typeof UpdateIssueOptionsSchema>, "owner" | "repo" | "issue_number">
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`;
  const response = await githubRequest(url, {
    method: "PATCH",
    body: options,
  });

  return GitHubIssueSchema.parse(response);
}

/**
 * 既存のIssueにコメントを追加
 */
export async function addIssueComment(
  owner: string,
  repo: string,
  issue_number: number,
  body: string
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/comments`;
  const response = await githubRequest(url, {
    method: "POST",
    body: { body },
  });

  return response;
}
