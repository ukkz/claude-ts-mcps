# Filesystem MCP Server - Usage Examples

## Basic File Operations

### Reading Files

```javascript
// Simple file read
await mcp.call("read_file", {
  path: "config.json"
});

// Read with specific encoding
await mcp.call("read_file", {
  path: "image.png",
  encoding: "base64"
});

// Read specific lines from a large log file
await mcp.call("read_file", {
  path: "application.log",
  range: {
    lines: { from: 100, to: 150 }
  }
});

// Read multiple files at once
await mcp.call("read_multiple_files", {
  paths: ["package.json", "tsconfig.json", ".env"]
});
```

### Writing and Editing Files

```javascript
// Create a new file
await mcp.call("write_file", {
  path: "hello.txt",
  content: "Hello, World!"
});

// Simple text replacement
await mcp.call("edit_file", {
  path: "config.js",
  edits: [{
    oldText: "localhost",
    newText: "production.server.com"
  }]
});

// Complex editing with multiple operations
await mcp.call("edit_file", {
  path: "app.js",
  edits: [
    // Add header comment
    {
      type: "line",
      lineNumber: 1,
      action: "insert",
      content: "// Copyright 2024 - Auto-generated"
    },
    // Replace all email domains
    {
      type: "regex",
      pattern: "(\\w+)@oldcompany\\.com",
      replacement: "$1@newcompany.com",
      flags: "gi"
    },
    // Delete debug line
    {
      type: "line",
      lineNumber: 42,
      action: "delete"
    }
  ],
  dryRun: true  // Preview changes first
});

// Append to a log file
await mcp.call("append_file", {
  path: "activity.log",
  content: `[${new Date().toISOString()}] User logged in`,
  ensureNewline: true
});
```

## Search Operations

### Finding Files

```javascript
// Search for test files
await mcp.call("search_files", {
  path: "src",
  pattern: "test",
  excludePatterns: ["node_modules", "dist"]
});

// Search for TypeScript files
await mcp.call("search_files", {
  path: ".",
  pattern: ".ts"
});
```

### Searching Content

```javascript
// Find all TODOs in JavaScript files
await mcp.call("search_content", {
  path: "src",
  pattern: "TODO|FIXME",
  filePattern: ".js",
  regex: true,
  caseSensitive: false
});

// Search for function definitions
await mcp.call("search_content", {
  path: "lib",
  pattern: "^function\\s+\\w+",
  regex: true,
  maxResults: 50
});
```

## File Management

### Directory Operations

```javascript
// Create nested directories
await mcp.call("create_directory", {
  path: "src/components/auth/providers"
});

// List directory contents
await mcp.call("list_directory", {
  path: "src"
});

// Get directory tree
await mcp.call("directory_tree", {
  path: "src/components"
});
```

### File Operations

```javascript
// Copy a file
await mcp.call("copy_file", {
  source: "template.html",
  destination: "index.html",
  overwrite: false
});

// Move/rename a file
await mcp.call("move_file", {
  source: "old-name.js",
  destination: "new-name.js"
});

// Delete a file
await mcp.call("delete_file", {
  path: "temp.txt"
});

// Get file information
await mcp.call("get_file_info", {
  path: "package.json"
});
```

## Advanced Features

### Batch Operations

```javascript
// Backup configuration files
await mcp.call("batch_operations", {
  operations: [
    {
      type: "read",
      params: { path: ".env" }
    },
    {
      type: "write",
      params: {
        path: "backup/.env.backup",
        content: "/* content from read */"
      }
    },
    {
      type: "read",
      params: { path: "config.json" }
    },
    {
      type: "write",
      params: {
        path: "backup/config.json.backup",
        content: "/* content from read */"
      }
    }
  ],
  transactional: true  // Rollback all if any fails
});

// Parallel reads for performance
await mcp.call("batch_operations", {
  operations: [
    { type: "read", params: { path: "data1.json" } },
    { type: "read", params: { path: "data2.json" } },
    { type: "read", params: { path: "data3.json" } }
  ],
  parallel: true  // Read all files simultaneously
});

// Clean up temporary files with error tolerance
await mcp.call("batch_operations", {
  operations: [
    {
      type: "delete",
      params: { path: "temp/cache1.tmp" },
      continueOnError: true
    },
    {
      type: "delete",
      params: { path: "temp/cache2.tmp" },
      continueOnError: true
    },
    {
      type: "delete",
      params: { path: "temp/cache3.tmp" },
      continueOnError: true
    }
  ]
});
```

### File Monitoring

```javascript
// Check for recent changes
await mcp.call("watch_file", {
  path: "src",
  events: ["change", "delete"],
  recursive: true,
  since: Date.now() - 60000  // Last minute
});

// Monitor specific file
await mcp.call("watch_file", {
  path: "config.json",
  events: ["change"]
});
```

### Archive Operations

```javascript
// Create a backup archive
await mcp.call("compress_files", {
  files: [
    "src/app.js",
    "src/styles.css",
    "package.json",
    "README.md"
  ],
  output: "backup.zip",
  format: "zip"
});

// Create a compressed tarball
await mcp.call("compress_files", {
  files: ["dist/"],
  output: "release.tar.gz",
  format: "tar.gz"
});

// Extract an archive
await mcp.call("extract_archive", {
  archive: "backup.zip",
  destination: "restore/",
  overwrite: true
});
```

## Real-World Scenarios

### 1. Project Template Setup

```javascript
// Create project structure
const dirs = [
  "src/components",
  "src/utils",
  "src/styles",
  "tests",
  "docs"
];

for (const dir of dirs) {
  await mcp.call("create_directory", { path: dir });
}

// Copy template files
await mcp.call("batch_operations", {
  operations: [
    {
      type: "copy",
      params: {
        source: "templates/tsconfig.json",
        destination: "tsconfig.json"
      }
    },
    {
      type: "copy",
      params: {
        source: "templates/.gitignore",
        destination: ".gitignore"
      }
    },
    {
      type: "write",
      params: {
        path: "README.md",
        content: "# New Project\\n\\nCreated on " + new Date().toISOString()
      }
    }
  ]
});
```

### 2. Code Refactoring

```javascript
// Update all import statements
await mcp.call("search_content", {
  path: "src",
  pattern: "from ['\"]@old-package",
  regex: true
});

// Then update each file
await mcp.call("edit_file", {
  path: "src/app.js",
  edits: [{
    type: "regex",
    pattern: "from ['\"]@old-package/(.+?)['\"]",
    replacement: "from '@new-package/$1'",
    flags: "g"
  }]
});
```

### 3. Log Analysis

```javascript
// Find errors in logs
const errors = await mcp.call("search_content", {
  path: "logs",
  pattern: "ERROR|FATAL|Exception",
  filePattern: ".log",
  maxResults: 200
});

// Extract specific time range
await mcp.call("read_file", {
  path: "logs/app-2024-01-15.log",
  range: {
    lines: { from: 1000, to: 2000 }
  }
});
```

### 4. Deployment Preparation

```javascript
// Clean and prepare for deployment
await mcp.call("batch_operations", {
  operations: [
    // Remove development files
    { type: "delete", params: { path: ".env.local" } },
    { type: "delete", params: { path: "debug.log" } },
    
    // Update configuration
    {
      type: "edit",
      params: {
        path: "config.json",
        edits: [{
          type: "regex",
          pattern: '"debug":\\s*true',
          replacement: '"debug": false'
        }]
      }
    },
    
    // Create deployment archive
    {
      type: "compress_files",
      params: {
        files: ["dist/", "package.json", "README.md"],
        output: "deploy.zip",
        format: "zip"
      }
    }
  ],
  transactional: true
});
```

## Error Handling

```javascript
try {
  await mcp.call("write_file", {
    path: "/unauthorized/path/file.txt",
    content: "This will fail"
  });
} catch (error) {
  // Error: Access denied - path outside allowed directories
}

// Check if file exists before operations
try {
  const info = await mcp.call("get_file_info", {
    path: "might-not-exist.txt"
  });
  // File exists, proceed with operations
} catch (error) {
  // File doesn't exist
}
```

## Security Best Practices

1. **Always validate paths**: The server enforces allowed directories, but validate on client side too
2. **Use dry run for edits**: Test complex edits with `dryRun: true` first
3. **Backup before batch operations**: Use transactional mode or create backups
4. **Be careful with patterns**: Test regex patterns on small datasets first
5. **Monitor allowed directories**: Use `list_allowed_directories` to verify access