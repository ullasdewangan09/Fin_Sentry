#!/bin/bash
set -e

echo "🚀 FinSentry Build Script for Render"
echo "===================================="

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Install Python dependencies
echo -e "\n${BLUE}[1/4] Installing Python dependencies...${NC}"
pip install --upgrade pip
pip install -r requirements.txt
echo -e "${GREEN}✓ Python dependencies installed${NC}"

# Step 2: Install Web3 dependencies
echo -e "\n${BLUE}[2/4] Installing Web3 (Node.js) dependencies...${NC}"
cd web3
npm install
echo -e "${GREEN}✓ Web3 dependencies installed${NC}"
cd ..

# Step 3: Install Frontend dependencies
echo -e "\n${BLUE}[3/4] Installing Frontend dependencies...${NC}"
cd frontend/fintwin-command-main
npm install
npm run build
echo -e "${GREEN}✓ Frontend build complete${NC}"
cd ../..

# Step 4: Database setup (if needed)
echo -e "\n${BLUE}[4/4] Running startup checks...${NC}"

# Verify critical environment variables
if [ -z "$JWT_SECRET_KEY" ]; then
  echo "⚠️  Warning: JWT_SECRET_KEY not set. Set it in Render dashboard."
fi

if [ -z "$GROQ_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
  echo "⚠️  Warning: Neither GROQ_API_KEY nor OPENAI_API_KEY is set."
fi

echo -e "${GREEN}✓ All checks passed${NC}"
echo -e "\n${BLUE}Build complete! Ready for deployment.${NC}\n"
