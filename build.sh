#!/bin/bash
# Build script for maskweaver monorepo
# Builds all packages in dependency order

set -e  # Exit on error

echo "🔨 Building Maskweaver packages..."

# Build order based on dependencies
PACKAGES=(
  "shared"
  "core"
  "i18n"
  "memory"
  "context"
  "retrospect"
  "verify"
  "plugin"
)

for pkg in "${PACKAGES[@]}"; do
  echo ""
  echo "📦 Building @maskweaver/$pkg..."
  cd "packages/$pkg"
  
  if [ -f "package.json" ]; then
    BUILD_CMD=$(cat package.json | grep -o '"build": "[^"]*"' | sed 's/"build": "\(.*\)"/\1/')
    if [ -n "$BUILD_CMD" ]; then
      eval "$BUILD_CMD"
      echo "✅ $pkg built successfully"
    else
      echo "⚠️  No build script found for $pkg"
    fi
  fi
  
  cd ../..
done

echo ""
echo "✨ All packages built successfully!"
