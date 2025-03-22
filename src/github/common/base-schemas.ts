/**
 * すべてのGitHub操作に共通するベーススキーマを定義します。
 * これにより複数アカウントサポートなどの共通機能を一元管理できます。
 */

import { z } from 'zod';

/**
 * 複数アカウントをサポートするためのベーススキーマ
 * すべての操作スキーマはこれを拡張することで、アカウントプロファイルを指定できるようになります
 */
export const GitHubBaseSchema = z.object({
  account_profile: z.string().optional().describe("GitHub account profile to use (corresponds to environment variable GITHUB_TOKEN_XXX)")
});

/**
 * 複数のスキーマを結合して新しいスキーマを作成する
 * ベーススキーマと操作固有のスキーマを結合するのに便利です
 * 
 * @param schemas 結合するスキーマの配列
 * @returns 結合された新しいスキーマ
 */
export function mergeSchemas(...schemas: z.ZodObject<any>[]) {
  // 空のスキーマから開始
  let mergedShape = {};

  // 各スキーマのフィールドを結合
  for (const schema of schemas) {
    mergedShape = { ...mergedShape, ...schema.shape };
  }

  return z.object(mergedShape);
}
