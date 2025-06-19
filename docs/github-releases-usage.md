# GitHub リリース機能の使用例

このドキュメントでは、追加されたGitHubリリース機能の使用方法について説明します。

## 利用可能な機能

### 1. リリースの作成 (`create_release`)

新しいリリースを作成します。

**パラメータ:**
- `owner`: リポジトリオーナー（必須）
- `repo`: リポジトリ名（必須）
- `tag_name`: リリースのタグ名（必須）
- `target_commitish`: タグを作成するブランチまたはコミットSHA（任意）
- `name`: リリース名（任意）
- `body`: リリースの説明（任意）
- `draft`: ドラフトリリースとして作成（任意、デフォルト: false）
- `prerelease`: プレリリースとして識別（任意、デフォルト: false）
- `generate_release_notes`: 自動的にリリースノートを生成（任意、デフォルト: false）
- `account_profile`: 使用するGitHubアカウントプロファイル（任意）

**使用例:**
```json
{
  "owner": "myorganization",
  "repo": "myrepo",
  "tag_name": "v1.0.0",
  "name": "Version 1.0.0",
  "body": "## What's Changed\n- Feature A added\n- Bug B fixed",
  "draft": false,
  "prerelease": false
}
```

### 2. リリースの取得 (`get_release`)

特定のリリースを取得します。

**パラメータ:**
- `owner`: リポジトリオーナー（必須）
- `repo`: リポジトリ名（必須）
- `release_id`: リリースID（必須）
- `account_profile`: 使用するGitHubアカウントプロファイル（任意）

### 3. 最新リリースの取得 (`get_latest_release`)

リポジトリの最新リリースを取得します。

**パラメータ:**
- `owner`: リポジトリオーナー（必須）
- `repo`: リポジトリ名（必須）
- `account_profile`: 使用するGitHubアカウントプロファイル（任意）

### 4. リリース一覧の取得 (`list_releases`)

リポジトリのリリース一覧を取得します。

**パラメータ:**
- `owner`: リポジトリオーナー（必須）
- `repo`: リポジトリ名（必須）
- `per_page`: 1ページあたりの結果数（任意、デフォルト: 30）
- `page`: ページ番号（任意、デフォルト: 1）
- `account_profile`: 使用するGitHubアカウントプロファイル（任意）

### 5. リリースの更新 (`update_release`)

既存のリリースを更新します。

**パラメータ:**
- `owner`: リポジトリオーナー（必須）
- `repo`: リポジトリ名（必須）
- `release_id`: リリースID（必須）
- `tag_name`: リリースのタグ名（任意）
- `target_commitish`: タグを作成するブランチまたはコミットSHA（任意）
- `name`: リリース名（任意）
- `body`: リリースの説明（任意）
- `draft`: ドラフトリリースとして設定（任意）
- `prerelease`: プレリリースとして識別（任意）
- `account_profile`: 使用するGitHubアカウントプロファイル（任意）

### 6. リリースの削除 (`delete_release`)

リリースを削除します。

**パラメータ:**
- `owner`: リポジトリオーナー（必須）
- `repo`: リポジトリ名（必須）
- `release_id`: リリースID（必須）
- `account_profile`: 使用するGitHubアカウントプロファイル（任意）

## 環境変数の設定

デフォルトのアカウントを使用する場合:
```bash
export GITHUB_PERSONAL_ACCESS_TOKEN="your-github-token"
```

複数のアカウントプロファイルを使用する場合:
```bash
export GITHUB_TOKEN_WORK="your-work-github-token"
export GITHUB_TOKEN_PERSONAL="your-personal-github-token"
```

## 使用時の注意事項

1. リリースを作成する際、指定されたタグが既に存在する場合はそのタグを使用し、存在しない場合は新しく作成されます。
2. `generate_release_notes`を`true`に設定すると、GitHubが自動的に前回のリリースからの変更を含むリリースノートを生成します。
3. ドラフトリリースは公開されず、リポジトリの管理者のみが見ることができます。
4. リリースを削除しても、関連するGitタグは削除されません。タグも削除したい場合は、別途削除する必要があります。
