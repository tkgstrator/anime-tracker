#!/bin/zsh

sudo chown -R $(whoami):$(whoami) node_modules
sudo chown -R $(whoami):$(whoami) .cache
sudo npm install -g @openai/codex
bun install --frozen-lockfile --ignore-scripts
bunx --bun biome migrate --write
bunx playwright install --with-deps
