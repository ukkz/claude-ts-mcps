/**
 * Git MCPサーバーのタグ機能テスト
 * このファイルは新しく追加されたタグ機能の動作確認用です
 */

import { exec } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

async function testGitTags() {
  // 一時的なテストリポジトリを作成
  const tempDir = await mkdtemp(join(tmpdir(), "git-test-"));
  console.log(`テストリポジトリ作成: ${tempDir}`);

  try {
    // リポジトリ初期化
    await execAsync("git init", { cwd: tempDir });
    await execAsync('git config user.email "test@example.com"', { cwd: tempDir });
    await execAsync('git config user.name "Test User"', { cwd: tempDir });

    // テストファイルを作成してコミット
    await execAsync('echo "Initial content" > test.txt', { cwd: tempDir });
    await execAsync("git add test.txt", { cwd: tempDir });
    await execAsync('git commit -m "Initial commit"', { cwd: tempDir });

    // 軽量タグのテスト
    console.log("\n=== 軽量タグのテスト ===");
    await execAsync('git tag v1.0.0', { cwd: tempDir });
    const { stdout: tags1 } = await execAsync("git tag -l", { cwd: tempDir });
    console.log("作成されたタグ:", tags1.trim());

    // 注釈付きタグのテスト
    console.log("\n=== 注釈付きタグのテスト ===");
    await execAsync('git tag -a v2.0.0 -m "Major release with new features"', { cwd: tempDir });
    const { stdout: tags2 } = await execAsync("git tag -l", { cwd: tempDir });
    console.log("全てのタグ:", tags2.trim());

    // タグの詳細表示
    console.log("\n=== タグの詳細 ===");
    const { stdout: tagInfo } = await execAsync("git show v2.0.0", { cwd: tempDir });
    console.log("注釈付きタグの情報:");
    console.log(tagInfo.split("\n").slice(0, 5).join("\n"));

    // パターンでタグをフィルタリング
    console.log("\n=== パターンフィルタリング ===");
    const { stdout: v1Tags } = await execAsync('git tag -l "v1.*"', { cwd: tempDir });
    console.log("v1.*のタグ:", v1Tags.trim());

    // タグの削除テスト
    console.log("\n=== タグの削除 ===");
    await execAsync("git tag -d v1.0.0", { cwd: tempDir });
    const { stdout: remainingTags } = await execAsync("git tag -l", { cwd: tempDir });
    console.log("削除後のタグ:", remainingTags.trim());

    console.log("\n✅ 全てのテストが成功しました！");
  } catch (error) {
    console.error("❌ テストエラー:", error);
  } finally {
    // テンポラリディレクトリをクリーンアップ
    await rm(tempDir, { recursive: true, force: true });
    console.log(`\nテストリポジトリを削除しました: ${tempDir}`);
  }
}

// テスト実行
testGitTags().catch(console.error);
