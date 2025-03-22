/**
 * ブランチの作成と管理を行うGitHubブランチ操作。
 */

import { z } from 'zod';
import { githubRequest, validateBranchName } from '../common/utils';
import { GitHubReferenceSchema } from '../common/types';
import { GitHubBaseSchema, mergeSchemas } from '../common/base-schemas';

// ブランチスキーマの定義
export const CreateBranchSchema = mergeSchemas(
  GitHubBaseSchema,
  z.object({
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    branch: z.string().describe("New branch name"),
    from_branch: z.string().optional().describe("Base branch name"),
  })
);

/**
 * GitHubリポジトリに新しいブランチを作成
 */
export async function createBranchFromRef(
  owner: string,
  repo: string,
  branch: string,
  fromBranch?: string,
  accountProfile?: string
) {
  // Validate branch names
  branch = validateBranchName(branch);
  const baseBranch = fromBranch ? validateBranchName(fromBranch) : "main";

  // Get the base branch's SHA
  const refResponse = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${baseBranch}`,
    {},
    accountProfile
  );
  const ref = GitHubReferenceSchema.parse(refResponse);

  // Create the new branch
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      body: {
        ref: `refs/heads/${branch}`,
        sha: ref.object.sha,
      },
    },
    accountProfile
  );

  return GitHubReferenceSchema.parse(response);
}
