# Claude TypeScript MCP Servers

A collection of Model Context Protocol (MCP) servers aimed at software developers who use LLMs for development assistance. While many developers prefer Cline for its direct VSCode integration, it uses a pay-per-use API that becomes costly with heavy usage. This project leverages the flat-rate Claude Pro subscription by connecting Claude Desktop application with custom MCP servers, providing comparable development assistance capabilities without the variable costs.

日本語による解説記事: [Cline任せでコード書いてたらAPIクレジットが爆散したのでClaude Desktop + MCPをいい感じにしてサブスクだけで無双する](https://zenn.dev/ukkz/articles/c8726063edd2cd)

## Overview

This project implements several MCP servers that can be used with Claude Desktop to enhance its capabilities for software development:

- **Brave Search**: Provides web search and local search functionality using the Brave Search API
- **Filesystem**: Enables file system operations with security restrictions
- **Git**: Provides Git functionality for managing repositories
- **Shell**: Allows execution of shell commands in a controlled environment

## Requirements

- [Node.js](https://nodejs.org/) (v16+)
- [Bun](https://bun.sh/) as the JavaScript/TypeScript runtime
- [Claude Desktop](https://anthropic.com/claude) application

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/claude-ts-mcps.git
   cd claude-ts-mcps
   ```

2. Install dependencies:
   ```
   bun install
   ```

## MCP Servers

### Brave Search MCP Server

Provides search functionality using the Brave Search API:

- **Web Search**: Retrieve information from the web
- **Local Search**: Find information about local businesses, services, and attractions

#### Requirements:
- Brave API Key (set as environment variable `BRAVE_API_KEY`)

### Filesystem MCP Server

Provides secure file system operations:

- Read files and directories
- Write and edit files
- Create directories
- Move/rename files
- Search for files
- Get file information

#### Features:
- Path validation to prevent unauthorized access
- Security checks for symlinks
- Support for editing files with line-based changes

### Git MCP Server

Provides Git operations:

- View repository status
- Show differences (unstaged, staged, between branches)
- Commit changes
- Add files to staging
- Reset staged changes
- View commit logs
- Create and checkout branches
- Initialize repositories

### Shell MCP Server

Enables execution of shell commands:

- Run development commands (npm, yarn, git, etc.)
- Support for common file system operations
- Controlled environment with security restrictions
- Configurable timeout and working directory

#### Features:
- Command allowlist to restrict executable commands
- Loads user's shell environment variables
- Path validation for working directories

## Configuration

To use these MCP servers with Claude Desktop, you need to create a configuration file that tells Claude how to connect to them. Here's an example configuration:

```json
{
    "mcpServers": {
        "brave-search": {
            "command": "/Users/username/.bun/bin/bun",
            "args": [
                "run",
                "/Users/username/Documents/claude-ts-mcps/src/brave-search.ts"
            ],
            "env": {
                "BRAVE_API_KEY": "YOUR_BRAVE_API_KEY"
            }
        },
        "filesystem": {
            "command": "/Users/username/.bun/bin/bun",
            "args": [
                "run",
                "/Users/username/Documents/claude-ts-mcps/src/filesystem.ts",
                "/Users/username"
            ]
        },
        "git": {
            "command": "/Users/username/.bun/bin/bun",
            "args": [
                "run",
                "/Users/username/Documents/claude-ts-mcps/src/git.ts"
            ]
        },
        "shell": {
            "command": "/Users/username/.bun/bin/bun",
            "args": [
                "run",
                "/Users/username/Documents/claude-ts-mcps/src/shell.ts"
            ]
        }
    }
}
```

Save this configuration as `claude_desktop_config.json` and configure Claude Desktop to use it.

## Usage

1. Start Claude Desktop
2. Load the configuration file
3. Claude will now have access to the additional tools provided by these MCP servers

## Development

Each MCP server is implemented as a standalone TypeScript file in the `src` directory:

- `src/brave-search.ts`: Brave Search API integration
- `src/filesystem.ts`: File system operations
- `src/git.ts`: Git operations
- `src/shell.ts`: Shell command execution

To add new functionality:

1. Create a new TypeScript file in the `src` directory
2. Implement the MCP server using the `@modelcontextprotocol/sdk`
3. Add the new server to your Claude Desktop configuration

## Security Considerations

- The filesystem and shell servers include security measures to prevent unauthorized access
- Always validate user input before executing commands
- Be cautious when configuring allowed directories for filesystem access
- Use the command allowlist for the shell server to restrict executable commands

## References

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP Server Quickstart](https://modelcontextprotocol.io/quickstart/server)
- [Anthropic Claude](https://www.anthropic.com/claude)

## License

[MIT License](LICENSE)
