/**
 * Git操作を可能にするModel Context Protocol(MCP)サーバーの実装
 * このサーバーは、GitリポジトリのAPI機能を提供します
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { parseArgs } from "node:util";

// コマンドライン引数の解析
const { values } = parseArgs({
  options: {
    repository: {
      type: "string",
      short: "r",
      help: "Git repository path",
    },
    verbose: {
      type: "boolean",
      short: "v",
      count: true,
      default: false,
      help: "Enable verbose logging",
    },
  },
  allowPositionals: true,
});

const repository = values.repository;
const verbose = values.verbose;

// 詳細度フラグに基づいてログレベルを設定
const logLevel = verbose ? "debug" : "info";
function log(level: string, ...args: any[]) {
  if (level === "debug" && logLevel !== "debug") return;
  console.error(`[${level.toUpperCase()}]`, ...args);
}

// Gitコマンド実行のためのexec関数のPromise化
const execAsync = promisify(exec);

// Gitコマンドラッパー
class GitRepo {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  // 有効なGitリポジトリかどうかをチェックするシンプルなメソッド
  static async isValidRepo(repoPath: string): Promise<boolean> {
    try {
      await execAsync("git rev-parse --is-inside-work-tree", { cwd: repoPath });
      return true;
    } catch (error) {
      return false;
    }
  }

  // 新しいGitリポジトリを初期化
  static async init(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git init`, { cwd: repoPath });
      return stdout.trim();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return `Error initializing repository: ${errorMsg}`;
    }
  }

  // リポジトリの状態を取得
  async status(): Promise<string> {
    const { stdout } = await execAsync("git status", { cwd: this.repoPath });
    return stdout;
  }

  // ステージングされていない変更を表示
  async diffUnstaged(): Promise<string> {
    const { stdout } = await execAsync("git diff", { cwd: this.repoPath });
    return stdout;
  }

  // ステージングされた変更を表示
  async diffStaged(): Promise<string> {
    const { stdout } = await execAsync("git diff --cached", { cwd: this.repoPath });
    return stdout;
  }

  // 特定のターゲットとの差分を表示
  async diff(target: string): Promise<string> {
    const { stdout } = await execAsync(`git diff ${target}`, { cwd: this.repoPath });
    return stdout;
  }

  // 変更をコミット
  async commit(message: string): Promise<string> {
    const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: this.repoPath,
    });
    // 出力からコミットハッシュを抽出
    const commitHashMatch = stdout.match(/\[([a-f0-9]{7,40})\]/);
    const commitHash = commitHashMatch ? commitHashMatch[1] : "unknown";
    return `Changes committed successfully with hash ${commitHash}`;
  }

  // ファイルをステージングエリアに追加
  async add(files: string[]): Promise<string> {
    const fileList = files.map((file) => `"${file.replace(/"/g, '\\"')}"`).join(" ");
    await execAsync(`git add ${fileList}`, { cwd: this.repoPath });
    return "Files staged successfully";
  }

  // ステージングされた変更をリセット
  async reset(): Promise<string> {
    await execAsync("git reset", { cwd: this.repoPath });
    return "All staged changes reset";
  }

  // コミットログを表示
  async log(maxCount: number = 10): Promise<string[]> {
    const { stdout } = await execAsync(
      `git log -n ${maxCount} --pretty=format:"Commit: %H%nAuthor: %an <%ae>%nDate: %ad%nMessage: %s%n"`,
      { cwd: this.repoPath },
    );

    return stdout.split("\n\n").filter((entry) => entry.trim() !== "");
  }

  // 新しいブランチを作成
  async createBranch(branchName: string, baseBranch?: string): Promise<string> {
    if (baseBranch) {
      await execAsync(`git branch ${branchName} ${baseBranch}`, { cwd: this.repoPath });
      return `Created branch '${branchName}' from '${baseBranch}'`;
    } else {
      const { stdout: currentBranch } = await execAsync("git branch --show-current", {
        cwd: this.repoPath,
      });
      await execAsync(`git branch ${branchName}`, { cwd: this.repoPath });
      return `Created branch '${branchName}' from '${currentBranch.trim()}'`;
    }
  }

  // ブランチをチェックアウト
  async checkout(branchName: string): Promise<string> {
    await execAsync(`git checkout ${branchName}`, { cwd: this.repoPath });
    return `Switched to branch '${branchName}'`;
  }

  // コミットの詳細を表示
  async show(revision: string): Promise<string> {
    // コミット詳細を取得
    const { stdout: commitDetails } = await execAsync(
      `git show ${revision} --pretty=format:"Commit: %H%nAuthor: %an <%ae>%nDate: %ad%nMessage: %s%n"`,
      { cwd: this.repoPath },
    );

    // 差分を取得
    const { stdout: diff } = await execAsync(`git show ${revision} --format=""`, {
      cwd: this.repoPath,
    });

    return commitDetails + "\n" + diff;
  }

  // 軽量タグを作成
  async createTag(tagName: string, target?: string): Promise<string> {
    try {
      const targetRef = target || "HEAD";
      await execAsync(`git tag "${tagName.replace(/"/g, '\\"')}" ${targetRef}`, {
        cwd: this.repoPath,
      });
      return `Created tag '${tagName}' at ${targetRef}`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("already exists")) {
        throw new Error(`Tag '${tagName}' already exists`);
      }
      throw error;
    }
  }

  // 注釈付きタグを作成
  async createAnnotatedTag(tagName: string, message: string, target?: string): Promise<string> {
    try {
      const targetRef = target || "HEAD";
      // メッセージ内のダブルクォートをエスケープ
      const escapedMessage = message.replace(/"/g, '\\"');
      await execAsync(
        `git tag -a "${tagName.replace(/"/g, '\\"')}" -m "${escapedMessage}" ${targetRef}`,
        { cwd: this.repoPath },
      );
      return `Created annotated tag '${tagName}' at ${targetRef} with message: ${message}`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("already exists")) {
        throw new Error(`Tag '${tagName}' already exists`);
      }
      throw error;
    }
  }

  // タグの一覧を取得
  async listTags(pattern?: string): Promise<string[]> {
    try {
      const patternArg = pattern ? `"${pattern.replace(/"/g, '\\"')}"` : "";
      const { stdout } = await execAsync(`git tag -l ${patternArg}`, {
        cwd: this.repoPath,
      });
      return stdout
        .split("\n")
        .filter((tag) => tag.trim() !== "")
        .map((tag) => tag.trim());
    } catch (error) {
      return [];
    }
  }

  // タグを削除
  async deleteTag(tagName: string): Promise<string> {
    try {
      await execAsync(`git tag -d "${tagName.replace(/"/g, '\\"')}"`, {
        cwd: this.repoPath,
      });
      return `Deleted tag '${tagName}'`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("not found")) {
        throw new Error(`Tag '${tagName}' not found`);
      }
      throw error;
    }
  }

  // タグの詳細を表示（注釈付きタグの場合はメッセージも表示）
  async showTag(tagName: string): Promise<string> {
    try {
      // タグの情報を取得
      const { stdout: tagInfo } = await execAsync(
        `git show "${tagName.replace(/"/g, '\\"')}" --format="Tag: %H%nTagger: %an <%ae>%nDate: %ad%nMessage: %s%n%b"`,
        { cwd: this.repoPath },
      );
      return tagInfo;
    } catch (error) {
      // 軽量タグの場合は、タグが指すコミットの情報を表示
      try {
        const { stdout: commitInfo } = await execAsync(
          `git rev-list -n 1 "${tagName.replace(/"/g, '\\"')}"`,
          { cwd: this.repoPath },
        );
        const commitHash = commitInfo.trim();
        return `Lightweight tag '${tagName}' points to commit ${commitHash}`;
      } catch (innerError) {
        throw new Error(`Tag '${tagName}' not found`);
      }
    }
  }
}

// ツール入力用のZodスキーマを定義
const GitStatusSchema = z.object({
  repo_path: z.string(),
});

const GitDiffUnstagedSchema = z.object({
  repo_path: z.string(),
});

const GitDiffStagedSchema = z.object({
  repo_path: z.string(),
});

const GitDiffSchema = z.object({
  repo_path: z.string(),
  target: z.string(),
});

const GitCommitSchema = z.object({
  repo_path: z.string(),
  message: z.string(),
});

const GitAddSchema = z.object({
  repo_path: z.string(),
  files: z.array(z.string()),
});

const GitResetSchema = z.object({
  repo_path: z.string(),
});

const GitLogSchema = z.object({
  repo_path: z.string(),
  max_count: z.number().optional().default(10),
});

const GitCreateBranchSchema = z.object({
  repo_path: z.string(),
  branch_name: z.string(),
  base_branch: z.string().optional(),
});

const GitCheckoutSchema = z.object({
  repo_path: z.string(),
  branch_name: z.string(),
});

const GitShowSchema = z.object({
  repo_path: z.string(),
  revision: z.string(),
});

const GitInitSchema = z.object({
  repo_path: z.string(),
});

const GitCreateTagSchema = z.object({
  repo_path: z.string(),
  tag_name: z.string(),
  target: z.string().optional(),
});

const GitCreateAnnotatedTagSchema = z.object({
  repo_path: z.string(),
  tag_name: z.string(),
  message: z.string(),
  target: z.string().optional(),
});

const GitListTagsSchema = z.object({
  repo_path: z.string(),
  pattern: z.string().optional(),
});

const GitDeleteTagSchema = z.object({
  repo_path: z.string(),
  tag_name: z.string(),
});

const GitShowTagSchema = z.object({
  repo_path: z.string(),
  tag_name: z.string(),
});

// Gitツール名をenumオブジェクトとして定義
const GitTools = {
  STATUS: "git_status",
  DIFF_UNSTAGED: "git_diff_unstaged",
  DIFF_STAGED: "git_diff_staged",
  DIFF: "git_diff",
  COMMIT: "git_commit",
  ADD: "git_add",
  RESET: "git_reset",
  LOG: "git_log",
  CREATE_BRANCH: "git_create_branch",
  CHECKOUT: "git_checkout",
  SHOW: "git_show",
  INIT: "git_init",
  CREATE_TAG: "git_create_tag",
  CREATE_ANNOTATED_TAG: "git_create_annotated_tag",
  LIST_TAGS: "git_list_tags",
  DELETE_TAG: "git_delete_tag",
  SHOW_TAG: "git_show_tag",
} as const;

// MCPサーバーを初期化
const server = new McpServer({
  name: "mcp-git",
  version: "1.0.0",
});

// リポジトリパスが提供されている場合、有効かどうかを確認
if (repository) {
  GitRepo.isValidRepo(repository)
    .then((isValid) => {
      if (isValid) {
        log("info", `Using repository at ${repository}`);
      } else {
        log("error", `${repository} is not a valid Git repository`);
        process.exit(1);
      }
    })
    .catch((error) => {
      log("error", `Error accessing repository: ${error}`);
      process.exit(1);
    });
}

// Gitツールを定義
server.tool(
  GitTools.STATUS,
  "Shows the working tree status",
  GitStatusSchema.shape,
  async (args) => {
    try {
      const repo = new GitRepo(args.repo_path);
      const status = await repo.status();
      return {
        content: [
          {
            type: "text",
            text: `Repository status:\n${status}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  GitTools.DIFF_UNSTAGED,
  "Shows changes in the working directory that are not yet staged",
  GitDiffUnstagedSchema.shape,
  async (args) => {
    try {
      const repo = new GitRepo(args.repo_path);
      const diff = await repo.diffUnstaged();
      return {
        content: [
          {
            type: "text",
            text: `Unstaged changes:\n${diff}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  GitTools.DIFF_STAGED,
  "Shows changes that are staged for commit",
  GitDiffStagedSchema.shape,
  async (args) => {
    try {
      const repo = new GitRepo(args.repo_path);
      const diff = await repo.diffStaged();
      return {
        content: [
          {
            type: "text",
            text: `Staged changes:\n${diff}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  GitTools.DIFF,
  "Shows differences between branches or commits",
  GitDiffSchema.shape,
  async (args) => {
    try {
      const repo = new GitRepo(args.repo_path);
      const diff = await repo.diff(args.target);
      return {
        content: [
          {
            type: "text",
            text: `Diff with ${args.target}:\n${diff}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  GitTools.COMMIT,
  "Records changes to the repository",
  GitCommitSchema.shape,
  async (args) => {
    try {
      const repo = new GitRepo(args.repo_path);
      const result = await repo.commit(args.message);
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  GitTools.ADD,
  "Adds file contents to the staging area",
  GitAddSchema.shape,
  async (args) => {
    try {
      const repo = new GitRepo(args.repo_path);
      const result = await repo.add(args.files);
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(GitTools.RESET, "Unstages all staged changes", GitResetSchema.shape, async (args) => {
  try {
    const repo = new GitRepo(args.repo_path);
    const result = await repo.reset();
    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

server.tool(GitTools.LOG, "Shows the commit logs", GitLogSchema.shape, async (args) => {
  try {
    const repo = new GitRepo(args.repo_path);
    const log = await repo.log(args.max_count);
    return {
      content: [
        {
          type: "text",
          text: `Commit history:\n${log.join("\n\n")}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

server.tool(
  GitTools.CREATE_BRANCH,
  "Creates a new branch from an optional base branch",
  GitCreateBranchSchema.shape,
  async (args) => {
    try {
      const repo = new GitRepo(args.repo_path);
      const result = await repo.createBranch(args.branch_name, args.base_branch);
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(GitTools.CHECKOUT, "Switches branches", GitCheckoutSchema.shape, async (args) => {
  try {
    const repo = new GitRepo(args.repo_path);
    const result = await repo.checkout(args.branch_name);
    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

server.tool(GitTools.SHOW, "Shows the contents of a commit", GitShowSchema.shape, async (args) => {
  try {
    const repo = new GitRepo(args.repo_path);
    const result = await repo.show(args.revision);
    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

server.tool(GitTools.INIT, "Initialize a new Git repository", GitInitSchema.shape, async (args) => {
  try {
    const result = await GitRepo.init(args.repo_path);
    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

server.tool(
  GitTools.CREATE_TAG,
  "Create a lightweight tag at the specified target (defaults to HEAD)",
  GitCreateTagSchema.shape,
  async (args) => {
    try {
      const repo = new GitRepo(args.repo_path);
      const result = await repo.createTag(args.tag_name, args.target);
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  GitTools.CREATE_ANNOTATED_TAG,
  "Create an annotated tag with a message at the specified target (defaults to HEAD)",
  GitCreateAnnotatedTagSchema.shape,
  async (args) => {
    try {
      const repo = new GitRepo(args.repo_path);
      const result = await repo.createAnnotatedTag(args.tag_name, args.message, args.target);
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  GitTools.LIST_TAGS,
  "List all tags, optionally filtered by pattern",
  GitListTagsSchema.shape,
  async (args) => {
    try {
      const repo = new GitRepo(args.repo_path);
      const tags = await repo.listTags(args.pattern);
      const tagList = tags.length > 0 ? tags.join("\n") : "No tags found";
      return {
        content: [
          {
            type: "text",
            text: `Tags:\n${tagList}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(GitTools.DELETE_TAG, "Delete a tag", GitDeleteTagSchema.shape, async (args) => {
  try {
    const repo = new GitRepo(args.repo_path);
    const result = await repo.deleteTag(args.tag_name);
    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

server.tool(
  GitTools.SHOW_TAG,
  "Show tag details (including message for annotated tags)",
  GitShowTagSchema.shape,
  async (args) => {
    try {
      const repo = new GitRepo(args.repo_path);
      const result = await repo.showTag(args.tag_name);
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// サーバーを起動
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("info", "Git MCP Server started");
  } catch (error) {
    log("error", `Server error: ${error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
