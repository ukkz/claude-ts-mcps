import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createTwoFilesPatch } from "diff";
import { minimatch } from "minimatch";
import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import { promisify } from "util";
import zlib from "zlib";
import { pipeline } from "stream/promises";
import { exec } from "child_process";

const execAsync = promisify(exec);

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-filesystem <allowed-directory> [additional-directories...]");
  process.exit(1);
}

// Normalize all paths consistently
function normalizePath(p: string): string {
  return path.normalize(p);
}

function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Store allowed directories in normalized form
const allowedDirectories = args.map((dir) => normalizePath(path.resolve(expandHome(dir))));

// Validate that all directories exist and are accessible
await Promise.all(
  allowedDirectories.map(async (dir, index) => {
    try {
      const stats = await fs.stat(dir);
      if (!stats.isDirectory()) {
        console.error(`Error: ${args[index]} is not a directory`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error accessing directory ${args[index]}:`, error);
      process.exit(1);
    }
  }),
);

// Security utilities
async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some((dir) => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new Error(
      `Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(", ")}`,
    );
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some((dir) => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some((dir) => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Schema definitions
const ReadFileArgsSchema = z.object({
  path: z.string(),
  encoding: z.enum(["utf-8", "base64", "hex"]).default("utf-8"),
  range: z
    .object({
      start: z.number().optional(),
      end: z.number().optional(),
      lines: z
        .object({
          from: z.number().positive(),
          to: z.number().positive(),
        })
        .optional(),
    })
    .optional(),
});

const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

// EditOperationをユニオン型に変更
const EditOperation = z.union([
  z.object({
    type: z.literal("replace").default("replace"),
    oldText: z.string().describe("Text to search for - must match exactly"),
    newText: z.string().describe("Text to replace with"),
  }),
  z.object({
    type: z.literal("line"),
    lineNumber: z.number().positive().describe("Line number (1-based)"),
    action: z.enum(["replace", "insert", "delete"]).describe("Action to perform"),
    content: z.string().optional().describe("Content for replace or insert actions"),
  }),
  z.object({
    type: z.literal("regex"),
    pattern: z.string().describe("Regular expression pattern"),
    replacement: z.string().describe("Replacement string (can use $1, $2, etc.)"),
    flags: z.string().optional().default("g").describe("Regex flags (g, i, m, etc.)"),
  }),
]);

const EditFileArgsSchema = z.object({
  path: z.string(),
  edits: z.array(EditOperation),
  dryRun: z.boolean().default(false).describe("Preview changes using git-style diff format"),
});

const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});

const DirectoryTreeArgsSchema = z.object({
  path: z.string(),
});

const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  excludePatterns: z.array(z.string()).optional().default([]),
});

const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

// Phase 1: 新規ツールのスキーマ定義
const DeleteFileArgsSchema = z.object({
  path: z.string(),
});

const CopyFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
  overwrite: z.boolean().default(false),
});

const AppendFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
  ensureNewline: z.boolean().default(true).describe("末尾に改行を確保"),
});

const SearchContentArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  filePattern: z.string().optional().describe("ファイル名パターン"),
  regex: z.boolean().default(false).describe("正規表現として扱う"),
  caseSensitive: z.boolean().default(true).describe("大文字小文字を区別"),
  maxResults: z.number().default(100).describe("最大結果数"),
});

// Phase 3: バッチ操作のスキーマ定義
const BatchOperationSchema = z.object({
  type: z.enum(["read", "write", "copy", "move", "delete", "append"]),
  params: z.record(z.any()),
  continueOnError: z.boolean().default(false),
});

const BatchOperationsArgsSchema = z.object({
  operations: z.array(BatchOperationSchema),
  parallel: z.boolean().default(false).describe("読み取り操作のみ並列実行可能"),
  transactional: z.boolean().default(false).describe("エラー時に全操作をロールバック"),
});

// Phase 3: ファイル監視のスキーマ定義（簡易実装）
const WatchFileArgsSchema = z.object({
  path: z.string(),
  events: z.array(z.enum(["change", "rename", "delete"])).default(["change"]),
  recursive: z.boolean().default(false),
  // MCPの制約により、監視は1回のチェックのみ
  since: z.number().optional().describe("この時刻以降の変更を検出（ミリ秒）"),
});

// Phase 3: 圧縮・解凍のスキーマ定義
const CompressFilesArgsSchema = z.object({
  files: z.array(z.string()),
  output: z.string(),
  format: z.enum(["zip", "tar", "tar.gz"]).default("zip"),
});

const ExtractArchiveArgsSchema = z.object({
  archive: z.string(),
  destination: z.string(),
  overwrite: z.boolean().default(false),
});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

// EditOperationの型定義
type EditOperationType = z.infer<typeof EditOperation>;

interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

// 検索結果の型定義
interface SearchResult {
  file: string;
  line: number;
  content: string;
  match: string;
}

// Server setup
const server = new Server(
  {
    name: "secure-filesystem-server",
    version: "0.6.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool implementations
async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = [],
): Promise<string[]> {
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      try {
        // Validate each path before processing
        await validatePath(fullPath);

        // Check if path matches any exclude pattern
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some((pattern) => {
          const globPattern = pattern.includes("*") ? pattern : `**/${pattern}/**`;
          return minimatch(relativePath, globPattern, { dot: true });
        });

        if (shouldExclude) {
          continue;
        }

        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}

// Phase 3: バッチ操作の実装
interface BatchOperationResult {
  operation: z.infer<typeof BatchOperationSchema>;
  success: boolean;
  result?: any;
  error?: string;
}

// ロールバック用の情報を保存
interface RollbackInfo {
  type: string;
  params: any;
}

async function executeBatchOperations(
  operations: z.infer<typeof BatchOperationSchema>[],
  options: { parallel?: boolean; transactional?: boolean } = {},
): Promise<BatchOperationResult[]> {
  const results: BatchOperationResult[] = [];
  const rollbackStack: RollbackInfo[] = [];

  // 読み取り操作かどうかをチェック
  const isReadOperation = (type: string) => ["read"].includes(type);

  // 単一操作の実行
  const executeOperation = async (
    op: z.infer<typeof BatchOperationSchema>,
  ): Promise<BatchOperationResult> => {
    try {
      let result: any;

      switch (op.type) {
        case "read": {
          const validPath = await validatePath(op.params.path);
          result = await fs.readFile(validPath, "utf-8");
          break;
        }
        case "write": {
          const validPath = await validatePath(op.params.path);
          // ロールバック用に元の内容を保存
          if (options.transactional) {
            try {
              const originalContent = await fs.readFile(validPath, "utf-8");
              rollbackStack.push({
                type: "write",
                params: { path: op.params.path, content: originalContent },
              });
            } catch {
              // ファイルが存在しない場合は削除でロールバック
              rollbackStack.push({ type: "delete", params: { path: op.params.path } });
            }
          }
          await fs.writeFile(validPath, op.params.content, "utf-8");
          result = `Written to ${op.params.path}`;
          break;
        }
        case "copy": {
          const validSource = await validatePath(op.params.source);
          const validDest = await validatePath(op.params.destination);
          if (options.transactional) {
            rollbackStack.push({ type: "delete", params: { path: op.params.destination } });
          }
          await fs.copyFile(validSource, validDest);
          result = `Copied ${op.params.source} to ${op.params.destination}`;
          break;
        }
        case "move": {
          const validSource = await validatePath(op.params.source);
          const validDest = await validatePath(op.params.destination);
          if (options.transactional) {
            rollbackStack.push({
              type: "move",
              params: { source: op.params.destination, destination: op.params.source },
            });
          }
          await fs.rename(validSource, validDest);
          result = `Moved ${op.params.source} to ${op.params.destination}`;
          break;
        }
        case "delete": {
          const validPath = await validatePath(op.params.path);
          if (options.transactional) {
            const content = await fs.readFile(validPath, "utf-8");
            rollbackStack.push({ type: "write", params: { path: op.params.path, content } });
          }
          await fs.unlink(validPath);
          result = `Deleted ${op.params.path}`;
          break;
        }
        case "append": {
          const validPath = await validatePath(op.params.path);
          if (options.transactional) {
            try {
              const originalContent = await fs.readFile(validPath, "utf-8");
              rollbackStack.push({
                type: "write",
                params: { path: op.params.path, content: originalContent },
              });
            } catch {
              rollbackStack.push({ type: "delete", params: { path: op.params.path } });
            }
          }
          await fs.appendFile(validPath, op.params.content, "utf-8");
          result = `Appended to ${op.params.path}`;
          break;
        }
        default:
          throw new Error(`Unknown operation type: ${op.type}`);
      }

      return { operation: op, success: true, result };
    } catch (error) {
      return {
        operation: op,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  // ロールバック処理
  const performRollback = async () => {
    console.error("Performing rollback due to transaction failure...");
    for (const rollback of rollbackStack.reverse()) {
      try {
        await executeOperation({
          type: rollback.type as any,
          params: rollback.params,
          continueOnError: false,
        });
      } catch (error) {
        console.error(`Rollback failed for ${rollback.type}:`, error);
      }
    }
  };

  try {
    if (options.parallel) {
      // 並列実行（読み取り操作のみ）
      const readOps = operations.filter((op) => isReadOperation(op.type));
      const otherOps = operations.filter((op) => !isReadOperation(op.type));

      // 読み取り操作を並列実行
      const readResults = await Promise.all(readOps.map(executeOperation));
      results.push(...readResults);

      // その他の操作を順次実行
      for (const op of otherOps) {
        const result = await executeOperation(op);
        results.push(result);

        if (!result.success && !op.continueOnError && options.transactional) {
          await performRollback();
          throw new Error(`Operation failed: ${result.error}`);
        }
      }
    } else {
      // 順次実行
      for (const op of operations) {
        const result = await executeOperation(op);
        results.push(result);

        if (!result.success && !op.continueOnError) {
          if (options.transactional) {
            await performRollback();
          }
          break;
        }
      }
    }
  } catch (error) {
    // エラーが発生した場合、結果に含める
    if (results.length === 0 || !results[results.length - 1]?.error) {
      const failedOp = operations[results.length] || operations[0];
      if (failedOp) {
        results.push({
          operation: failedOp,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return results;
}

// Phase 3: ファイル監視機能（簡易実装）
interface FileChangeInfo {
  path: string;
  type: "change" | "rename" | "delete" | "none";
  oldStats?: FileInfo;
  newStats?: FileInfo;
}

async function checkFileChanges(
  filePath: string,
  options: {
    events?: ("change" | "rename" | "delete")[];
    recursive?: boolean;
    since?: number;
  } = {},
): Promise<FileChangeInfo[]> {
  const changes: FileChangeInfo[] = [];
  const events = options.events || ["change"];
  const since = options.since || Date.now() - 1000; // デフォルトは1秒前

  async function checkSingleFile(path: string): Promise<FileChangeInfo | null> {
    try {
      const stats = await getFileStats(path);
      const modifiedTime = stats.modified.getTime();

      if (modifiedTime > since) {
        if (events.includes("change")) {
          return {
            path,
            type: "change",
            newStats: stats,
          };
        }
      }
      return null;
    } catch (error) {
      // ファイルが存在しない場合
      if (events.includes("delete")) {
        return {
          path,
          type: "delete",
        };
      }
      return null;
    }
  }

  async function checkDirectory(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      try {
        await validatePath(fullPath);

        if (entry.isDirectory() && options.recursive) {
          await checkDirectory(fullPath);
        } else {
          const change = await checkSingleFile(fullPath);
          if (change) {
            changes.push(change);
          }
        }
      } catch {
        // アクセスできないパスは無視
      }
    }
  }

  const validPath = await validatePath(filePath);
  const stats = await fs.stat(validPath);

  if (stats.isDirectory()) {
    await checkDirectory(validPath);
  } else {
    const change = await checkSingleFile(validPath);
    if (change) {
      changes.push(change);
    }
  }

  return changes;
}

// Phase 3: 圧縮・解凍機能
async function compressFiles(
  files: string[],
  outputPath: string,
  format: "zip" | "tar" | "tar.gz" = "zip",
): Promise<string> {
  // 入力ファイルの検証
  const validFiles = await Promise.all(files.map((f) => validatePath(f)));
  const validOutput = await validatePath(outputPath);

  // フォーマットに応じた圧縮コマンドを実行
  try {
    switch (format) {
      case "zip": {
        // zipコマンドを使用
        const fileList = validFiles.map((f) => `"${f}"`).join(" ");
        await execAsync(`zip -r "${validOutput}" ${fileList}`);
        break;
      }
      case "tar": {
        // tarコマンドを使用
        const fileList = validFiles.map((f) => `"${f}"`).join(" ");
        await execAsync(`tar -cf "${validOutput}" ${fileList}`);
        break;
      }
      case "tar.gz": {
        // tar.gz形式
        const fileList = validFiles.map((f) => `"${f}"`).join(" ");
        await execAsync(`tar -czf "${validOutput}" ${fileList}`);
        break;
      }
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return `Successfully created archive: ${outputPath}`;
  } catch (error) {
    // コマンドが利用できない場合は、Node.jsの組み込み機能を使用
    if (format === "tar.gz") {
      // tar.gzの代替実装（単一ファイルのgzip圧縮のみ）
      if (validFiles.length === 1) {
        const firstFile = validFiles[0];
        if (!firstFile) {
          throw new Error("No files to compress");
        }
        const input = createReadStream(firstFile);
        const output = createWriteStream(validOutput);
        const gzip = zlib.createGzip();

        await pipeline(input, gzip, output);
        return `Successfully created gzip archive: ${outputPath}`;
      }
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Compression failed: ${errorMsg}. Make sure required tools (zip/tar) are installed.`,
    );
  }
}

async function extractArchive(
  archivePath: string,
  destinationPath: string,
  overwrite: boolean = false,
): Promise<string> {
  const validArchive = await validatePath(archivePath);
  const validDest = await validatePath(destinationPath);

  // 宛先ディレクトリの作成
  await fs.mkdir(validDest, { recursive: true });

  // ファイル拡張子に基づいて解凍方法を決定
  const ext = path.extname(archivePath).toLowerCase();

  try {
    switch (ext) {
      case ".zip": {
        const overwriteFlag = overwrite ? "-o" : "";
        await execAsync(`unzip ${overwriteFlag} "${validArchive}" -d "${validDest}"`);
        break;
      }
      case ".tar": {
        await execAsync(`tar -xf "${validArchive}" -C "${validDest}"`);
        break;
      }
      case ".gz": {
        if (archivePath.endsWith(".tar.gz")) {
          await execAsync(`tar -xzf "${validArchive}" -C "${validDest}"`);
        } else {
          // 単一ファイルのgzip解凍
          const baseName = path.basename(archivePath, ".gz");
          const outputFile = path.join(validDest, baseName);
          const input = createReadStream(validArchive);
          const output = createWriteStream(outputFile);
          const gunzip = zlib.createGunzip();

          await pipeline(input, gunzip, output);
        }
        break;
      }
      default:
        throw new Error(`Unsupported archive format: ${ext}`);
    }

    return `Successfully extracted archive to: ${destinationPath}`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Extraction failed: ${errorMsg}. Make sure required tools (unzip/tar) are installed.`,
    );
  }
}

// file editing and diffing utilities
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function createUnifiedDiff(
  originalContent: string,
  newContent: string,
  filepath: string = "file",
): string {
  // Ensure consistent line endings for diff
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);

  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    "original",
    "modified",
  );
}

async function applyFileEdits(
  filePath: string,
  edits: EditOperationType[],
  dryRun = false,
): Promise<string> {
  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, "utf-8"));

  // Apply edits sequentially
  let modifiedContent = content;

  for (const edit of edits) {
    // 各編集タイプに応じた処理
    if (edit.type === "replace" || !edit.type) {
      // 既存のテキスト置換処理
      const normalizedOld = normalizeLineEndings(edit.oldText);
      const normalizedNew = normalizeLineEndings(edit.newText);

      // If exact match exists, use it
      if (modifiedContent.includes(normalizedOld)) {
        modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
        continue;
      }

      // Otherwise, try line-by-line matching with flexibility for whitespace
      const oldLines = normalizedOld.split("\n");
      const contentLines = modifiedContent.split("\n");
      let matchFound = false;

      for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
        const potentialMatch = contentLines.slice(i, i + oldLines.length);

        // Compare lines with normalized whitespace
        const isMatch = oldLines.every((oldLine, j) => {
          const contentLine = potentialMatch[j];
          return contentLine !== undefined && oldLine.trim() === contentLine.trim();
        });

        if (isMatch) {
          // Preserve original indentation of first line
          const originalIndent = contentLines[i]?.match(/^\s*/)?.[0] || "";
          const newLines = normalizedNew.split("\n").map((line, j) => {
            if (j === 0) return originalIndent + line.trimStart();
            // For subsequent lines, try to preserve relative indentation
            const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || "";
            const newIndent = line.match(/^\s*/)?.[0] || "";
            if (oldIndent && newIndent) {
              const relativeIndent = newIndent.length - oldIndent.length;
              return originalIndent + " ".repeat(Math.max(0, relativeIndent)) + line.trimStart();
            }
            return line;
          });

          contentLines.splice(i, oldLines.length, ...newLines);
          modifiedContent = contentLines.join("\n");
          matchFound = true;
          break;
        }
      }

      if (!matchFound) {
        throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
      }
    } else if (edit.type === "line") {
      // 行番号ベースの編集
      const lines = modifiedContent.split("\n");
      const lineIndex = edit.lineNumber - 1; // 0-based index

      if (lineIndex < 0 || lineIndex > lines.length) {
        throw new Error(`Line number ${edit.lineNumber} is out of range (1-${lines.length})`);
      }

      switch (edit.action) {
        case "replace":
          if (edit.content === undefined) {
            throw new Error("Content is required for replace action");
          }
          if (lineIndex >= lines.length) {
            throw new Error(
              `Cannot replace line ${edit.lineNumber}: file has only ${lines.length} lines`,
            );
          }
          lines[lineIndex] = edit.content;
          break;

        case "insert":
          if (edit.content === undefined) {
            throw new Error("Content is required for insert action");
          }
          // insertは指定行の前に挿入
          lines.splice(lineIndex, 0, edit.content);
          break;

        case "delete":
          if (lineIndex >= lines.length) {
            throw new Error(
              `Cannot delete line ${edit.lineNumber}: file has only ${lines.length} lines`,
            );
          }
          lines.splice(lineIndex, 1);
          break;

        default:
          throw new Error(`Unknown line action: ${edit.action}`);
      }

      modifiedContent = lines.join("\n");
    } else if (edit.type === "regex") {
      // 正規表現による置換
      try {
        const regex = new RegExp(edit.pattern, edit.flags || "g");
        modifiedContent = modifiedContent.replace(regex, edit.replacement);
      } catch (error) {
        throw new Error(`Invalid regex pattern: ${edit.pattern}. Error: ${error}`);
      }
    } else {
      throw new Error(`Unknown edit type: ${(edit as any).type}`);
    }
  }

  // Create unified diff
  const diff = createUnifiedDiff(content, modifiedContent, filePath);

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`;

  if (!dryRun) {
    await fs.writeFile(filePath, modifiedContent, "utf-8");
  }

  return formattedDiff;
}

// Phase 1: ファイル内容検索機能
async function searchContent(
  rootPath: string,
  pattern: string,
  options: {
    filePattern?: string;
    regex?: boolean;
    caseSensitive?: boolean;
    maxResults?: number;
  } = {},
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const maxResults = options.maxResults || 100;

  // パターンを正規表現に変換
  const searchRegex = options.regex
    ? new RegExp(pattern, options.caseSensitive ? "g" : "gi")
    : new RegExp(
        pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        options.caseSensitive ? "g" : "gi",
      );

  async function searchInFile(filePath: string) {
    try {
      const fileStream = createReadStream(filePath, { encoding: "utf8" });
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let lineNumber = 0;

      for await (const line of rl) {
        lineNumber++;

        if (searchRegex.test(line)) {
          const match = line.match(searchRegex)?.[0] || "";
          results.push({
            file: filePath,
            line: lineNumber,
            content: line.trim(),
            match,
          });

          if (results.length >= maxResults) {
            rl.close();
            return;
          }
        }
      }
    } catch (error) {
      // バイナリファイルなどは無視
    }
  }

  async function searchDirectory(dirPath: string) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      try {
        await validatePath(fullPath);

        if (entry.isDirectory()) {
          await searchDirectory(fullPath);
        } else if (entry.isFile()) {
          // ファイルパターンチェック
          if (!options.filePattern || entry.name.includes(options.filePattern)) {
            // テキストファイルかどうかを簡易的にチェック
            const ext = path.extname(entry.name).toLowerCase();
            const textExtensions = [
              ".txt",
              ".md",
              ".js",
              ".ts",
              ".jsx",
              ".tsx",
              ".json",
              ".xml",
              ".html",
              ".css",
              ".scss",
              ".py",
              ".java",
              ".c",
              ".cpp",
              ".h",
              ".sh",
              ".yaml",
              ".yml",
            ];

            if (textExtensions.includes(ext) || !ext) {
              await searchInFile(fullPath);
            }
          }
        }
      } catch {
        // アクセス権限がないパスは無視
      }

      if (results.length >= maxResults) {
        return;
      }
    }
  }

  const stats = await fs.stat(rootPath);
  if (stats.isDirectory()) {
    await searchDirectory(rootPath);
  } else {
    await searchInFile(rootPath);
  }

  return results;
}

// MCPアノテーションの型定義
interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  costHint?: "low" | "medium" | "high";
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_file",
        description:
          "Read file contents with proper encoding. Supports partial reading by byte range or line range. Encoding options: utf-8, base64, hex. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル読み取り",
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "read_multiple_files",
        description:
          "Read multiple files simultaneously. More efficient than reading one by one. Returns each file's content with its path. Failed reads don't stop the operation. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
        annotations: {
          title: "複数ファイル読み取り",
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "write_file",
        description:
          "Create or overwrite a file. Caution: overwrites without warning. Handles text encoding. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル書き込み",
          readOnlyHint: false,
          idempotentHint: false,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "edit_file",
        description:
          "Make edits to text files. Supports text replacement, line-based operations (replace/insert/delete), and regex replacements. Returns git-style diff. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル編集",
          readOnlyHint: false,
          idempotentHint: false,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "create_directory",
        description:
          "Create directory or ensure it exists. Creates nested directories. Succeeds silently if already exists. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
        annotations: {
          title: "ディレクトリ作成",
          readOnlyHint: false,
          idempotentHint: true,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "list_directory",
        description:
          "List files and directories in a path. Distinguished with [FILE] and [DIR] prefixes. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
        annotations: {
          title: "ディレクトリ一覧",
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "directory_tree",
        description:
          "Get recursive tree view as JSON. Each entry has name, type (file/directory), and children for directories. 2-space indented output. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
        annotations: {
          title: "ディレクトリツリー",
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: false,
          costHint: "medium",
        } as ToolAnnotations,
      },
      {
        name: "move_file",
        description:
          "Move or rename files and directories. Fails if destination exists. Both paths must be within allowed directories.",
        inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル移動",
          readOnlyHint: false,
          idempotentHint: false,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "create_file",
        description:
          "Create a new file (alias for write_file). Creates or overwrites a file. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル作成",
          readOnlyHint: false,
          idempotentHint: false,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "search_files",
        description:
          "Recursively search files matching a pattern. Case-insensitive, partial name matching. Returns full paths. Only searches within allowed directories.",
        inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル検索",
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: false,
          costHint: "medium",
        } as ToolAnnotations,
      },
      {
        name: "get_file_info",
        description:
          "Get file/directory metadata: size, creation time, modified time, permissions, type. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル情報取得",
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "list_allowed_directories",
        description: "List directories this server can access.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
        annotations: {
          title: "許可ディレクトリ一覧",
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      // Phase 1: 新規ツール
      {
        name: "delete_file",
        description:
          "Delete a file. This operation cannot be undone. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(DeleteFileArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル削除",
          readOnlyHint: false,
          idempotentHint: true,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "copy_file",
        description:
          "Copy a file to a new location. Fails if destination exists unless overwrite is true. Both paths must be within allowed directories.",
        inputSchema: zodToJsonSchema(CopyFileArgsSchema) as ToolInput,
        annotations: {
          title: "ファイルコピー",
          readOnlyHint: false,
          idempotentHint: false,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "append_file",
        description:
          "Append content to the end of a file. Creates the file if it doesn't exist. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(AppendFileArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル追記",
          readOnlyHint: false,
          idempotentHint: false,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "search_content",
        description:
          "Search for content within files. Supports plain text and regex search. Returns matching lines with file path and line number. Only searches within allowed directories.",
        inputSchema: zodToJsonSchema(SearchContentArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル内容検索",
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: false,
          costHint: "medium",
        } as ToolAnnotations,
      },
      // Phase 3: 新規ツール
      {
        name: "batch_operations",
        description:
          "Execute multiple file operations efficiently. Supports transactional mode (rollback on error) and parallel execution for read operations. Each operation result is returned individually.",
        inputSchema: zodToJsonSchema(BatchOperationsArgsSchema) as ToolInput,
        annotations: {
          title: "バッチ操作",
          readOnlyHint: false,
          idempotentHint: false,
          openWorldHint: false,
          costHint: "medium",
        } as ToolAnnotations,
      },
      {
        name: "watch_file",
        description:
          "Check for file changes since a specific time. Due to MCP constraints, this is a one-time check, not continuous monitoring. Returns list of changed files.",
        inputSchema: zodToJsonSchema(WatchFileArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル変更チェック",
          readOnlyHint: true,
          idempotentHint: false,
          openWorldHint: false,
          costHint: "low",
        } as ToolAnnotations,
      },
      {
        name: "compress_files",
        description:
          "Compress files into an archive. Supports zip, tar, and tar.gz formats. Requires appropriate tools (zip/tar) to be installed on the system.",
        inputSchema: zodToJsonSchema(CompressFilesArgsSchema) as ToolInput,
        annotations: {
          title: "ファイル圧縮",
          readOnlyHint: false,
          idempotentHint: false,
          openWorldHint: false,
          costHint: "medium",
        } as ToolAnnotations,
      },
      {
        name: "extract_archive",
        description:
          "Extract files from an archive. Supports zip, tar, and tar.gz formats. Creates destination directory if it doesn't exist. Requires appropriate tools (unzip/tar) to be installed.",
        inputSchema: zodToJsonSchema(ExtractArchiveArgsSchema) as ToolInput,
        annotations: {
          title: "アーカイブ解凍",
          readOnlyHint: false,
          idempotentHint: false,
          openWorldHint: false,
          costHint: "medium",
        } as ToolAnnotations,
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_file": {
        const parsed = ReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);

        // エンコーディングに応じた読み込み
        let content: string;
        if (parsed.data.encoding === "base64" || parsed.data.encoding === "hex") {
          const buffer = await fs.readFile(validPath);
          content = buffer.toString(parsed.data.encoding);
        } else {
          content = await fs.readFile(validPath, "utf-8");
        }

        // 範囲指定がある場合の処理
        if (parsed.data.range) {
          if (parsed.data.range.lines) {
            // 行範囲指定
            const lines = content.split("\n");
            const { from, to } = parsed.data.range.lines;

            if (from < 1 || to < from || from > lines.length) {
              throw new Error(`Invalid line range: ${from}-${to} (file has ${lines.length} lines)`);
            }

            const selectedLines = lines.slice(from - 1, Math.min(to, lines.length));
            content = selectedLines.join("\n");
          } else if (parsed.data.range.start !== undefined || parsed.data.range.end !== undefined) {
            // バイト範囲指定
            const start = parsed.data.range.start || 0;
            const end = parsed.data.range.end || content.length;

            if (start < 0 || end < start || start > content.length) {
              throw new Error(
                `Invalid byte range: ${start}-${end} (content length: ${content.length})`,
              );
            }

            content = content.slice(start, end);
          }
        }

        return {
          content: [{ type: "text", text: content }],
        };
      }

      case "read_multiple_files": {
        const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
        }
        const results = await Promise.all(
          parsed.data.paths.map(async (filePath: string) => {
            try {
              const validPath = await validatePath(filePath);
              const content = await fs.readFile(validPath, "utf-8");
              return `${filePath}:\n${content}\n`;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              return `${filePath}: Error - ${errorMessage}`;
            }
          }),
        );
        return {
          content: [{ type: "text", text: results.join("\n---\n") }],
        };
      }

      case "write_file": {
        const parsed = WriteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.writeFile(validPath, parsed.data.content, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
        };
      }

      case "edit_file": {
        const parsed = EditFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const result = await applyFileEdits(validPath, parsed.data.edits, parsed.data.dryRun);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "create_directory": {
        const parsed = CreateDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.mkdir(validPath, { recursive: true });
        return {
          content: [{ type: "text", text: `Successfully created directory ${parsed.data.path}` }],
        };
      }

      case "list_directory": {
        const parsed = ListDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const formatted = entries
          .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
          .join("\n");
        return {
          content: [{ type: "text", text: formatted }],
        };
      }

      case "directory_tree": {
        const parsed = DirectoryTreeArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
        }

        interface TreeEntry {
          name: string;
          type: "file" | "directory";
          children?: TreeEntry[];
        }

        async function buildTree(currentPath: string): Promise<TreeEntry[]> {
          const validPath = await validatePath(currentPath);
          const entries = await fs.readdir(validPath, { withFileTypes: true });
          const result: TreeEntry[] = [];

          for (const entry of entries) {
            const entryData: TreeEntry = {
              name: entry.name,
              type: entry.isDirectory() ? "directory" : "file",
            };

            if (entry.isDirectory()) {
              const subPath = path.join(currentPath, entry.name);
              entryData.children = await buildTree(subPath);
            }

            result.push(entryData);
          }

          return result;
        }

        const treeData = await buildTree(parsed.data.path);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(treeData, null, 2),
            },
          ],
        };
      }

      case "move_file": {
        const parsed = MoveFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
        }
        const validSourcePath = await validatePath(parsed.data.source);
        const validDestPath = await validatePath(parsed.data.destination);
        await fs.rename(validSourcePath, validDestPath);
        return {
          content: [
            {
              type: "text",
              text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}`,
            },
          ],
        };
      }

      case "search_files": {
        const parsed = SearchFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const results = await searchFiles(
          validPath,
          parsed.data.pattern,
          parsed.data.excludePatterns,
        );
        return {
          content: [
            { type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" },
          ],
        };
      }

      case "get_file_info": {
        const parsed = GetFileInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const info = await getFileStats(validPath);
        return {
          content: [
            {
              type: "text",
              text: Object.entries(info)
                .map(([key, value]) => `${key}: ${value}`)
                .join("\n"),
            },
          ],
        };
      }

      case "list_allowed_directories": {
        return {
          content: [
            {
              type: "text",
              text: `Allowed directories:\n${allowedDirectories.join("\n")}`,
            },
          ],
        };
      }

      // Phase 1: 新規ツールの実装
      case "delete_file": {
        const parsed = DeleteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for delete_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);

        // ファイルの存在確認
        const stats = await fs.stat(validPath);
        if (stats.isDirectory()) {
          throw new Error(
            "Cannot delete directory with delete_file. Use a different tool for directories.",
          );
        }

        await fs.unlink(validPath);
        return {
          content: [{ type: "text", text: `Successfully deleted file: ${parsed.data.path}` }],
        };
      }

      case "copy_file": {
        const parsed = CopyFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for copy_file: ${parsed.error}`);
        }
        const validSource = await validatePath(parsed.data.source);
        const validDest = await validatePath(parsed.data.destination);

        // 宛先の存在確認
        if (!parsed.data.overwrite) {
          try {
            await fs.access(validDest);
            throw new Error(`Destination file already exists: ${parsed.data.destination}`);
          } catch (error) {
            // ファイルが存在しない場合は正常
            if ((error as any).code !== "ENOENT") {
              throw error;
            }
          }
        }

        await fs.copyFile(validSource, validDest);
        return {
          content: [
            {
              type: "text",
              text: `Successfully copied ${parsed.data.source} to ${parsed.data.destination}`,
            },
          ],
        };
      }

      case "append_file": {
        const parsed = AppendFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for append_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);

        let content = parsed.data.content;
        if (parsed.data.ensureNewline && !content.endsWith("\n")) {
          content += "\n";
        }

        await fs.appendFile(validPath, content, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully appended to ${parsed.data.path}` }],
        };
      }

      case "search_content": {
        const parsed = SearchContentArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_content: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);

        const results = await searchContent(validPath, parsed.data.pattern, {
          filePattern: parsed.data.filePattern,
          regex: parsed.data.regex,
          caseSensitive: parsed.data.caseSensitive,
          maxResults: parsed.data.maxResults,
        });

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: "No matches found" }],
          };
        }

        const formatted = results.map((r) => `${r.file}:${r.line}: ${r.content}`).join("\n");

        return {
          content: [{ type: "text", text: formatted }],
        };
      }

      // Phase 3: 新規ツールのハンドラー
      case "batch_operations": {
        const parsed = BatchOperationsArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for batch_operations: ${parsed.error}`);
        }

        const results = await executeBatchOperations(parsed.data.operations, {
          parallel: parsed.data.parallel,
          transactional: parsed.data.transactional,
        });

        // 結果をフォーマット
        const formatted = results
          .map((r, i) => {
            const status = r.success ? "✓" : "✗";
            const detail = r.success ? r.result : `Error: ${r.error}`;
            return `[${i + 1}] ${status} ${r.operation.type}: ${detail}`;
          })
          .join("\n");

        return {
          content: [{ type: "text", text: formatted }],
        };
      }

      case "watch_file": {
        const parsed = WatchFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for watch_file: ${parsed.error}`);
        }

        const changes = await checkFileChanges(parsed.data.path, {
          events: parsed.data.events,
          recursive: parsed.data.recursive,
          since: parsed.data.since,
        });

        if (changes.length === 0) {
          return {
            content: [{ type: "text", text: "No changes detected" }],
          };
        }

        const formatted = changes
          .map((c) => {
            let detail = `${c.type}: ${c.path}`;
            if (c.newStats) {
              detail += ` (modified: ${c.newStats.modified.toISOString()})`;
            }
            return detail;
          })
          .join("\n");

        return {
          content: [{ type: "text", text: formatted }],
        };
      }

      case "compress_files": {
        const parsed = CompressFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for compress_files: ${parsed.error}`);
        }

        const result = await compressFiles(
          parsed.data.files,
          parsed.data.output,
          parsed.data.format,
        );

        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "extract_archive": {
        const parsed = ExtractArchiveArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for extract_archive: ${parsed.error}`);
        }

        const result = await extractArchive(
          parsed.data.archive,
          parsed.data.destination,
          parsed.data.overwrite,
        );

        return {
          content: [{ type: "text", text: result }],
        };
      }

      // create_fileケース - write_fileへのエイリアス
      case "create_file": {
        const parsed = WriteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for create_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.writeFile(validPath, parsed.data.content, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully created file ${parsed.data.path}` }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Secure MCP Filesystem Server running on stdio");
  console.error("Allowed directories:", allowedDirectories);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
