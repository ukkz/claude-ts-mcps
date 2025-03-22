/**
 * GitHub MCPサーバーで使用するツールの定義
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import * as files from '../operations/files';
import * as repository from '../operations/repository';
import * as branches from '../operations/branches';
import * as issues from '../operations/issues';
import * as pulls from '../operations/pulls';
import * as search from '../operations/search';

/**
 * GitHub MCP サーバーで提供するツール定義
 */
export const GITHUB_TOOLS = [
  {
    name: "create_or_update_file",
    description: "Create or update a single file in a GitHub repository",
    inputSchema: zodToJsonSchema(files.CreateOrUpdateFileSchema),
  },
  {
    name: "search_repositories",
    description: "Search for GitHub repositories",
    inputSchema: zodToJsonSchema(repository.SearchRepositoriesSchema),
  },
  {
    name: "create_repository",
    description: "Create a new GitHub repository",
    inputSchema: zodToJsonSchema(repository.CreateRepositoryOptionsSchema),
  },
  {
    name: "get_file_contents",
    description: "Get the contents of a file or directory from a GitHub repository",
    inputSchema: zodToJsonSchema(files.GetFileContentsSchema),
  },
  {
    name: "push_files",
    description: "Push multiple files to a GitHub repository in a single commit",
    inputSchema: zodToJsonSchema(files.PushFilesSchema),
  },
  {
    name: "create_branch",
    description: "Create a new branch in a GitHub repository",
    inputSchema: zodToJsonSchema(branches.CreateBranchSchema),
  },
  {
    name: "create_issue",
    description: "Create a new issue in a GitHub repository",
    inputSchema: zodToJsonSchema(issues.CreateIssueSchema),
  },
  {
    name: "get_issue",
    description: "Get details of a specific issue in a GitHub repository",
    inputSchema: zodToJsonSchema(issues.GetIssueSchema),
  },
  {
    name: "list_issues",
    description: "List issues in a GitHub repository with filtering options",
    inputSchema: zodToJsonSchema(issues.ListIssuesOptionsSchema),
  },
  {
    name: "update_issue",
    description: "Update an existing issue in a GitHub repository",
    inputSchema: zodToJsonSchema(issues.UpdateIssueOptionsSchema),
  },
  {
    name: "add_issue_comment",
    description: "Add a comment to an existing issue",
    inputSchema: zodToJsonSchema(issues.IssueCommentSchema),
  },
  {
    name: "create_pull_request",
    description: "Create a new pull request in a GitHub repository",
    inputSchema: zodToJsonSchema(pulls.CreatePullRequestSchema),
  },
  {
    name: "get_pull_request",
    description: "Get details of a specific pull request",
    inputSchema: zodToJsonSchema(pulls.GetPullRequestSchema),
  },
  {
    name: "list_pull_requests",
    description: "List and filter repository pull requests",
    inputSchema: zodToJsonSchema(pulls.ListPullRequestsSchema),
  },
  {
    name: "merge_pull_request",
    description: "Merge a pull request",
    inputSchema: zodToJsonSchema(pulls.MergePullRequestSchema),
  },
  {
    name: "search_code",
    description: "Search for code across GitHub repositories",
    inputSchema: zodToJsonSchema(search.SearchCodeSchema),
  },
  {
    name: "search_issues",
    description: "Search for issues and pull requests across GitHub repositories",
    inputSchema: zodToJsonSchema(search.SearchIssuesSchema),
  },
  {
    name: "search_users",
    description: "Search for users on GitHub",
    inputSchema: zodToJsonSchema(search.SearchUsersSchema),
  },
];
