#!/usr/bin/env bash
# Deploys the current working tree to the OCI VPS and restarts the stack.
# The server keeps its own .env (never overwritten by this script).
set -euo pipefail

HOST="${DEPLOY_HOST:-ubuntu@137.131.136.57}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/id_rsa}"
DIR="${DEPLOY_DIR:-clever-agents}"

echo "→ enviando código para $HOST:~/$DIR"
tar czf - \
  --exclude='node_modules' --exclude='.next' --exclude='.git' \
  --exclude='.env' --exclude='*.log' --exclude='.DS_Store' . \
  | ssh -i "$KEY" -o StrictHostKeyChecking=no "$HOST" \
      "mkdir -p ~/$DIR && tar xzf - -C ~/$DIR"

echo "→ build + restart"
ssh -i "$KEY" -o StrictHostKeyChecking=no "$HOST" \
  "cd ~/$DIR && docker compose build && docker compose up -d && docker compose ps"

echo "→ pronto: https://clever-agents.alxit.com.br"
