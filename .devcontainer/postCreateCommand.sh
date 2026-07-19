#!/bin/zsh

sudo chown -R $(whoami):$(whoami) node_modules
sudo chown -R $(whoami):$(whoami) .cache
bun install --frozen-lockfile --ignore-scripts
bunx --bun biome migrate --write
bunx playwright install --with-deps
