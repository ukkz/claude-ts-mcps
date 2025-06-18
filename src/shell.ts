/**
 * MCP server for shell command execution
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, SpawnOptions, execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

import { parseArgs } from "node:util";

// Parse command line arguments
const { values } = parseArgs({
  options: {
    baseDir: {
      type: "string",
      short: "d",
      help: "Base directory for command execution",
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

const baseDirectory = values.baseDir || process.cwd();
const verbose = values.verbose;

// Set log level based on verbosity
const logLevel = verbose ? "debug" : "info";
function log(level: string, ...args: any[]) {
  if (level === "debug" && logLevel !== "debug") return;
  console.error(`[${level.toUpperCase()}]`, ...args);
}

/**
 * Load user shell environment variables from shell rc files
 */
function loadUserShellEnvironment(): Record<string, string> {
  let envVars: Record<string, string> = {};

  try {
    // Detect default shell
    const shell = process.env.SHELL || "/bin/bash";
    const shellName = path.basename(shell);

    log("info", `Detected shell: ${shellName}`);

    // Determine command based on shell type

    // Export environment variables using shell
    let command: string = '';
    if (shellName === "zsh") {
      command =
        'zsh -c "source ~/.zshrc 2>/dev/null || true; source ~/.zshenv 2>/dev/null || true; env"';
    } else if (shellName === "bash") {
      command =
        'bash -c "source ~/.bashrc 2>/dev/null || true; source ~/.bash_profile 2>/dev/null || true; env"';
    } else {
      command = `${shell} -c "env"`;
    }

    if (!command) {
      return process.env as Record<string, string>;
    }

    // Get environment variables
    const envOutput = execSync(command, { encoding: "utf8" });

    // Parse output to create environment variable map
    envOutput.split("\n").forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, name, value] = match;
        if (name && value !== undefined) {
          envVars[name] = value;
        }
      }
    });

    log("info", `Loaded ${Object.keys(envVars).length} environment variables from shell profile`);
    if (verbose && envVars["PATH"]) {
      log("debug", `PATH=${envVars["PATH"]}`);
    }

    return envVars;
  } catch (error) {
    log(
      "error",
      `Failed to load shell environment: ${error instanceof Error ? error.message : String(error)}`,
    );
    return process.env as Record<string, string>;
  }
}

// Load user shell environment
const userEnv = loadUserShellEnvironment();

/**
 * Parse command string handling quotes and escapes
 */
function parseCommandString(commandString: string): { command: string; args: string[] } {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < commandString.length; i++) {
    const char = commandString[i];
    
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    
    if (char === '\\') {
      if (inSingleQuote) {
        current += char;
      } else {
        escaped = true;
      }
      continue;
    }
    
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    
    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    
    current += char;
  }
  
  if (current) {
    tokens.push(current);
  }
  
  return {
    command: tokens[0] || '',
    args: tokens.slice(1)
  };
}

/**
 * Shell command executor
 */
class ShellExecutor {
  private allowedCommands: Set<string>;
  private baseDirectory: string;
  private maxTimeout: number;
  private shellEnvironment: Record<string, string>;


  constructor(baseDir: string, shellEnv: Record<string, string>) {
    // Set allowed commands for development
    this.allowedCommands = new Set([
      // Package managers
      "npm",
      "yarn",
      "pnpm",
      "bun",
      // Version control
      "git",
      // File system
      "ls",
      "dir",
      "find",
      "mkdir",
      "rmdir",
      "cp",
      "mv",
      "rm",
      "cat",
      // Dev tools
      "node",
      "python",
      "python3",
      "tsc",
      "eslint",
      "prettier",
      // Build tools
      "make",
      "cargo",
      "go",
      // Container tools
      "docker",
      "docker-compose",
      // Other utilities
      "echo",
      "touch",
      "grep",
    ]);

    // Set base directory
    this.baseDirectory = baseDir;

    // Max timeout 60 seconds
    this.maxTimeout = 60000;

    // Set shell environment
    this.shellEnvironment = shellEnv;
  }

  /**
   * Execute shell command
   */
  public async executeCommand(
    command: string,
    args: string[] = [],
    cwd?: string,
    env?: Record<string, string>,
    timeout?: number,
    maxOutputSizeMB?: number,
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    success: boolean;
    error?: string;
  }> {
    // Define command and args at method scope
    let actualCommand = command;
    let actualArgs = args;
    
    try {
      if (!command) {
        return this.createErrorResponse("Command not specified");
      }

      // Auto-split command string if args empty
      
      if (args.length === 0 && command.includes(' ')) {
        // Parse command string
        const parsed = parseCommandString(command);
        actualCommand = parsed.command;
        actualArgs = parsed.args;
        
        log("debug", `Auto-split: "${command}" -> cmd: "${actualCommand}", args: [${actualArgs.map(arg => `"${arg}"`).join(', ')}]`);
      }

      // Security check: verify command is allowed
      if (!this.isCommandAllowed(actualCommand)) {
        const availableCommands = Array.from(this.allowedCommands).sort();
        
        // Special message for cd command
        if (actualCommand === "cd" || actualCommand.toLowerCase() === "cd") {
          return this.createErrorResponse(
            `'cd' command not supported. Each command runs in isolation.\n` +
              `Use 'cwd' parameter instead:\n` +
              `Example: {"command": "ls", "cwd": "./src"}\n` +
              `Base directory: ${this.baseDirectory}`,
          );
        }
        
        return this.createErrorResponse(
          `Command not allowed: ${actualCommand}\n` +
          `Allowed commands: ${availableCommands.join(", ")}\n` +
          `Check command spelling or request additional commands if needed`,
        );
      }

      // Validate working directory
      let workingDir: string;
      try {
        workingDir = this.validateWorkingDirectory(cwd);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return this.createErrorResponse(
          `${errorMessage}\n` +
            `Base: ${this.baseDirectory}\n` +
            `Specified: ${cwd || "(not specified)"}`,
        );
      }

      // Merge environment variables
      const mergedEnv = { ...this.shellEnvironment, ...(env || {}) };

      // Execute command and return result
      return await this.spawnCommand(
        actualCommand,
        actualArgs,
        {
          cwd: workingDir,
          env: mergedEnv,
          timeout: Math.min(timeout || this.maxTimeout, this.maxTimeout),
        },
        maxOutputSizeMB,
      );
    } catch (error) {
      // Handle unexpected errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      return this.createErrorResponse(
        `Failed to execute: ${errorMessage}\n` +
          `Command: ${actualCommand} ${actualArgs.join(" ")}\n` +
          `Original: ${command}${args.length > 0 ? " " + args.join(" ") : ""}\n` +
          `Directory: ${cwd || this.baseDirectory}` +
          (errorStack ? `\n${errorStack}` : ""),
      );
    }
  }

  /**
   * Create standardized error response
   */
  private createErrorResponse(message: string): {
    stdout: string;
    stderr: string;
    exitCode: number;
    success: boolean;
    error: string;
  } {
    return {
      stdout: "",
      stderr: message,
      exitCode: 1,
      success: false,
      error: message,
    };
  }

  /**
   * Check if command is in allowed list
   */
  private isCommandAllowed(command: string): boolean {
    // Extract base command name
    const commandName = path.basename(command);
    return this.allowedCommands.has(commandName);
  }

  /**
   * Validate and normalize working directory
   */
  private validateWorkingDirectory(cwd?: string): string {
    if (!cwd) {
      return this.baseDirectory;
    }

    // Resolve path (support relative paths)
    const resolvedPath = path.resolve(this.baseDirectory, cwd);

    // Security: ensure path is within base directory
    if (!resolvedPath.startsWith(this.baseDirectory)) {
      throw new Error(
        `Directory ${cwd} outside allowed base\n` +
          `Base: ${this.baseDirectory}\n` +
          `Resolved: ${resolvedPath}`,
      );
    }

    // Check directory exists
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(
        `Directory not found: ${resolvedPath}\n` +
          `Specified: ${cwd}\n` +
          `Base: ${this.baseDirectory}`,
      );
    }

    return resolvedPath;
  }

  /**
   * Spawn command process and handle output
   */
  private spawnCommand(
    command: string,
    args: string[],
    options: SpawnOptions,
    maxOutputSizeMB?: number,
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    success: boolean;
    error?: string;
  }> {
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let stdoutSize = 0;
      let stderrSize = 0;
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let timeoutId: NodeJS.Timeout | Timer | null = null;

      // Max output size
      const maxSize = (maxOutputSizeMB || 1) * 1024 * 1024;

      // Circular buffer for tail output
      const tailBufferSize = Math.min(10240, Math.floor(maxSize / 10));
      let stdoutTailBuffer: string[] = [];
      let stderrTailBuffer: string[] = [];

      // Use spawn for better stream handling
      const childProcess = spawn(command, args, {
        ...options,
        shell: true,
        stdio: "pipe",
      });

      // Collect stdout with size limit
      childProcess.stdout?.on("data", (data) => {
        const chunk = data.toString();
        const chunkSize = Buffer.byteLength(chunk, "utf8");

        if (stdoutSize + chunkSize <= maxSize - tailBufferSize) {
          stdout += chunk;
          stdoutSize += chunkSize;
        } else {
          if (!stdoutTruncated) {
            // Add remaining capacity
            const remainingSize = maxSize - tailBufferSize - stdoutSize;
            if (remainingSize > 0) {
              const truncatedChunk = chunk.substring(0, Math.floor(remainingSize / 2));
              stdout += truncatedChunk;
            }
            stdout +=
              "\n[Output truncated - showing first/last portions]\n[...middle omitted...]\n";
            stdoutTruncated = true;
          }

          // Save to circular buffer
          stdoutTailBuffer.push(chunk);
          // Limit buffer size
          while (stdoutTailBuffer.join("").length > tailBufferSize) {
            stdoutTailBuffer.shift();
          }
        }
      });

      // Collect stderr with size limit
      childProcess.stderr?.on("data", (data) => {
        const chunk = data.toString();
        const chunkSize = Buffer.byteLength(chunk, "utf8");

        if (stderrSize + chunkSize <= maxSize - tailBufferSize) {
          stderr += chunk;
          stderrSize += chunkSize;
        } else {
          if (!stderrTruncated) {
            // 最大サイズに達した場合、残りの容量分だけ追加
            const remainingSize = maxSize - tailBufferSize - stderrSize;
            if (remainingSize > 0) {
              const truncatedChunk = chunk.substring(0, Math.floor(remainingSize / 2));
              stderr += truncatedChunk;
            }
            stderr +=
              "\n[Error truncated - showing first/last portions]\n[...middle omitted...]\n";
            stderrTruncated = true;
          }

          // Save to circular buffer
          stderrTailBuffer.push(chunk);
          // Limit buffer size
          while (stderrTailBuffer.join("").length > tailBufferSize) {
            stderrTailBuffer.shift();
          }
        }
      });

      // Handle process completion
      childProcess.on("close", (exitCode) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Add tail if truncated
        if (stdoutTruncated && stdoutTailBuffer.length > 0) {
          stdout += stdoutTailBuffer.join("");
        }
        if (stderrTruncated && stderrTailBuffer.length > 0) {
          stderr += stderrTailBuffer.join("");
        }

        resolve({
          stdout,
          stderr,
          exitCode: exitCode !== null ? exitCode : 1,
          success: exitCode === 0,
        });
      });

      // Handle process errors
      childProcess.on("error", (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Include error details
        const errorInfo = `Process error: ${error.message}`;
        const systemError = error as NodeJS.ErrnoException;
        let additionalInfo = "";

        if (systemError.code === "ENOENT") {
          additionalInfo = `\nCommand not found: ${command}\nPATH: ${options.env?.PATH || process.env.PATH}`;
        } else if (systemError.code === "EACCES") {
          additionalInfo = `\nPermission denied: ${command}`;
        } else if (systemError.code) {
          additionalInfo = `\nError code: ${systemError.code}`;
        }

        resolve({
          stdout,
          stderr: stderr + errorInfo + additionalInfo,
          exitCode: 1,
          success: false,
          error: error.message + additionalInfo,
        });
      });

      // Setup timeout handling
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          childProcess.kill("SIGTERM");

          // Force kill after 1 second
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill("SIGKILL");
            }
          }, 1000);

          const timeoutInfo = `\nTimeout: ${options.timeout}ms, stdout: ${stdoutSize}B, stderr: ${stderrSize}B`;

          resolve({
            stdout: stdout + (stdoutTruncated ? stdoutTailBuffer.join("") : ""),
            stderr:
              stderr +
              (stderrTruncated ? stderrTailBuffer.join("") : "") +
              timeoutInfo,
            exitCode: 124, // GNU timeout compatible
            success: false,
            error: `Command timed out after ${options.timeout}ms`,
          });
        }, options.timeout);
      }
    });
  }

  /**
   * Get list of allowed commands
   */
  public getAllowedCommands(): string[] {
    return Array.from(this.allowedCommands);
  }

  /**
   * Add command to allowed list
   */
  public allowCommand(command: string): void {
    this.allowedCommands.add(command);
  }

  /**
   * Remove command from allowed list
   */
  public disallowCommand(command: string): void {
    this.allowedCommands.delete(command);
  }
}

// Check base directory exists
if (!fs.existsSync(baseDirectory)) {
  console.error(`Error: Base directory ${baseDirectory} does not exist.`);
  process.exit(1);
}

// Create shell executor instance
const shellExecutor = new ShellExecutor(baseDirectory, userEnv);

// Define Zod schemas for tool inputs
const ShellExecuteSchema = z.object({
  command: z.string().describe("Shell command to execute. Can include full command string with args (e.g. 'git add .'). Note: 'cd' command NOT supported - use 'cwd' parameter for directory navigation"),
  args: z.array(z.string()).optional().default([]).describe("Command arguments array. Optional if command contains full command string"),
  cwd: z.string().optional().describe("Working directory. IMPORTANT: Use this for directory navigation, NOT 'cd' command"),
  env: z.record(z.string()).optional().describe("Environment variables"),
  timeout: z.number().optional().describe("Timeout in milliseconds"),
  maxOutputSizeMB: z
    .number()
    .optional()
    .default(1)
    .describe("Max output size in MB (default: 1MB)"),
});

// MCP transport limits:
// - Default timeout: 60s (TypeScript SDK)
// - Large responses may cause Claude Desktop issues
// - Error code: -32001 (RequestTimeout)

const GetAllowedCommandsSchema = z.object({});

// Define tool names
const ShellTools = {
  EXECUTE: "shell_execute",
  GET_ALLOWED_COMMANDS: "shell_get_allowed_commands",
} as const;

// Initialize MCP server
const server = new McpServer({
  name: "mcp-shell",
  version: "1.0.0",
});

// Define shell tools
server.tool(
  ShellTools.EXECUTE,
  "Execute shell commands for development tasks. You can use either: 1) command='git add .' (complete command string - recommended), or 2) command='git' args=['add', '.']. **IMPORTANT: Directory navigation must be done using the 'cwd' parameter, NOT with 'cd' commands. The 'cd' command will have no effect as each command runs in isolation.** Supports package managers (npm, pnpm, yarn, bun), git, file operations, and dev tools (node, python, tsc). Runs in controlled environment with security restrictions. Each command execution is stateless - use 'cwd' parameter to set working directory.",
  ShellExecuteSchema.shape,
  async (args) => {
    try {
      const startTime = Date.now();
      const result = await shellExecutor.executeCommand(
        args.command,
        args.args || [],
        args.cwd,
        args.env,
        args.timeout,
        args.maxOutputSizeMB,
      );

      if (!result.success) {
        // Build error message


        let errorMessage = `Command failed: ${args.command} ${(args.args || []).join(" ")}\n`;
        errorMessage += `Exit code: ${result.exitCode}\n`;
        errorMessage += `Directory: ${args.cwd || baseDirectory}\n`;

        if (result.stderr) {
          errorMessage += `\nSTDERR:\n${result.stderr}\n`;
        }
        if (result.stdout) {
          errorMessage += `\nSTDOUT:\n${result.stdout}\n`;
        }
        if (result.error) {
          errorMessage += `\nERROR: ${result.error}\n`;
        }

        errorMessage += `\nExecution time: ${Date.now() - startTime}ms\n`;
        errorMessage += `Output limit: ${args.maxOutputSizeMB || 1}MB\n\nSolutions:\n`;

        if (result.exitCode === 124) {
          errorMessage += `- Increase timeout parameter\n- Break into smaller operations\n- Use background processes\n`;
        } else if (
          result.stdout.includes("[Output truncated") ||
          result.stderr.includes("[Error output truncated")
        ) {
          errorMessage += `- Increase maxOutputSizeMB (current: ${args.maxOutputSizeMB || 1}MB)\n- Redirect output to file\n- Filter output\n`;
        } else {
          errorMessage += `- Check command syntax\n- Verify command exists in PATH\n- Check permissions\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: errorMessage,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: result.stdout,
          },
        ],
        isError: false,
      };
    } catch (error) {
      // Handle unexpected errors
      const errorDetails = {
        command: args.command,
        args: args.args || [],
        cwd: args.cwd || baseDirectory,
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
              }
            : String(error),
        executionInfo: {
          timeout: args.timeout || 60000,
          maxOutputSizeMB: args.maxOutputSizeMB || 1,
          baseDirectory: baseDirectory,
        },
      };

      return {
        content: [
          {
            type: "text",
            text: `Unexpected error:\n${JSON.stringify(errorDetails, null, 2)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  ShellTools.GET_ALLOWED_COMMANDS,
  "Get list of allowed shell commands. Shows available commands without executing them. Useful to check what commands can be run before using shell_execute. Note: 'cd' command is NOT supported - use 'cwd' parameter instead for directory navigation.",
  GetAllowedCommandsSchema.shape,
  async () => {
    try {
      const commands = shellExecutor.getAllowedCommands();
      return {
        content: [
          {
            type: "text",
            text: `Available commands: ${commands.join(", ")}\n\n` +
                  `Note: 'cd' command not supported - use 'cwd' parameter for directory navigation\n` +
                  `Each command runs independently without state persistence`,
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

// Start server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("info", `Shell MCP Server started (Base directory: ${baseDirectory})`);
    log("info", "Using user's shell environment with PATH and other variables");
  } catch (error) {
    log("error", `Server error: ${error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
