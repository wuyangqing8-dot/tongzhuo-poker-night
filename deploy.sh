#!/usr/bin/env bash
# 同桌 Poker Night — Cloudflare 一键部署（路径 B）
# 用法（Git Bash / WSL / Mac / Linux 终端）：  bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "==> [1/4] 检查 Cloudflare 登录态"
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "    未登录，请在浏览器完成授权..."
  npx wrangler login
fi

echo "==> [2/4] 创建/获取 D1 数据库 tongzhuo-poker-db"
OUT=$(npx wrangler d1 create tongzhuo-poker-db 2>&1) || true
if ! echo "$OUT" | grep -q "database_id"; then
  OUT=$(npx wrangler d1 info tongzhuo-poker-db 2>&1) || true   # 已存在则取 info
fi
echo "$OUT"
ID=$(echo "$OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
if [ -z "$ID" ]; then
  echo "!! 未能解析 database_id，请查看上方 wrangler 输出，手动把 id 填进 wrangler.jsonc 第 19 行"
  exit 1
fi

echo "==> [3/4] 回填 wrangler.jsonc 的 database_id"
if grep -q "REPLACE_WITH_YOUR_D1_DATABASE_ID" wrangler.jsonc; then
  sed -i "s/REPLACE_WITH_YOUR_D1_DATABASE_ID/$ID/" wrangler.jsonc
  echo "    已写入: $ID"
else
  echo "    wrangler.jsonc 已是真实 id，跳过"
fi

echo "==> [4/4] 构建并部署到 Cloudflare"
npm run deploy:cf

echo "==> 完成！上方 *.workers.dev 即公网地址，发给朋友即可邮箱注册/登录同桌对局"
