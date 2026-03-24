#!/bin/zsh

git config --global --unset commit.template
git config --global --add safe.directory /home/vscode/app
git config --global fetch.prune true
git config --global --add --bool push.autoSetupRemote true
git config --global commit.gpgSign false
git branch --merged|egrep -v '\*|develop|main|master'|xargs git branch -d

# .env があればシェル起動時に読み込む（remoteEnv より優先される）
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
