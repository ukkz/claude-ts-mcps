#!/usr/bin/env bun
/**
 * shell.tsの新機能のテストスクリプト
 * コマンド文字列の自動分割機能をテストします
 */

import { spawn } from "child_process";

const testCases = [
  // 従来の使い方（コマンドと引数を分離）
  {
    name: "従来の使い方: git status",
    params: {
      command: "git",
      args: ["status"],
    },
  },
  // 新しい使い方（完全なコマンド文字列）
  {
    name: "新しい使い方: git status",
    params: {
      command: "git status",
    },
  },
  // クォートを含むコマンド
  {
    name: "シングルクォート付き: echo 'hello world'",
    params: {
      command: "echo 'hello world'",
    },
  },
  // ダブルクォートを含むコマンド
  {
    name: 'ダブルクォート付き: echo "test message"',
    params: {
      command: 'echo "test message"',
    },
  },
  // 複雑な引数を持つコマンド
  {
    name: "複雑な引数: git commit -m 'Initial commit'",
    params: {
      command: "git commit -m 'Initial commit'",
    },
  },
  // cwdパラメータと組み合わせ
  {
    name: "ディレクトリ指定付き: ls -la",
    params: {
      command: "ls -la",
      cwd: "./src",
    },
  },
];

// MCPサーバーを起動してテストを実行
async function runTest() {
  console.log("🚀 shell.ts新機能テストを開始します...\n");

  const server = spawn("bun", ["./src/shell.ts"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  let isReady = false;

  server.stderr.on("data", (data) => {
    const message = data.toString();
    if (message.includes("Shell MCP Server started")) {
      isReady = true;
    }
  });

  // サーバーの起動を待つ
  while (!isReady) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log("✅ MCPサーバーが起動しました\n");

  // 各テストケースを実行
  for (const testCase of testCases) {
    console.log(`📝 テスト: ${testCase.name}`);
    console.log(`   パラメータ:`, JSON.stringify(testCase.params, null, 2));

    const request = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "shell_execute",
        arguments: testCase.params,
      },
    };

    // リクエストを送信
    server.stdin.write(JSON.stringify(request) + "\n");

    // レスポンスを待つ
    const response = await new Promise<any>((resolve) => {
      const handler = (data: Buffer) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.id === request.id) {
                server.stdout.off("data", handler);
                resolve(parsed);
              }
            } catch (e) {
              // JSONでない行は無視
            }
          }
        }
      };
      server.stdout.on("data", handler);
    });

    if (response.result) {
      console.log(`   ✅ 成功`);
      if (response.result.content?.[0]?.text) {
        const output = response.result.content[0].text;
        console.log(`   出力: ${output.split("\n")[0]}...`);
      }
    } else if (response.error) {
      console.log(`   ❌ エラー: ${response.error.message}`);
    }
    console.log();
  }

  // サーバーを終了
  server.kill();
  console.log("🏁 テスト完了");
}

runTest().catch(console.error);
