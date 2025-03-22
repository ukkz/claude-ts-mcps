/**
 * リポジトリ内のファイルの作成、読み取り、更新を行うGitHubファイル操作。
 */

import { z } from 'zod';
import { githubRequest } from '../common/utils';
import { GitHubBaseSchema, mergeSchemas } from '../common/base-schemas';
import {
  GitHubContentSchema,
  GitHubTreeSchema,
  GitHubCommitSchema,
  GitHubReferenceSchema,
} from '../common/types';

// スキーマ定義
export const FileOperationSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export const CreateOrUpdateFileSchema = mergeSchemas(
  GitHubBaseSchema,
  z.object({
    owner: z.string().describe("Repository owner (username or organization)"),
    repo: z.string().describe("Repository name"),
    path: z.string().describe("Path where to create/update the file"),
    content: z.string().describe("Content of the file"),
    message: z.string().describe("Commit message"),
    branch: z.string().describe("Branch to create/update the file in"),
    sha: z.string().optional().describe("SHA of the file being replaced (required when updating existing files)"),
  })
);

export const GetFileContentsSchema = mergeSchemas(
  GitHubBaseSchema,
  z.object({
    owner: z.string().describe("Repository owner (username or organization)"),
    repo: z.string().describe("Repository name"),
    path: z.string().describe("Path to the file or directory"),
    branch: z.string().optional().describe("Branch to get contents from"),
  })
);

export const PushFilesSchema = mergeSchemas(
  GitHubBaseSchema,
  z.object({
    owner: z.string().describe("Repository owner (username or organization)"),
    repo: z.string().describe("Repository name"),
    branch: z.string().describe("Branch to push to (e.g., 'main' or 'master')"),
    files: z.array(FileOperationSchema).describe("Array of files to push"),
    message: z.string().describe("Commit message"),
  })
);

export const GitHubCreateUpdateFileResponseSchema = z.object({
  content: z.any().nullable(),
  commit: z.object({
    sha: z.string(),
    node_id: z.string(),
    url: z.string(),
    html_url: z.string(),
    author: z.any(),
    committer: z.any(),
    message: z.string(),
    tree: z.object({
      sha: z.string(),
      url: z.string(),
    }),
    parents: z.array(
      z.object({
        sha: z.string(),
        url: z.string(),
        html_url: z.string(),
      })
    ),
  }),
});

// 型のエクスポート
export type FileOperation = z.infer<typeof FileOperationSchema>;
export type GitHubCreateUpdateFileResponse = z.infer<typeof GitHubCreateUpdateFileResponseSchema>;

/**
 * GitHubリポジトリからファイルまたはディレクトリの内容を取得
 */
export async function getFileContents(
  owner: string,
  repo: string,
  path: string,
  branch?: string,
  accountProfile?: string
) {
  let url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  if (branch) {
    url += `?ref=${branch}`;
  }

  const response = await githubRequest(url, {}, accountProfile);
  const data = GitHubContentSchema.parse(response);

  // If it's a file, decode the content
  if (!Array.isArray(data) && data.content) {
    data.content = Buffer.from(data.content, "base64").toString("utf8");
  }

  return data;
}

/**
 * GitHubリポジトリ内のファイルを作成または更新
 */
export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string,
  accountProfile?: string
) {
  const encodedContent = Buffer.from(content).toString("base64");

  let currentSha = sha;
  if (!currentSha) {
    try {
      const existingFile = await getFileContents(owner, repo, path, branch, accountProfile);
      if (!Array.isArray(existingFile)) {
        currentSha = existingFile.sha;
      }
    } catch (error) {
      console.error("Note: File does not exist in branch, will create new file");
    }
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const body = {
    message,
    content: encodedContent,
    branch,
    ...(currentSha ? { sha: currentSha } : {}),
  };

  const response = await githubRequest(url, {
    method: "PUT",
    body,
  }, accountProfile);

  return GitHubCreateUpdateFileResponseSchema.parse(response);
}

/**
 * GitHubリポジトリ内にツリーオブジェクトを作成
 * @private
 */
async function createTree(
  owner: string,
  repo: string,
  files: FileOperation[],
  baseTree?: string,
  accountProfile?: string
) {
  const tree = files.map((file) => ({
    path: file.path,
    mode: "100644" as const,
    type: "blob" as const,
    content: file.content,
  }));

  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/trees`,
    {
      method: "POST",
      body: {
        tree,
        base_tree: baseTree,
      },
    },
    accountProfile
  );

  return GitHubTreeSchema.parse(response);
}

/**
 * GitHubリポジトリ内にコミットを作成
 * @private
 */
async function createCommit(
  owner: string,
  repo: string,
  message: string,
  tree: string,
  parents: string[],
  accountProfile?: string
) {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: {
        message,
        tree,
        parents,
      },
    },
    accountProfile
  );

  return GitHubCommitSchema.parse(response);
}

/**
 * GitHubリポジトリ内の参照（ブランチなど）を更新
 * @private
 */
async function updateReference(
  owner: string,
  repo: string,
  ref: string,
  sha: string,
  accountProfile?: string
) {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/${ref}`,
    {
      method: "PATCH",
      body: {
        sha,
        force: true,
      },
    },
    accountProfile
  );

  return GitHubReferenceSchema.parse(response);
}

/**
 * 複数のファイルを1つのコミットでGitHubリポジトリにプッシュ
 */
export async function pushFiles(
  owner: string,
  repo: string,
  branch: string,
  files: FileOperation[],
  message: string,
  accountProfile?: string
) {
  const refResponse = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {},
    accountProfile
  );

  const ref = GitHubReferenceSchema.parse(refResponse);
  const commitSha = ref.object.sha;

  const tree = await createTree(owner, repo, files, commitSha, accountProfile);
  const commit = await createCommit(owner, repo, message, tree.sha, [commitSha], accountProfile);
  return await updateReference(owner, repo, `heads/${branch}`, commit.sha, accountProfile);
}
