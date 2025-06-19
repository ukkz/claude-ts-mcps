/**
 * GitHub リリース操作モジュール
 *
 * このモジュールは、GitHub APIを使用してリリースの作成、取得、更新、削除などの
 * 操作を提供します。
 */

import { z } from "zod";
import { githubRequest } from "../common/utils";

/**
 * リリース作成のための入力スキーマ
 */
export const CreateReleaseSchema = z.object({
  owner: z.string().describe("リポジトリオーナー（ユーザー名または組織名）"),
  repo: z.string().describe("リポジトリ名"),
  tag_name: z.string().describe("リリースのタグ名"),
  target_commitish: z.string().optional().describe("タグを作成するブランチまたはコミットSHA"),
  name: z.string().optional().describe("リリース名"),
  body: z.string().optional().describe("リリースの説明"),
  draft: z.boolean().optional().default(false).describe("ドラフト（未公開）リリースとして作成"),
  prerelease: z.boolean().optional().default(false).describe("プレリリースとして識別"),
  generate_release_notes: z
    .boolean()
    .optional()
    .default(false)
    .describe("自動的にリリースノートを生成"),
  account_profile: z.string().optional().describe("使用するGitHubアカウントプロファイル"),
});

/**
 * リリース取得のための入力スキーマ
 */
export const GetReleaseSchema = z.object({
  owner: z.string().describe("リポジトリオーナー"),
  repo: z.string().describe("リポジトリ名"),
  release_id: z.number().describe("リリースID"),
  account_profile: z.string().optional(),
});

/**
 * 最新リリース取得のための入力スキーマ
 */
export const GetLatestReleaseSchema = z.object({
  owner: z.string().describe("リポジトリオーナー"),
  repo: z.string().describe("リポジトリ名"),
  account_profile: z.string().optional(),
});

/**
 * リリース一覧取得のための入力スキーマ
 */
export const ListReleasesSchema = z.object({
  owner: z.string().describe("リポジトリオーナー"),
  repo: z.string().describe("リポジトリ名"),
  per_page: z.number().optional().default(30).describe("1ページあたりの結果数"),
  page: z.number().optional().default(1).describe("ページ番号"),
  account_profile: z.string().optional(),
});

/**
 * リリース更新のための入力スキーマ
 */
export const UpdateReleaseSchema = z.object({
  owner: z.string().describe("リポジトリオーナー"),
  repo: z.string().describe("リポジトリ名"),
  release_id: z.number().describe("リリースID"),
  tag_name: z.string().optional().describe("リリースのタグ名"),
  target_commitish: z.string().optional().describe("タグを作成するブランチまたはコミットSHA"),
  name: z.string().optional().describe("リリース名"),
  body: z.string().optional().describe("リリースの説明"),
  draft: z.boolean().optional().describe("ドラフト（未公開）リリースとして設定"),
  prerelease: z.boolean().optional().describe("プレリリースとして識別"),
  account_profile: z.string().optional(),
});

/**
 * リリース削除のための入力スキーマ
 */
export const DeleteReleaseSchema = z.object({
  owner: z.string().describe("リポジトリオーナー"),
  repo: z.string().describe("リポジトリ名"),
  release_id: z.number().describe("リリースID"),
  account_profile: z.string().optional(),
});

/**
 * 新しいリリースを作成する
 */
export async function createRelease(
  owner: string,
  repo: string,
  tag_name: string,
  options: {
    target_commitish?: string;
    name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
    generate_release_notes?: boolean;
  } = {},
  accountProfile?: string,
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases`;
  const body = {
    tag_name,
    ...options,
  };

  return githubRequest(url, { method: "POST", body }, accountProfile);
}

/**
 * 特定のリリースを取得する
 */
export async function getRelease(
  owner: string,
  repo: string,
  release_id: number,
  accountProfile?: string,
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/${release_id}`;
  return githubRequest(url, {}, accountProfile);
}

/**
 * 最新のリリースを取得する
 */
export async function getLatestRelease(owner: string, repo: string, accountProfile?: string) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  return githubRequest(url, {}, accountProfile);
}

/**
 * リリースの一覧を取得する
 */
export async function listReleases(
  owner: string,
  repo: string,
  options: {
    per_page?: number;
    page?: number;
  } = {},
  accountProfile?: string,
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases`;
  const params = new URLSearchParams();
  if (options.per_page) params.append("per_page", options.per_page.toString());
  if (options.page) params.append("page", options.page.toString());

  const urlWithParams = params.toString() ? `${url}?${params}` : url;
  return githubRequest(urlWithParams, {}, accountProfile);
}

/**
 * 既存のリリースを更新する
 */
export async function updateRelease(
  owner: string,
  repo: string,
  release_id: number,
  options: {
    tag_name?: string;
    target_commitish?: string;
    name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
  } = {},
  accountProfile?: string,
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/${release_id}`;
  return githubRequest(url, { method: "PATCH", body: options }, accountProfile);
}

/**
 * リリースを削除する
 */
export async function deleteRelease(
  owner: string,
  repo: string,
  release_id: number,
  accountProfile?: string,
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/${release_id}`;
  await githubRequest(url, { method: "DELETE" }, accountProfile);
  return { message: `Release ${release_id} deleted successfully` };
}
