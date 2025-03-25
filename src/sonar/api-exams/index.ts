import * as fs from 'fs'
import * as path from 'path'
import type { PerplexityRequest, PerplexityResponse } from '../types'

// メイン
async function main(): Promise<void> {
  // 開始時間を記録
  const startTime = Date.now()

  // APIキーの設定（環境変数から取得するか、ここで直接設定）
  const apiKey = 'ここにAPIキーをはりつける'

  // 質問内容
  const question = 'DeepSeekはなぜ革新的と言われているのですか？'

  // APIリクエスト用のデータ構築
  const requestData: PerplexityRequest = {
    model: 'sonar', // ←ここのモデル名を切り替えて順番に検証する
    messages: [
      {
        role: 'system',
        content: 'なるべく簡潔で正確な回答を心がけてください。'
      },
      {
        role: 'user',
        content: question
      }
    ],
    max_tokens: 5000,
    temperature: 0.1,
    stream: false,
    web_search_options: { search_context_size: 'medium' }
  }

  try {
    // 質問内容をまず出力
    console.log(`質問内容: ${question}`)

    // APIたたく
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestData)
    })

    // リクエスト終了時間を記録
    const endTime = Date.now()
    const durationSeconds = (endTime - startTime) / 1000

    if (!response.ok) {
      console.error(`APIエラー: ${response.status} ${response.statusText}`)
      console.error(`レスポンス: ${await response.text()}`)
      return
    }

    // レスポンスを解析
    const data = await response.json() as PerplexityResponse

    // レスポンスの内容を取得
    const answer = data.choices[0].message.content

    // デバッグ情報を出力
    console.log(`レスポンス: ${durationSeconds.toFixed(2)}秒`)
    console.log(`回答文字数: ${answer.length}`)
    console.log(`引用数: ${data.citations && data.citations.length > 0 ? data.citations.length : 0}`)
    console.log(`入力トークン: ${data.usage.prompt_tokens}`)
    console.log(`出力トークン: ${data.usage.completion_tokens}`)
    console.log(`合計トークン: ${data.usage.total_tokens}`)
    console.log(`引用トークン: ${data.usage.citation_tokens ?? '-'}`)
    console.log(`推論トークン: ${data.usage.reasoning_tokens ?? '-'}`)
    
    // JSONファイルとして保存
    const outputPath = path.join(__dirname, 'response.json')
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2))
    console.log(`レスポンスを保存しました: ${outputPath}`)

  } catch (error) {
    console.error('エラーが発生しました:', error)
  }
}

// スクリプト実行
main().catch(console.error)