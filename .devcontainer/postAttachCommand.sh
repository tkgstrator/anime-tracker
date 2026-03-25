#!/bin/zsh

git config --global --unset commit.template
git config --global --add safe.directory /home/vscode/app
git config --global fetch.prune true
git config --global --add --bool push.autoSetupRemote true
git config --global commit.gpgSign false
git branch --merged|egrep -v '\*|develop|main|master'|xargs git branch -d

# .env があればシェル起動時に読み込む（remoteEnv より優先される）
# Claude Code MCP servers
if command -v claude >/dev/null 2>&1; then
  claude mcp add docker -s project -- bunx --bun mcp-server-docker
  claude mcp add github -s project -- sh -c 'GITHUB_PERSONAL_ACCESS_TOKEN=$(gh auth token) exec bunx --bun @modelcontextprotocol/server-github'
  claude mcp add tailwindcss -s project -- bunx --bun tailwindcss-mcp-server
  claude mcp add shadcn -s project -- npx shadcn@latest mcp
  claude mcp add prisma -s project -- bunx --bun prisma mcp
  claude mcp add zod -s project --transport sse https://mcp.inkeep.com/zod/mcp
fi

grep -q 'load .env' ~/.zshrc 2>/dev/null || \
  cat >> ~/.zshrc << 'DOTENV'

# load .env (override remoteEnv)
if [ -f /home/vscode/app/.env ]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    export "$key"="$value"
  done < /home/vscode/app/.env
fi
DOTENV
