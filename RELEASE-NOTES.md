# Filesystem MCP Server - Release Notes

## Version 0.5.0 - Phase 3 Complete

### New Features

#### Batch Operations
- Added `batch_operations` tool for executing multiple file operations efficiently
- Support for parallel execution of read operations
- Transactional mode with automatic rollback on errors
- Individual error handling with `continueOnError` option

#### File Monitoring
- Added `watch_file` tool for detecting file changes
- Support for change, rename, and delete events
- Recursive directory monitoring
- Time-based change detection (since specific timestamp)

#### Archive Management
- Added `compress_files` tool supporting zip, tar, and tar.gz formats
- Added `extract_archive` tool with overwrite control
- Fallback to Node.js zlib for single-file gzip when system tools unavailable

### Improvements
- All tools now include proper MCP annotations for better integration
- Enhanced error messages and handling across all operations

## Version 0.4.0 - Phase 2 Complete

### Enhanced Features

#### Advanced File Editing
- **Line-based operations**: Replace, insert, or delete specific lines by number
- **Regular expression support**: Pattern matching with capture groups and flags
- **Improved diff output**: Better formatting for change preview

#### Partial File Reading
- **Byte range support**: Read specific byte ranges from files
- **Line range support**: Read specific line ranges (e.g., lines 10-20)
- **Multiple encodings**: Support for utf-8, base64, and hex encodings

### Improvements
- Better validation for edge cases in edit operations
- More detailed error messages for debugging

## Version 0.3.0 - Phase 1 Complete

### New Tools

#### File Operations
- `delete_file`: Safely delete files with validation
- `copy_file`: Copy files with optional overwrite
- `append_file`: Append content with newline control

#### Content Search
- `search_content`: Search within file contents
- Support for plain text and regex patterns
- File pattern filtering
- Case sensitivity control
- Result limiting for performance

### Improvements
- Enhanced security validation for all new operations
- Consistent error handling across all tools

## Version 0.2.0

### Core Features
- Basic file operations (read, write, edit)
- Directory management
- File search by name
- Security restrictions to allowed directories

## Version 0.1.0

### Initial Release
- Basic MCP server implementation
- Fundamental file system operations