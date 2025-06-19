# Claude TypeScript MCP Servers (For Software Developers)

A comprehensive collection of Model Context Protocol (MCP) servers that
transform Claude Desktop into a powerful development assistant. This project
leverages your flat-rate Claude Pro/Max subscription to provide capabilities
similar to Cline, but without the per-token API costs.

日本語による解説記事:
[Cline任せでコード書いてたらAPIクレジットが爆散したのでClaude Desktop + MCPをいい感じにしてサブスクだけで無双する](https://zenn.dev/ukkz/articles/c8726063edd2cd)

## 🚀 Features

- **File System Operations** - Read, write, and manage files with security
  restrictions
- **Git Integration** - Full Git workflow support including commits, branches,
  and diffs
- **GitHub API** - Manage repositories, issues, PRs, and more with multi-account
  support
- **Web Search** - AI-powered search with Sonar and traditional keyword search
  with Brave
- **Browser Automation** - 30+ Puppeteer tools for web scraping and automation
- **Shell Commands** - Execute development commands in a controlled environment
- **URL Fetching** - Extract content from web pages with HTML-to-Markdown
  conversion

## 📋 Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- [Bun](https://bun.sh/) runtime
- [Claude Desktop](https://anthropic.com/claude) application
- API keys for external services (Brave Search, Perplexity/Sonar)

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-ts-mcps.git
cd claude-ts-mcps

# Install dependencies
bun install
```

## ⚙️ Configuration

Create a configuration file for Claude Desktop with all the MCP servers:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "/Users/username/.bun/bin/bun",
      "args": [
        "run",
        "/path/to/claude-ts-mcps/src/filesystem.ts",
        "/Users/username"
      ]
    },
    "git": {
      "command": "/Users/username/.bun/bin/bun",
      "args": ["run", "/path/to/claude-ts-mcps/src/git.ts"]
    },
    "github": {
      "command": "/Users/username/.bun/bin/bun",
      "args": ["run", "/path/to/claude-ts-mcps/src/github.ts"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_DEFAULT_TOKEN",
        "GITHUB_TOKEN_WORK": "YOUR_WORK_ACCOUNT_TOKEN",
        "GITHUB_TOKEN_PERSONAL": "YOUR_PERSONAL_ACCOUNT_TOKEN"
      }
    },
    "brave-search": {
      "command": "/Users/username/.bun/bin/bun",
      "args": ["run", "/path/to/claude-ts-mcps/src/brave-search.ts"],
      "env": {
        "BRAVE_API_KEY": "YOUR_BRAVE_API_KEY"
      }
    },
    "sonar": {
      "command": "/Users/username/.bun/bin/bun",
      "args": ["run", "/path/to/claude-ts-mcps/src/sonar.ts"],
      "env": {
        "PERPLEXITY_API_KEY": "YOUR_PERPLEXITY_API_KEY"
      }
    },
    "puppeteer": {
      "command": "/Users/username/.bun/bin/bun",
      "args": ["run", "/path/to/claude-ts-mcps/src/puppeteer/index.ts"]
    },
    "shell": {
      "command": "/Users/username/.bun/bin/bun",
      "args": ["run", "/path/to/claude-ts-mcps/src/shell.ts"]
    },
    "fetch": {
      "command": "/Users/username/.bun/bin/bun",
      "args": ["run", "/path/to/claude-ts-mcps/src/fetch.ts"],
      "env": {
        "CUSTOM_USER_AGENT": "YOUR_CUSTOM_USER_AGENT",
        "IGNORE_ROBOTS_TXT": "false"
      }
    }
  }
}
```

## 🔧 Available Tools

### File System Operations (`filesystem`)

- **Security**: Restricted to specified directories with symlink protection
- **Core Operations**:
  - Read/write files with encoding support (utf-8, base64, hex)
  - Partial file reading by byte range or line range
  - Move, copy, delete, append files
  - Create directories and manage file trees
- **Advanced Editing**:
  - Text replacement with diff preview
  - Line-based operations (replace, insert, delete specific lines)
  - Regular expression replacements with capture groups
- **Search Capabilities**:
  - Search files by name patterns
  - Search content within files (plain text or regex)
  - Exclude patterns support
- **Batch Operations**:
  - Execute multiple file operations efficiently
  - Parallel execution for read operations
  - Transactional mode with rollback support
- **Archive Management**:
  - Compress files (zip, tar, tar.gz)
  - Extract archives with overwrite control
- **File Monitoring**:
  - Check for file changes since specific time
  - Support for change, rename, and delete events
- **Use Cases**: Code editing, project management, file analysis, bulk
  operations

### Git Integration (`git`)

- **Full Git Workflow**: init, add, commit, branch, checkout, diff, log
- **Repository Management**: status tracking, history viewing
- **Use Cases**: Version control, code review, project history

### GitHub API (`github`)

- **Repository Management**: Create, search, manage repositories
- **Issues & PRs**: Create, update, merge pull requests and issues
- **Release Management**: Create, update, and manage releases
- **Multi-Account Support**: Switch between work/personal accounts
- **File Operations**: Direct file creation and updates via API

### Web Search Tools

#### AI-Powered Search (`sonar`)

- **Natural Language Understanding**: Ask complex questions in plain language
- **Synthesized Answers**: Get comprehensive responses with citations
- **Multiple Models**:
  - `sonar`: Fast general-purpose search
  - `sonar-pro`: Complex queries with 200k context
  - `sonar-reasoning`: Chain-of-thought reasoning
  - `sonar-deep-research`: Comprehensive research mode
- **Use Cases**: Research, fact-checking, learning about complex topics

#### Traditional Search (`brave-search`)

- **Web Search**: Keyword-based search returning multiple results
- **Local Search**: Find businesses and services
- **Use Cases**: Quick lookups, finding multiple sources, local information

### Browser Automation (`puppeteer`)

Our most comprehensive tool with 30+ functions organized into categories:

#### 🧭 Navigation & Basic Interaction

- Navigate to URLs, take screenshots
- Click elements, fill forms, select options
- Hover over elements, execute JavaScript

#### ⏳ Wait Operations

- Wait for elements, timeouts, navigation
- Wait for custom JavaScript conditions

#### ⌨️ Keyboard Operations

- Press keys and key combinations
- Type text with human-like delays

#### 📄 Page Management

- Set viewport size, go back/forward, reload
- Generate PDFs, emulate devices

#### 🍪 Cookies & Authentication

- Set/get cookies, HTTP authentication

#### ℹ️ Information Retrieval

- Get page title, URL, HTML content
- Extract text and detailed element information

#### 🖼️ Frame Operations (Advanced)

- List all frames, switch between frames
- Execute JavaScript in specific frames
- Search elements across all frames

#### 🔧 Miscellaneous

- Add script tags, clear input fields

### Shell Commands (`shell`)

- **Controlled Execution**: Allowlist-based command restrictions
- **Development Tools**: npm, yarn, bun, git, node, python, tsc
- **Security**: Prevents dangerous operations, directory restrictions
- **Features**: Auto-parsing of command strings, output size limits, timeout
  control
- **Streaming Mode**: Now enabled by default! Captures output from long-running
  processes
  - Automatically returns partial output after timeout (default: 10s) or buffer
    limit (100KB)
  - Normal commands complete as usual; only affects long-running processes
  - Processes are automatically terminated after streaming timeout (safe
    default)
  - Keep processes running with `killOnStreamingTimeout: false`
  - Perfect for: development servers, build watchers, interactive commands
  - Disable with `streaming: false` if needed
- **Use Cases**: Package management, build processes, script execution, server
  monitoring

### URL Content Fetching (`fetch`)

- **Content Extraction**: Convert HTML to clean Markdown
- **Customization**: Custom user agents, robots.txt handling
- **Use Cases**: Documentation reading, content analysis

## 💡 Usage Examples

### Development Workflow

```
You: "Create a new React component for user authentication"
Claude: *Uses filesystem to create component file, npm to install dependencies*

You: "Find examples of OAuth implementation on GitHub"
Claude: *Uses GitHub search and fetch to find and analyze implementations*

You: "Test the login form on our staging site"
Claude: *Uses Puppeteer to navigate, fill forms, and verify functionality*
```

### Research and Analysis

```
You: "What are the latest best practices for Next.js 14 App Router?"
Claude: *Uses Sonar for comprehensive research with citations*

You: "Compare our package.json with similar projects"
Claude: *Uses GitHub to find similar projects, filesystem to read local files*
```

### Automation

```
You: "Extract all product prices from this e-commerce site"
Claude: *Uses Puppeteer to navigate pages, extract data, and compile results*

You: "Monitor our GitHub issues and create a summary"
Claude: *Uses GitHub API to fetch issues, analyze patterns, generate report*
```

## 🔒 Security Considerations

- **File System**: Restricted to specified directories only
- **Shell**: Commands must be in the allowlist
- **Credentials**: Store API keys securely, use environment variables
- **GitHub**: Use minimal token permissions
- **Fetch**: Respects robots.txt by default

## 🏗️ Project Structure

```
claude-ts-mcps/
├── src/
│   ├── filesystem.ts      # File operations
│   ├── git.ts             # Git integration
│   ├── github.ts          # GitHub API (main entry)
│   ├── github/            # GitHub implementation
│   ├── brave-search.ts    # Brave search API
│   ├── sonar.ts           # Perplexity Sonar API
│   ├── sonar/             # Sonar types and utilities
│   ├── puppeteer/         # Browser automation
│   │   ├── index.ts       # Main entry point
│   │   ├── tools/         # Tool definitions
│   │   ├── handlers/      # Implementation
│   │   └── state.ts       # State management
│   ├── shell.ts           # Shell commands (entry)
│   ├── shell/             # Shell implementation
│   │   ├── index.ts       # Main logic
│   │   ├── executor.ts    # Command execution
│   │   ├── types.ts       # Type definitions
│   │   └── ...            # Other modules
│   └── fetch.ts           # URL fetching
└── package.json
```

## 🚧 Development

To add new functionality:

1. Create a new TypeScript file in `src/`
2. Implement the MCP server using `@modelcontextprotocol/sdk`
3. Add tool definitions with clear descriptions
4. Include proper error handling and validation
5. Update the configuration file

### Testing Your Changes

```bash
# Run a specific MCP server directly
bun run src/your-new-server.ts

# Test with Claude Desktop
# Update your config and restart Claude
```

### Type Checking

This project uses TypeScript for type safety. Several type checking commands are
available:

```bash
# Standard type check (all strict checks enabled)
bun run type-check

# Type check with file watching for development
bun run type-check:watch

# Type check without unused variable warnings (good for development)
bun run check:loose

# Strict type check (same as type-check)
bun run check:strict
```

#### Current Type Issues

The project is functional but has some type issues that are being addressed:

- Some Puppeteer APIs need proper type imports
- A few cases of potential undefined values need guards
- Unused variables in some files (can be ignored during development)

These don't affect runtime functionality but will be cleaned up over time.

### Code Formatting

This project uses Prettier for consistent code formatting. The following
commands are available:

```bash
# Format all files
bun run format

# Check formatting without making changes
bun run format:check

# Format only source files (src directory)
bun run format:src

# Check formatting of source files only
bun run format:check:src

# Run both formatting check and type check
bun run lint

# Fix formatting and run type check
bun run lint:fix
```

#### Prettier Configuration

The project uses the following Prettier settings (`.prettierrc`):

- **Print Width**: 100 characters (80 for JSON/Markdown)
- **Tab Width**: 2 spaces
- **Semicolons**: Always
- **Quotes**: Double quotes
- **Trailing Commas**: All (ES5+)
- **Arrow Parens**: Always include parentheses

#### Formatting on Save

For the best development experience, configure your editor to format on save:

**VS Code**: Add to `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

**Other Editors**: Check your editor's documentation for Prettier integration.

## 📚 Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [MCP SDK Reference](https://modelcontextprotocol.io/sdks)
- [Anthropic Claude](https://www.anthropic.com/claude)
- [Brave Search API](https://api.search.brave.com/app/documentation)
- [Perplexity API](https://docs.perplexity.ai/)

## 📄 License

[MIT License](LICENSE)
