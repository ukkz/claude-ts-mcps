/**
 * リポジトリの検索、作成、管理を行うGitHubリポジトリ操作。
 */

import { z } from "zod";
import { githubRequest, buildUrl, validateRepositoryName } from "../common/utils";
import { GitHubRepositorySchema } from "../common/types";

// リポジトリスキーマの定義
export const SearchRepositoriesSchema = z.object({
  query: z.string().describe("Search query"),
  page: z.number().optional().describe("Page number"),
  perPage: z.number().optional().describe("Results per page"),
  account_profile: z.string().optional().describe("GitHub account profile to use"),
});

export const CreateRepositoryOptionsSchema = z.object({
  name: z.string().describe("Repository name"),
  description: z.string().optional().describe("Repository description"),
  private: z.boolean().optional().describe("Create as private repository"),
  auto_init: z.boolean().optional().describe("Auto-initialize with README.md"),
  gitignore_template: z.string().optional().describe(".gitignore template"),
  license_template: z.string().optional().describe("License template"),
  account_profile: z.string().optional().describe("GitHub account profile to use"),
});

/**
 * GitHubリポジトリを検索
 */
export async function searchRepositories(
  query: string,
  page?: number,
  perPage?: number,
  accountProfile?: string,
) {
  const url = buildUrl(`https://api.github.com/search/repositories`, {
    q: query,
    page: page,
    per_page: perPage,
  });

  const response = await githubRequest(url, {}, accountProfile);
  return response;
}

/**
 * 新しいGitHubリポジトリを作成
 */
export async function createRepository(options: z.infer<typeof CreateRepositoryOptionsSchema>) {
  // Validate repository name
  options.name = validateRepositoryName(options.name);

  // accountProfileを分離してbodyから除外
  const { account_profile, ...repositoryOptions } = options;

  const response = await githubRequest(
    `https://api.github.com/user/repos`,
    {
      method: "POST",
      body: repositoryOptions,
    },
    account_profile,
  );

  return GitHubRepositorySchema.parse(response);
}
