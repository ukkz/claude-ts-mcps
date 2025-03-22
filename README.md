# Claude TypeScript MCP Servers

A collection of Model Context Protocol (MCP) servers aimed at software developers who use LLMs for development assistance. While many developers prefer Cline for its direct VSCode integration, it uses a pay-per-use API that becomes costly with heavy usage. This project leverages the flat-rate Claude Pro subscription by connecting Claude Desktop application with custom MCP servers, providing comparable development assistance capabilities without the variable costs.

日本語による解説記事: [Cline任せでコード書いてたらAPIクレジットが爆散したのでClaude Desktop + MCPをいい感じにしてサブスクだけで無双する](https://zenn.dev/ukkz/articles/c8726063edd2cd)

## Overview

This project implements several MCP servers that can be used with Claude Desktop to enhance its capabilities for software development:

- **Brave Search**: Provides web search and local search functionality using the Brave Search API
- **Filesystem**: Enables file system operations with security restrictions
- **Git**: Provides Git functionality for managing repositories
- **Shell**: Allows execution of shell commands in a controlled environment
- **Puppeteer**: Enables browser automation and web interaction through Puppeteer
- **Fetch**: Retrieves content from URLs and converts HTML to Markdown for improved readability

## Requirements

- [Node.js](https://nodejs.org/) (v18+)
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
        },
        "puppeteer": {
            "command": "/Users/username/.bun/bin/bun",
            "args": [
                "run",
                "/Users/username/Documents/claude-ts-mcps/src/puppeteer.ts"
            ]
        },
        "fetch": {
            "command": "/Users/username/.bun/bin/bun",
            "args": [
                "run",
                "/Users/username/Documents/claude-ts-mcps/src/fetch.ts"
            ],
            "env": {
                "CUSTOM_USER_AGENT": "YOUR_CUSTOM_USER_AGENT", // Optional
                "IGNORE_ROBOTS_TXT": "false"                   // Optional, set to true to ignore robots.txt
            }
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
- `src/puppeteer.ts`: Browser automation and web interaction
- `src/fetch.ts`: URL content retrieval and HTML-to-Markdown conversion

To add new functionality:

1. Create a new TypeScript file in the `src` directory
2. Implement the MCP server using the `@modelcontextprotocol/sdk`
3. Add the new server to your Claude Desktop configuration

## Security Considerations

- The filesystem and shell servers include security measures to prevent unauthorized access
- Always validate user input before executing commands
- Be cautious when configuring allowed directories for filesystem access
- Use the command allowlist for the shell server to restrict executable commands
- The fetch server respects robots.txt directives by default to prevent scraping restricted sites

## References

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP Server Quickstart](https://modelcontextprotocol.io/quickstart/server)
- [Anthropic Claude](https://www.anthropic.com/claude)

## License

[MIT License](LICENSE)
