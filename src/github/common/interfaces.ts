/**
 * GitHub MCPサーバーで使用する共通インターフェース定義
 * Zodスキーマと連携して使用するための型定義
 */

// 基本的なアカウントプロファイル対応の共通インターフェース
export interface GitHubBaseArguments {
  account_profile?: string;
}

// ファイル操作関連の型定義
export interface FileOperation {
  path: string;
  content: string;
}

export interface CreateOrUpdateFileArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch: string;
  sha?: string;
}

export interface GetFileContentsArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
}

export interface PushFilesArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  branch: string;
  files: FileOperation[];
  message: string;
}

// リポジトリ操作関連の型定義
export interface SearchRepositoriesArguments extends GitHubBaseArguments {
  query: string;
  page?: number;
  perPage?: number;
}

export interface CreateRepositoryArguments extends GitHubBaseArguments {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
  gitignore_template?: string;
  license_template?: string;
}

// ブランチ操作関連の型定義
export interface CreateBranchArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  branch: string;
  from_branch?: string;
}

// Issue操作関連の型定義
export interface CreateIssueArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  title: string;
  body: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

export interface GetIssueArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  issue_number: number;
}

export interface ListIssuesArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  sort?: "created" | "updated" | "comments";
  direction?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export interface UpdateIssueArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  issue_number: number;
  title?: string;
  body?: string;
  state?: "open" | "closed";
  assignees?: string[];
  labels?: string[];
  milestone?: number | null;
}

export interface IssueCommentArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  issue_number: number;
  body: string;
}

// プルリクエスト操作関連の型定義
export interface CreatePullRequestArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
}

export interface GetPullRequestArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  pull_number: number;
}

export interface ListPullRequestsArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  sort?: "created" | "updated" | "popularity" | "long-running";
  direction?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export interface MergePullRequestArguments extends GitHubBaseArguments {
  owner: string;
  repo: string;
  pull_number: number;
  commit_title?: string;
  commit_message?: string;
  merge_method?: "merge" | "squash" | "rebase";
}

// 検索操作関連の型定義
export interface SearchCodeArguments extends GitHubBaseArguments {
  query: string;
  page?: number;
  perPage?: number;
  sort?: "indexed" | "best-match";
  order?: "asc" | "desc";
}

export interface SearchIssuesArguments extends GitHubBaseArguments {
  query: string;
  page?: number;
  perPage?: number;
  sort?: "created" | "updated" | "comments";
  order?: "asc" | "desc";
}

export interface SearchUsersArguments extends GitHubBaseArguments {
  query: string;
  page?: number;
  perPage?: number;
  sort?: "followers" | "repositories" | "joined";
  order?: "asc" | "desc";
}
