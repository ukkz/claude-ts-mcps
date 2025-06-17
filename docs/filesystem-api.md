# Filesystem MCP Server API Documentation

Version: 0.5.0

## Overview

The Filesystem MCP Server provides comprehensive file system operations with security restrictions. All operations are limited to specified allowed directories to prevent unauthorized access.

## Configuration

```json
{
  "filesystem": {
    "command": "/path/to/bun",
    "args": [
      "run",
      "/path/to/filesystem.ts",
      "/allowed/directory1",
      "/allowed/directory2"
    ]
  }
}
```

Multiple directories can be specified as arguments. The server will only allow operations within these directories.

## Available Tools

### read_file

Read file contents with support for partial reading and different encodings.

**Parameters:**
- `path` (string, required): File path to read
- `encoding` (enum, optional): "utf-8" | "base64" | "hex" (default: "utf-8")
- `range` (object, optional): Partial read options
  - `start` (number, optional): Start byte position
  - `end` (number, optional): End byte position
  - `lines` (object, optional): Line range
    - `from` (number, required): Starting line number (1-based)
    - `to` (number, required): Ending line number (inclusive)

**Examples:**
```javascript
// Read entire file
{ "path": "example.txt" }

// Read with base64 encoding
{ "path": "image.png", "encoding": "base64" }

// Read lines 10-20
{ "path": "large.log", "range": { "lines": { "from": 10, "to": 20 } } }

// Read bytes 100-500
{ "path": "data.bin", "range": { "start": 100, "end": 500 } }
```

### read_multiple_files

Read multiple files simultaneously. More efficient than reading one by one.

**Parameters:**
- `paths` (array[string], required): Array of file paths to read

**Example:**
```javascript
{ "paths": ["file1.txt", "file2.txt", "file3.txt"] }
```

### write_file

Create or overwrite a file. Caution: overwrites without warning.

**Parameters:**
- `path` (string, required): File path to write
- `content` (string, required): Content to write

**Example:**
```javascript
{ "path": "output.txt", "content": "Hello, World!" }
```

### edit_file

Make edits to text files with support for multiple edit types.

**Parameters:**
- `path` (string, required): File path to edit
- `edits` (array[EditOperation], required): Array of edit operations
- `dryRun` (boolean, optional): Preview changes without applying (default: false)

**Edit Operation Types:**

1. **Text Replacement**
```javascript
{
  "type": "replace",  // optional, defaults to "replace"
  "oldText": "search for this",
  "newText": "replace with this"
}
```

2. **Line-based Operations**
```javascript
// Replace a line
{
  "type": "line",
  "lineNumber": 5,
  "action": "replace",
  "content": "new line content"
}

// Insert before a line
{
  "type": "line",
  "lineNumber": 10,
  "action": "insert",
  "content": "inserted line"
}

// Delete a line
{
  "type": "line",
  "lineNumber": 15,
  "action": "delete"
}
```

3. **Regular Expression Replacement**
```javascript
{
  "type": "regex",
  "pattern": "\\b(\\w+)@example\\.com\\b",
  "replacement": "$1@newdomain.com",
  "flags": "gi"  // optional, default: "g"
}
```

**Complete Example:**
```javascript
{
  "path": "config.js",
  "edits": [
    {
      "type": "regex",
      "pattern": "localhost:\\d+",
      "replacement": "production.server:443"
    },
    {
      "type": "line",
      "lineNumber": 1,
      "action": "insert",
      "content": "// Auto-generated configuration"
    }
  ],
  "dryRun": true
}
```

### create_directory

Create directory or ensure it exists. Creates nested directories.

**Parameters:**
- `path` (string, required): Directory path to create

**Example:**
```javascript
{ "path": "src/components/auth" }
```

### list_directory

List files and directories in a path.

**Parameters:**
- `path` (string, required): Directory path to list

**Returns:** List with [FILE] and [DIR] prefixes

### directory_tree

Get recursive tree view as JSON.

**Parameters:**
- `path` (string, required): Root directory path

**Returns:** JSON structure with name, type, and children for directories

### move_file

Move or rename files and directories.

**Parameters:**
- `source` (string, required): Source path
- `destination` (string, required): Destination path

**Example:**
```javascript
{ "source": "old-name.txt", "destination": "new-name.txt" }
```

### search_files

Recursively search files matching a pattern.

**Parameters:**
- `path` (string, required): Root directory to search
- `pattern` (string, required): Search pattern (case-insensitive)
- `excludePatterns` (array[string], optional): Patterns to exclude

**Example:**
```javascript
{
  "path": "src",
  "pattern": "test",
  "excludePatterns": ["node_modules", "*.log"]
}
```

### get_file_info

Get file/directory metadata.

**Parameters:**
- `path` (string, required): File or directory path

**Returns:** Size, timestamps, permissions, and type information

### list_allowed_directories

List directories this server can access.

**Parameters:** None

### delete_file

Delete a file. This operation cannot be undone.

**Parameters:**
- `path` (string, required): File path to delete

**Example:**
```javascript
{ "path": "temporary.txt" }
```

### copy_file

Copy a file to a new location.

**Parameters:**
- `source` (string, required): Source file path
- `destination` (string, required): Destination file path
- `overwrite` (boolean, optional): Allow overwriting existing file (default: false)

**Example:**
```javascript
{
  "source": "template.html",
  "destination": "index.html",
  "overwrite": true
}
```

### append_file

Append content to the end of a file.

**Parameters:**
- `path` (string, required): File path to append to
- `content` (string, required): Content to append
- `ensureNewline` (boolean, optional): Ensure content ends with newline (default: true)

**Example:**
```javascript
{
  "path": "log.txt",
  "content": "New log entry",
  "ensureNewline": true
}
```

### search_content

Search for content within files.

**Parameters:**
- `path` (string, required): Root directory to search
- `pattern` (string, required): Search pattern
- `filePattern` (string, optional): Filter by filename pattern
- `regex` (boolean, optional): Treat pattern as regex (default: false)
- `caseSensitive` (boolean, optional): Case-sensitive search (default: true)
- `maxResults` (number, optional): Maximum results to return (default: 100)

**Example:**
```javascript
{
  "path": "src",
  "pattern": "TODO|FIXME",
  "filePattern": ".js",
  "regex": true,
  "caseSensitive": false
}
```

### batch_operations

Execute multiple file operations efficiently.

**Parameters:**
- `operations` (array[BatchOperation], required): Operations to execute
- `parallel` (boolean, optional): Execute read operations in parallel (default: false)
- `transactional` (boolean, optional): Rollback all on error (default: false)

**Batch Operation Structure:**
```javascript
{
  "type": "read" | "write" | "copy" | "move" | "delete" | "append",
  "params": { /* operation-specific parameters */ },
  "continueOnError": false  // optional
}
```

**Example:**
```javascript
{
  "operations": [
    {
      "type": "read",
      "params": { "path": "config.json" }
    },
    {
      "type": "write",
      "params": { 
        "path": "backup/config.json",
        "content": "/* result from previous read */"
      }
    },
    {
      "type": "delete",
      "params": { "path": "temp/cache.txt" },
      "continueOnError": true
    }
  ],
  "transactional": true
}
```

### watch_file

Check for file changes since a specific time. Due to MCP constraints, this is a one-time check, not continuous monitoring.

**Parameters:**
- `path` (string, required): File or directory path to check
- `events` (array[enum], optional): Events to detect: "change" | "rename" | "delete" (default: ["change"])
- `recursive` (boolean, optional): Check subdirectories (default: false)
- `since` (number, optional): Timestamp in milliseconds (default: 1 second ago)

**Example:**
```javascript
{
  "path": "src",
  "events": ["change", "delete"],
  "recursive": true,
  "since": 1700000000000
}
```

### compress_files

Compress files into an archive.

**Parameters:**
- `files` (array[string], required): Files to compress
- `output` (string, required): Output archive path
- `format` (enum, optional): "zip" | "tar" | "tar.gz" (default: "zip")

**Example:**
```javascript
{
  "files": ["src/app.js", "src/styles.css", "package.json"],
  "output": "project-backup.zip",
  "format": "zip"
}
```

**Note:** Requires system tools (zip/tar) to be installed.

### extract_archive

Extract files from an archive.

**Parameters:**
- `archive` (string, required): Archive file path
- `destination` (string, required): Extraction destination directory
- `overwrite` (boolean, optional): Overwrite existing files (default: false)

**Example:**
```javascript
{
  "archive": "backup.tar.gz",
  "destination": "restore/",
  "overwrite": true
}
```

**Note:** Requires system tools (unzip/tar) to be installed.

## Tool Annotations

Each tool includes MCP annotations for better integration:

- `readOnlyHint`: Indicates if the tool modifies the environment
- `idempotentHint`: Same input produces same output
- `openWorldHint`: Requires external network access (always false)
- `costHint`: Computational cost (low/medium/high)

## Error Handling

All tools return errors in a consistent format:

```javascript
{
  "content": [
    {
      "type": "text",
      "text": "Error: Access denied - path outside allowed directories"
    }
  ],
  "isError": true
}
```

Common error types:
- Access denied (path outside allowed directories)
- File not found
- Permission denied
- Invalid arguments
- Operation-specific errors

## Security Notes

1. **Path Validation**: All paths are validated against allowed directories
2. **Symlink Protection**: Symlinks are resolved to ensure they don't escape allowed directories
3. **No Network Access**: This server has no network capabilities
4. **Careful with Batch Operations**: Transactional mode recommended for critical operations

## Version History

- **0.5.0**: Added batch operations, file monitoring, compression/extraction
- **0.4.0**: Enhanced edit_file with line/regex support, partial file reading
- **0.3.0**: Added delete_file, copy_file, append_file, search_content
- **0.2.0**: Core functionality with basic file operations
- **0.1.0**: Initial release