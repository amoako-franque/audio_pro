#!/bin/bash

echo "Audio Processing Framework Setup"
echo "===================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo " Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "Node.js found: $(node --version)"

# Check if Redis is running
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo "Redis is running"
    else
        echo "Redis is installed but not running. Please start Redis:"
        echo "   docker run -d -p 6379:6379 redis:7-alpine"
        echo "   OR"
        echo "   redis-server"
    fi
else
    echo " Redis CLI not found. Make sure Redis is installed or use Docker."
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
echo ""

echo "Installing root dependencies..."
npm install

echo "Installing server dependencies..."
cd server && npm install && cd ..

echo "Installing client dependencies..."
cd client && npm install && cd ..

# Set up environment
echo ""
echo "  Setting up environment..."
if [ ! -f server/.env ]; then
    cp server/.env.example server/.env
    echo " Created server/.env from .env.example"
else
    echo "  server/.env already exists, skipping..."
fi

# Set up database
echo ""
echo "  Setting up database..."
cd server
npm run prisma:generate
npm run prisma:migrate
cd ..

# Create uploads directory
mkdir -p server/uploads
echo " Created uploads directory"

echo ""
echo " Setup complete!"
echo ""
echo "To start the application:"
echo "  1. Terminal 1: npm run dev:server"
echo "  2. Terminal 2: npm run dev:worker"
echo "  3. Terminal 3: npm run dev:client"
echo ""
echo "Or use Docker:"
echo "  docker-compose up -d"
echo ""

