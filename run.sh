#!/bin/bash
# ============================================
# URackIT V2 - Unified Control Script
# ============================================
# Usage: ./run.sh [command]
#   start   - Start all services
#   stop    - Stop all services
#   restart - Restart all services
#   build   - Build frontend & backend
#   deploy  - Build and restart
#   logs    - View logs
#   status  - Check service status

cd "$(dirname "$0")"

case "$1" in
    start)
        echo "🚀 Starting URackIT V2 services..."
        pm2 start ecosystem.config.js
        pm2 status
        ;;
    stop)
        echo "🛑 Stopping URackIT V2 services..."
        pm2 stop ecosystem.config.js
        ;;
    restart)
        echo "🔄 Restarting URackIT V2 services..."
        pm2 restart ecosystem.config.js
        pm2 status
        ;;
    build)
        echo "🔨 Building URackIT V2..."
        echo "Building backend..."
        cd backend && npm run build && cd ..
        echo "Building frontend..."
        cd frontend && npm run build && cd ..
        echo "✅ Build complete!"
        ;;
    deploy)
        echo "🚀 Deploying URackIT V2..."
        $0 build
        $0 restart
        echo "✅ Deployment complete!"
        ;;
    logs)
        pm2 logs
        ;;
    status)
        pm2 status
        ;;
    *)
        echo "URackIT V2 Control Script"
        echo ""
        echo "Usage: $0 {start|stop|restart|build|deploy|logs|status}"
        echo ""
        echo "Commands:"
        echo "  start   - Start all services (backend + AI)"
        echo "  stop    - Stop all services"
        echo "  restart - Restart all services"
        echo "  build   - Build frontend & backend"
        echo "  deploy  - Build and restart (full deploy)"
        echo "  logs    - View PM2 logs"
        echo "  status  - Check service status"
        echo ""
        echo "Services managed:"
        echo "  - urackit-v2-backend (NestJS + React frontend) - Port 3003"
        echo "  - urackit-v2-ai (Python FastAPI) - Port 8081"
        ;;
esac
