param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$DbPassword,

  [Parameter(Mandatory = $true)]
  [string]$SupabaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$AnonKey,

  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "Checking Supabase CLI..."
npx supabase --version | Out-Host

Write-Host "Linking project $ProjectRef..."
npx supabase link --project-ref $ProjectRef --password $DbPassword

Write-Host "Writing local frontend .env..."
@"
VITE_SUPABASE_PROJECT_ID="$ProjectRef"
VITE_SUPABASE_PUBLISHABLE_KEY="$AnonKey"
VITE_SUPABASE_URL="$SupabaseUrl"
"@ | Set-Content -Path ".env" -Encoding UTF8

Write-Host "Setting Edge Function secrets..."
npx supabase secrets set "DATABASE_URL=$DatabaseUrl" --project-ref $ProjectRef

Write-Host "Pushing database migrations..."
npx supabase db push --project-ref $ProjectRef --password $DbPassword --include-all

$jwtFunctions = @(
  "admin-auth",
  "admin-config",
  "admin-orders",
  "admin-panels",
  "admin-plans",
  "auto-fulfill",
  "auto-reset-traffic",
  "auto-test-panels",
  "create-client",
  "cron-status",
  "crypto-verify",
  "exchange-rates",
  "order-cleanup",
  "panel-test",
  "proxy-3xui"
)

Write-Host "Deploying JWT-protected Edge Functions..."
npx supabase functions deploy $jwtFunctions --project-ref $ProjectRef --use-api

$publicFunctions = @(
  "payment-callback",
  "traffic-stream"
)

Write-Host "Deploying public Edge Functions..."
npx supabase functions deploy $publicFunctions --project-ref $ProjectRef --use-api --no-verify-jwt

Write-Host "Building frontend..."
npm run build

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "1. Configure admin settings inside the new site's admin panel."
Write-Host "2. Update Hupi callback URL to: $SupabaseUrl/functions/v1/payment-callback"
Write-Host "3. Configure scheduled jobs for auto-test-panels and auto-reset-traffic."
