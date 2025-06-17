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
import { createReadStream } from "fs";
import { createInterface } from "readline";

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
  args.map(async (dir) => {
    try {
      const stats = await fs.stat(dir);
      if (!stats.isDirectory()) {
        console.error(`Error: ${dir} is not a directory`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error accessing directory ${dir}:`, error);
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
});

const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const EditOperation = z.object({
  oldText: z.string().describe("Text to search for - must match exactly"),
  newText: z.string().describe("Text to replace with"),
});

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

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

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
    version: "0.3.0",
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
  edits: Array<{ oldText: string; newText: string }>,
  dryRun = false,
): Promise<string> {
  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, "utf-8"));

  // Apply edits sequentially
  let modifiedContent = content;
  for (const edit of edits) {
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
  } = {}
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const maxResults = options.maxResults || 100;
  
  // パターンを正規表現に変換
  const searchRegex = options.regex
    ? new RegExp(pattern, options.caseSensitive ? 'g' : 'gi')
    : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options.caseSensitive ? 'g' : 'gi');

  async function searchInFile(filePath: string) {
    try {
      const fileStream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let lineNumber = 0;

      for await (const line of rl) {
        lineNumber++;

        if (searchRegex.test(line)) {
          const match = line.match(searchRegex)?.[0] || '';
          results.push({
            file: filePath,
            line: lineNumber,
            content: line.trim(),
            match
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
            const textExtensions = ['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.xml', '.html', '.css', '.scss', '.py', '.java', '.c', '.cpp', '.h', '.sh', '.yaml', '.yml'];
            
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

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_file",
        description:
          "Read file contents with proper encoding. Returns detailed errors if read fails. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
      },
      {
        name: "read_multiple_files",
        description:
          "Read multiple files simultaneously. More efficient than reading one by one. Returns each file's content with its path. Failed reads don't stop the operation. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
      },
      {
        name: "write_file",
        description:
          "Create or overwrite a file. Caution: overwrites without warning. Handles text encoding. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
      },
      {
        name: "edit_file",
        description:
          "Make line-based edits to text files. Replaces exact line sequences. Returns git-style diff. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
      },
      {
        name: "create_directory",
        description:
          "Create directory or ensure it exists. Creates nested directories. Succeeds silently if already exists. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "list_directory",
        description:
          "List files and directories in a path. Distinguished with [FILE] and [DIR] prefixes. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "directory_tree",
        description:
          "Get recursive tree view as JSON. Each entry has name, type (file/directory), and children for directories. 2-space indented output. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
      },
      {
        name: "move_file",
        description:
          "Move or rename files and directories. Fails if destination exists. Both paths must be within allowed directories.",
        inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
      },
      {
        name: "search_files",
        description:
          "Recursively search files matching a pattern. Case-insensitive, partial name matching. Returns full paths. Only searches within allowed directories.",
        inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
      },
      {
        name: "get_file_info",
        description:
          "Get file/directory metadata: size, creation time, modified time, permissions, type. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
      },
      {
        name: "list_allowed_directories",
        description: "List directories this server can access.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      // Phase 1: 新規ツール
      {
        name: "delete_file",
        description:
          "Delete a file. This operation cannot be undone. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(DeleteFileArgsSchema) as ToolInput,
      },
      {
        name: "copy_file",
        description:
          "Copy a file to a new location. Fails if destination exists unless overwrite is true. Both paths must be within allowed directories.",
        inputSchema: zodToJsonSchema(CopyFileArgsSchema) as ToolInput,
      },
      {
        name: "append_file",
        description:
          "Append content to the end of a file. Creates the file if it doesn't exist. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(AppendFileArgsSchema) as ToolInput,
      },
      {
        name: "search_content",
        description:
          "Search for content within files. Supports plain text and regex search. Returns matching lines with file path and line number. Only searches within allowed directories.",
        inputSchema: zodToJsonSchema(SearchContentArgsSchema) as ToolInput,
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
        const content = await fs.readFile(validPath, "utf-8");
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
          throw new Error("Cannot delete directory with delete_file. Use a different tool for directories.");
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
            if ((error as any).code !== 'ENOENT') {
              throw error;
            }
          }
        }
        
        await fs.copyFile(validSource, validDest);
        return {
          content: [{ type: "text", text: `Successfully copied ${parsed.data.source} to ${parsed.data.destination}` }],
        };
      }

      case "append_file": {
        const parsed = AppendFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for append_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        
        let content = parsed.data.content;
        if (parsed.data.ensureNewline && !content.endsWith('\n')) {
          content += '\n';
        }
        
        await fs.appendFile(validPath, content, 'utf-8');
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
        
        const formatted = results
          .map(r => `${r.file}:${r.line}: ${r.content}`)
          .join('\n');
          
        return {
          content: [{ type: "text", text: formatted }],
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
