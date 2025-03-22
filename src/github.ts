#!/usr/bin/env node

/**
 * GitHub MCP サーバー
 *
 * このファイルは、GitHub APIを介してファイル操作、リポジトリ管理、
 * 検索機能、Issue、プルリクエストなどの操作を可能にする
 * Model Context Protocol (MCP) サーバーを実装しています。
 * 
 * 主な機能:
 * - ファイルの作成・更新
 * - リポジトリの検索・作成
 * - Issue管理
 * - プルリクエスト操作
 * - ブランチ作成
 * - コード検索
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';

// Import shared utilities and types
import { formatGitHubError, isGitHubError } from './github/common/errors';
import { VERSION } from './github/common/utils';
import * as interfaces from './github/common/interfaces';

// Import operation modules
import * as files from './github/operations/files';
import * as repository from './github/operations/repository';
import * as branches from './github/operations/branches';
import * as issues from './github/operations/issues';
import * as pulls from './github/operations/pulls';
import * as search from './github/operations/search';

// Import tool definitions
import { GITHUB_TOOLS } from './github/tools/definitions';

// 共通ヘルパー関数

/**
 * 標準化されたJSONレスポンスを生成する
 */
function createJsonResponse(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * リスト操作系のデフォルト値を設定する
 */
function applyIssueListDefaults(options: Partial<interfaces.ListIssuesArguments>) {
  return {
    state: options.state || "open",
    sort: options.sort || "created",
    direction: options.direction || "desc",
    page: options.page || 1,
    per_page: options.per_page || 30,
    account_profile: options.account_profile
  };
}

/**
 * PRリストのデフォルト値を設定する
 */
function applyPullListDefaults(options: Partial<interfaces.ListPullRequestsArguments>) {
  return {
    state: options.state || "open",
    sort: options.sort || "created",
    direction: options.direction || "desc",
    page: options.page || 1,
    per_page: options.per_page || 30,
    account_profile: options.account_profile
  };
}

/**
 * PRマージのデフォルト値を設定する
 */
function applyMergeDefaults(options: Partial<interfaces.MergePullRequestArguments>) {
  return {
    commit_title: options.commit_title,
    commit_message: options.commit_message,
    merge_method: options.merge_method || "merge"
  };
}
const server = new Server(
  {
    name: "github-mcp-server",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: GITHUB_TOOLS,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "create_branch": {
        const args = branches.CreateBranchSchema.parse(request.params.arguments) as interfaces.CreateBranchArguments;
        const branch = await branches.createBranchFromRef(
          args.owner,
          args.repo,
          args.branch,
          args.from_branch,
          args.account_profile
        );
        return createJsonResponse(branch);
      }

      case "search_repositories": {
        const args = repository.SearchRepositoriesSchema.parse(request.params.arguments) as interfaces.SearchRepositoriesArguments;
        const results = await repository.searchRepositories(
          args.query,
          args.page,
          args.perPage
        );
        return createJsonResponse(results);
      }

      case "create_repository": {
        const args = repository.CreateRepositoryOptionsSchema.parse(request.params.arguments) as interfaces.CreateRepositoryArguments;
        const result = await repository.createRepository(args);
        return createJsonResponse(result);
      }

      case "get_file_contents": {
        const args = files.GetFileContentsSchema.parse(request.params.arguments) as interfaces.GetFileContentsArguments;
        const contents = await files.getFileContents(
          args.owner,
          args.repo,
          args.path,
          args.branch,
          args.account_profile
        );
        return createJsonResponse(contents);
      }

      case "create_or_update_file": {
        const args = files.CreateOrUpdateFileSchema.parse(request.params.arguments) as interfaces.CreateOrUpdateFileArguments;
        const result = await files.createOrUpdateFile(
          args.owner,
          args.repo,
          args.path,
          args.content,
          args.message,
          args.branch,
          args.sha,
          args.account_profile
        );
        return createJsonResponse(result);
      }

      case "push_files": {
        const args = files.PushFilesSchema.parse(request.params.arguments) as interfaces.PushFilesArguments;
        const result = await files.pushFiles(
          args.owner,
          args.repo,
          args.branch,
          args.files,
          args.message,
          args.account_profile
        );
        return createJsonResponse(result);
      }

      case "create_issue": {
        const args = issues.CreateIssueSchema.parse(request.params.arguments) as interfaces.CreateIssueArguments;
        const { owner, repo, ...options } = args;
        const issue = await issues.createIssue(owner, repo, options);
        return createJsonResponse(issue);
      }

      case "get_issue": {
        const args = issues.GetIssueSchema.parse(request.params.arguments) as interfaces.GetIssueArguments;
        const issue = await issues.getIssue(args.owner, args.repo, args.issue_number);
        return createJsonResponse(issue);
      }

      case "list_issues": {
        const args = issues.ListIssuesOptionsSchema.parse(request.params.arguments) as interfaces.ListIssuesArguments;
        const { owner, repo, ...options } = args;
        const issuesOptions = applyIssueListDefaults(options);
        const issuesList = await issues.listIssues(owner, repo, issuesOptions);
        return createJsonResponse(issuesList);
      }

      case "update_issue": {
        const args = issues.UpdateIssueOptionsSchema.parse(request.params.arguments) as interfaces.UpdateIssueArguments;
        const { owner, repo, issue_number, ...options } = args;
        const issue = await issues.updateIssue(owner, repo, issue_number, options);
        return createJsonResponse(issue);
      }

      case "add_issue_comment": {
        const args = issues.IssueCommentSchema.parse(request.params.arguments) as interfaces.IssueCommentArguments;
        const { owner, repo, issue_number, body } = args;
        const result = await issues.addIssueComment(owner, repo, issue_number, body);
        return createJsonResponse(result);
      }

      case "create_pull_request": {
        const args = pulls.CreatePullRequestSchema.parse(request.params.arguments) as interfaces.CreatePullRequestArguments;
        const pullRequest = await pulls.createPullRequest(args);
        return createJsonResponse(pullRequest);
      }

      case "get_pull_request": {
        const args = pulls.GetPullRequestSchema.parse(request.params.arguments) as interfaces.GetPullRequestArguments;
        const pullRequest = await pulls.getPullRequest(args.owner, args.repo, args.pull_number);
        return createJsonResponse(pullRequest);
      }

      case "list_pull_requests": {
        const args = pulls.ListPullRequestsSchema.parse(request.params.arguments) as interfaces.ListPullRequestsArguments;
        const { owner, repo, ...options } = args;
        const pullOptions = applyPullListDefaults(options);
        const pullRequests = await pulls.listPullRequests(owner, repo, pullOptions);
        return createJsonResponse(pullRequests);
      }

      case "merge_pull_request": {
        const args = pulls.MergePullRequestSchema.parse(request.params.arguments) as interfaces.MergePullRequestArguments;
        const { owner, repo, pull_number, ...options } = args;
        const mergeOptions = applyMergeDefaults(options);
        const result = await pulls.mergePullRequest(owner, repo, pull_number, mergeOptions);
        return createJsonResponse(result);
      }

      case "search_code": {
        const args = search.SearchCodeSchema.parse(request.params.arguments) as interfaces.SearchCodeArguments;
        const results = await search.searchCode(args);
        return createJsonResponse(results);
      }

      case "search_issues": {
        const args = search.SearchIssuesSchema.parse(request.params.arguments) as interfaces.SearchIssuesArguments;
        const results = await search.searchIssues(args);
        return createJsonResponse(results);
      }

      case "search_users": {
        const args = search.SearchUsersSchema.parse(request.params.arguments) as interfaces.SearchUsersArguments;
        const results = await search.searchUsers(args);
        return createJsonResponse(results);
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid input: ${JSON.stringify(error.errors)}`);
    }
    if (isGitHubError(error)) {
      throw new Error(formatGitHubError(error));
    }
    throw error;
  }
});

// Start the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
