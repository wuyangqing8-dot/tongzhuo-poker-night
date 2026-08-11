# 同桌 Poker Night — Cloudflare 一键部署（路径 B）
# 用法（Windows PowerShell）：  .\deploy.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==> [1/4] 检查 Cloudflare 登录态"
try { npx wrangler whoami | Out-Null }
catch {
  Write-Host "    未登录，请在浏览器完成授权..."
  npx wrangler login
}

Write-Host "==> [2/4] 创建/获取 D1 数据库 tongzhuo-poker-db"
$OUT = npx wrangler d1 create tongzhuo-poker-db 2>&1 | Out-String
if ($OUT -notmatch "database_id") {
  $OUT = npx wrangler d1 info tongzhuo-poker-db 2>&1 | Out-String   # 已存在则取 info
}
Write-Host $OUT
$ID = [regex]::Match($OUT, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}').Value
if (-not $ID) {
  Write-Error "未能解析 database_id，请查看上方 wrangler 输出，手动把 id 填进 wrangler.jsonc 第 19 行"
  exit 1
}

Write-Host "==> [3/4] 回填 wrangler.jsonc 的 database_id"
$cfg = Get-Content wrangler.jsonc -Raw
if ($cfg -match "REPLACE_WITH_YOUR_D1_DATABASE_ID") {
  $cfg = $cfg -replace "REPLACE_WITH_YOUR_D1_DATABASE_ID", $ID
  Set-Content wrangler.jsonc $cfg -NoNewline
  Write-Host "    已写入: $ID"
} else {
  Write-Host "    wrangler.jsonc 已是真实 id，跳过"
}

Write-Host "==> [4/4] 构建并部署到 Cloudflare"
npm run deploy:cf

Write-Host "==> 完成！上方 *.workers.dev 即公网地址，发给朋友即可邮箱注册/登录同桌对局"
