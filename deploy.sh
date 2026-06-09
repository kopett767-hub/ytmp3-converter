#!/bin/bash
# ============================================================
#  YTMP3 Converter — Deploy Script
#  ============================================================
#  Cara pakai:
#    1. Set GITHUB_TOKEN env var atau export dulu
#    2. Set GITHUB_USER (username GitHub lo)
#    3. Set VERCEL_TOKEN (opsional, untuk non-interactive deploy)
#    4. Jalankan: bash deploy.sh
# ============================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_NAME="ytmp3-converter"
BRANCH="main"

echo "🚀 YTMP3 Converter — Deploy Script"
echo "===================================="
echo ""

# ---- Check prerequisites ----
if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "❌ GITHUB_TOKEN belum di-set."
    echo "   Export dulu: export GITHUB_TOKEN='ghp_xxxxx'"
    exit 1
fi

if [ -z "${GITHUB_USER:-}" ]; then
    echo "❌ GITHUB_USER belum di-set."
    echo "   Export dulu: export GITHUB_USER='username-lo'"
    exit 1
fi

echo "✅ Prerequisites OK"
echo "   User: $GITHUB_USER"
echo "   Repo: $REPO_NAME"
echo ""

# ---- Step 1: Create GitHub repo via API ----
echo "📦 Step 1: Membuat repo GitHub..."
HTTP_CODE=$(curl -s -o /tmp/gh_response.json -w "%{http_code}" \
    -X POST https://api.github.com/user/repos \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -d "{\"name\":\"$REPO_NAME\",\"description\":\"YouTube to MP3 Converter — Modern, responsive, and fast.\",\"private\":false,\"auto_init\":false}")

if [ "$HTTP_CODE" = "201" ]; then
    echo "   ✅ Repo berhasil dibuat!"
elif [ "$HTTP_CODE" = "422" ]; then
    echo "   ℹ️  Repo sudah ada, lanjut..."
else
    echo "   ❌ Gagal buat repo (HTTP $HTTP_CODE)"
    cat /tmp/gh_response.json
    exit 1
fi

# ---- Step 2: Push to GitHub ----
echo ""
echo "📤 Step 2: Push ke GitHub..."
cd "$PROJECT_DIR"

# Rename branch to main
git branch -m "$BRANCH" 2>/dev/null || true

# Set remote
git remote remove origin 2>/dev/null || true
git remote add origin "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"

# Push
git push -u origin "$BRANCH" --force
echo "   ✅ Push berhasil!"

# ---- Step 3: Deploy to Vercel ----
echo ""
echo "🌐 Step 3: Deploy ke Vercel..."

if [ -n "${VERCEL_TOKEN:-}" ]; then
    # Non-interactive deploy with token
    vercel deploy \
        --token="$VERCEL_TOKEN" \
        --prod \
        --yes \
        --name="$REPO_NAME" \
        --scope="${VERCEL_SCOPE:-}" \
        2>&1
else
    echo "   ⚠️  VERCEL_TOKEN tidak di-set."
    echo "   Jalankan manual: vercel --prod"
    echo "   Atau set VERCEL_TOKEN dan jalankan ulang script ini."
fi

echo ""
echo "🎉 Deploy selesai!"
echo "   GitHub: https://github.com/$GITHUB_USER/$REPO_NAME"
echo "   Vercel: cek dashboard Vercel lo"
