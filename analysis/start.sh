#!/bin/bash
# Quick start script for Crate Analysis JupyterLab

set -e

echo "🚀 Starting Crate Analysis JupyterLab..."
echo ""

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "❌ Error: uv is not installed"
    echo "Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Sync dependencies if needed
if [ ! -d ".venv" ]; then
    echo "📦 Installing dependencies..."
    uv sync
    echo ""
fi

# Start JupyterLab
echo "🎯 Opening JupyterLab..."
echo "   Navigate to notebooks/ to get started"
echo ""
uv run jupyter lab
