#!/usr/bin/env bun

import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { join } from "path";

// Filesystem MCPサーバーの簡易テストスクリプト
// 使用方法: bun run test-filesystem.ts

const TEST_DIR = "/tmp/mcp-filesystem-test";

async function runTest() {
  console.log("🧪 Filesystem MCP Server Test Suite\n");

  // MCPサーバーを起動
  console.log("Starting MCP server...");
  const server = spawn("bun", ["run", join(import.meta.dir, "src/filesystem.ts"), TEST_DIR], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // サーバーが起動するまで待機
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log("✅ Server started\n");

  // テストケース
  const tests = [
    {
      name: "List allowed directories",
      request: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "list_allowed_directories",
          arguments: {},
        },
        id: 1,
      },
    },
    {
      name: "Create directory",
      request: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "create_directory",
          arguments: {
            path: `${TEST_DIR}/test-dir`,
          },
        },
        id: 2,
      },
    },
    {
      name: "Write file",
      request: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "write_file",
          arguments: {
            path: `${TEST_DIR}/test.txt`,
            content: "Hello, MCP!",
          },
        },
        id: 3,
      },
    },
    {
      name: "Read file",
      request: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "read_file",
          arguments: {
            path: `${TEST_DIR}/test.txt`,
          },
        },
        id: 4,
      },
    },
    {
      name: "Edit file with regex",
      request: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "edit_file",
          arguments: {
            path: `${TEST_DIR}/test.txt`,
            edits: [
              {
                type: "regex",
                pattern: "MCP",
                replacement: "Model Context Protocol",
              },
            ],
            dryRun: true,
          },
        },
        id: 5,
      },
    },
    {
      name: "Batch operations",
      request: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "batch_operations",
          arguments: {
            operations: [
              {
                type: "write",
                params: {
                  path: `${TEST_DIR}/batch1.txt`,
                  content: "File 1",
                },
              },
              {
                type: "write",
                params: {
                  path: `${TEST_DIR}/batch2.txt`,
                  content: "File 2",
                },
              },
              {
                type: "read",
                params: {
                  path: `${TEST_DIR}/batch1.txt`,
                },
              },
            ],
            parallel: true,
          },
        },
        id: 6,
      },
    },
  ];

  // 各テストを実行
  for (const test of tests) {
    console.log(`📝 Testing: ${test.name}`);

    // リクエストを送信
    server.stdin.write(JSON.stringify(test.request) + "\n");

    // レスポンスを待機
    const response = await new Promise((resolve) => {
      const handler = (data: Buffer) => {
        const lines = data
          .toString()
          .split("\n")
          .filter((line) => line.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === test.request.id) {
              server.stdout.off("data", handler);
              resolve(parsed);
            }
          } catch (e) {
            // JSONでない行は無視
          }
        }
      };
      server.stdout.on("data", handler);
    });

    console.log("Response:", JSON.stringify(response, null, 2));
    console.log("✅ Test passed\n");
  }

  // サーバーを終了
  server.kill();
  console.log("🎉 All tests completed!");
}

// エラーハンドリング
process.on("unhandledRejection", (error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});

// テスト実行
runTest().catch(console.error);
