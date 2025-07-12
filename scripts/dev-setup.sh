#!/bin/bash

# ThinkPod Development Setup Script

set -e

echo "🚀 Setting up ThinkPod development environment..."

# Check if required commands exist
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required but not installed. Aborting." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is required but not installed. Aborting." >&2; exit 1; }

echo "✅ Required dependencies found"

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p packages/api/logs

# Copy environment file if it doesn't exist
if [ ! -f packages/api/.env ]; then
    echo "📄 Creating environment file..."
    cp packages/api/.env.example packages/api/.env
    echo "⚠️  Please update packages/api/.env with your API keys and configuration"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Start database and supporting services
echo "🐘 Starting PostgreSQL, Redis, and ChromaDB..."
docker-compose -f docker/docker-compose.dev.yml up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Check database connection
echo "🔍 Checking database connection..."
docker-compose -f docker/docker-compose.dev.yml exec -T postgres pg_isready -U thinkpod_user -d thinkpod_dev

if [ $? -eq 0 ]; then
    echo "✅ Database is ready"
else
    echo "❌ Database is not ready. Please check Docker logs."
    exit 1
fi

# Run database migrations
echo "🗄️  Running database migrations..."
# For now, we'll manually apply migrations since we don't have a migration runner yet
echo "📝 Note: Database migrations need to be applied manually:"
echo "   docker-compose -f docker/docker-compose.dev.yml exec postgres psql -U thinkpod_user -d thinkpod_dev -f /docker-entrypoint-initdb.d/migrations/001_initial_schema.sql"

echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "Next steps:"
echo "1. Update packages/api/.env with your API keys"
echo "2. Run migrations: npm run migration:run"
echo "3. Seed database: npm run seed"
echo "4. Start API server: npm run dev:api"
echo "5. In another terminal, start web app: npm run dev:web"
echo ""
echo "Services running:"
echo "- PostgreSQL: localhost:5432"
echo "- Redis: localhost:6379"
echo "- ChromaDB: localhost:8000"
echo "- pgAdmin (optional): localhost:8080"
echo "- Redis Commander (optional): localhost:8081"
echo ""
echo "To start optional management tools:"
echo "docker-compose -f docker/docker-compose.dev.yml --profile tools up -d"