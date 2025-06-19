# Git MCP Server API Documentation

Version: 1.0.0

## Overview

The Git MCP Server provides comprehensive Git repository operations through the Model Context Protocol. It enables various Git operations including repository management, commits, branches, and now tag management.

## Configuration

```json
{
  "git": {
    "command": "/path/to/bun",
    "args": ["run", "/path/to/git.ts"]
  }
}
```

Optionally, you can specify a default repository path:

```json
{
  "git": {
    "command": "/path/to/bun",
    "args": ["run", "/path/to/git.ts", "-r", "/path/to/repository"]
  }
}
```

## Available Tools

### git_init

Initialize a new Git repository.

**Parameters:**
- `repo_path` (string, required): Path where the repository should be initialized

**Example:**
```javascript
{
  "repo_path": "/path/to/new/repository"
}
```

### git_status

Shows the working tree status.

**Parameters:**
- `repo_path` (string, required): Repository path

**Example:**
```javascript
{
  "repo_path": "/path/to/repository"
}
```

### git_add

Adds file contents to the staging area.

**Parameters:**
- `repo_path` (string, required): Repository path
- `files` (array of strings, required): Files to stage

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "files": ["file1.txt", "src/file2.js"]
}
```

### git_commit

Records changes to the repository.

**Parameters:**
- `repo_path` (string, required): Repository path
- `message` (string, required): Commit message

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "message": "Add new feature implementation"
}
```

### git_diff_unstaged

Shows changes in the working directory that are not yet staged.

**Parameters:**
- `repo_path` (string, required): Repository path

**Example:**
```javascript
{
  "repo_path": "/path/to/repository"
}
```

### git_diff_staged

Shows changes that are staged for commit.

**Parameters:**
- `repo_path` (string, required): Repository path

**Example:**
```javascript
{
  "repo_path": "/path/to/repository"
}
```

### git_diff

Shows differences between branches or commits.

**Parameters:**
- `repo_path` (string, required): Repository path
- `target` (string, required): Target branch or commit to compare with

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "target": "main"
}
```

### git_reset

Unstages all staged changes.

**Parameters:**
- `repo_path` (string, required): Repository path

**Example:**
```javascript
{
  "repo_path": "/path/to/repository"
}
```

### git_log

Shows the commit logs.

**Parameters:**
- `repo_path` (string, required): Repository path
- `max_count` (number, optional): Maximum number of commits to show (default: 10)

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "max_count": 20
}
```

### git_create_branch

Creates a new branch from an optional base branch.

**Parameters:**
- `repo_path` (string, required): Repository path
- `branch_name` (string, required): Name of the new branch
- `base_branch` (string, optional): Base branch (defaults to current branch)

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "branch_name": "feature/new-feature",
  "base_branch": "develop"
}
```

### git_checkout

Switches branches.

**Parameters:**
- `repo_path` (string, required): Repository path
- `branch_name` (string, required): Branch to switch to

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "branch_name": "develop"
}
```

### git_show

Shows the contents of a commit.

**Parameters:**
- `repo_path` (string, required): Repository path
- `revision` (string, required): Commit hash or reference

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "revision": "abc123"
}
```

## Tag Management Tools

### git_create_tag

Create a lightweight tag at the specified target (defaults to HEAD).

**Parameters:**
- `repo_path` (string, required): Repository path
- `tag_name` (string, required): Name of the tag
- `target` (string, optional): Commit reference to tag (defaults to HEAD)

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "tag_name": "v1.0.0",
  "target": "abc123"
}
```

### git_create_annotated_tag

Create an annotated tag with a message at the specified target (defaults to HEAD).

**Parameters:**
- `repo_path` (string, required): Repository path
- `tag_name` (string, required): Name of the tag
- `message` (string, required): Tag message
- `target` (string, optional): Commit reference to tag (defaults to HEAD)

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "tag_name": "v1.0.0",
  "message": "Release version 1.0.0 - Initial stable release",
  "target": "main"
}
```

### git_list_tags

List all tags, optionally filtered by pattern.

**Parameters:**
- `repo_path` (string, required): Repository path
- `pattern` (string, optional): Pattern to filter tags (supports wildcards)

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "pattern": "v1.*"
}
```

### git_delete_tag

Delete a tag.

**Parameters:**
- `repo_path` (string, required): Repository path
- `tag_name` (string, required): Name of the tag to delete

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "tag_name": "v0.1.0-beta"
}
```

### git_show_tag

Show tag details (including message for annotated tags).

**Parameters:**
- `repo_path` (string, required): Repository path
- `tag_name` (string, required): Name of the tag to show

**Example:**
```javascript
{
  "repo_path": "/path/to/repository",
  "tag_name": "v1.0.0"
}
```

## Error Handling

All tools return an error response if the operation fails:

```javascript
{
  "content": [{
    "type": "text",
    "text": "Error: <error message>"
  }],
  "isError": true
}
```

Common error scenarios:
- Invalid repository path
- Repository not initialized
- Branch/tag already exists
- Branch/tag not found
- No changes to commit
- Merge conflicts

## Security Considerations

- All user inputs are properly escaped to prevent command injection
- The server validates repository paths before executing operations
- File paths in `git add` are quoted to handle special characters

## Usage Tips

1. **Working with Tags:**
   - Use lightweight tags for simple markers
   - Use annotated tags for releases with detailed information
   - Follow semantic versioning (e.g., v1.0.0) for release tags

2. **Branch Management:**
   - Create feature branches from develop/main
   - Use descriptive branch names (e.g., feature/user-authentication)

3. **Commit Messages:**
   - Write clear, concise commit messages
   - Use conventional commit format when applicable

4. **Repository Status:**
   - Check status before committing
   - Review diffs before staging changes
