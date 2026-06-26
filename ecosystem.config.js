/**
 * URackIT V2 - Unified PM2 Ecosystem Configuration
 * 
 * This runs the ENTIRE app as ONE logical unit.
 * Both services start together, stop together.
 * 
 * Usage:
 *   pm2 start ecosystem.config.js          # Start the app
 *   pm2 stop urackit-v2                    # Stop the app
 *   pm2 restart urackit-v2                 # Restart the app
 *   pm2 logs urackit-v2                    # View logs
 *   pm2 delete urackit-v2                  # Remove
 * 
 * Note: We need 2 processes because:
 *   - Backend = Node.js (NestJS + React frontend)
 *   - AI = Python (FastAPI) - different language
 */

module.exports = {
    apps: [
        // ============================================
        // Backend (NestJS API + serves React frontend)
        // Port 3003 - This is the main entry point
        // ============================================
        {
            name: 'urackit-v2',  // Main app name
            script: 'dist/src/main.js',
            cwd: '/root/webhook/urackit_v2/backend',
            env: {
                NODE_ENV: 'production',
                PORT: 3003,
                AI_SERVICE_URL: 'http://localhost:8081'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/root/.pm2/logs/urackit-v2-error.log',
            out_file: '/root/.pm2/logs/urackit-v2-out.log',
            merge_logs: true,
            max_restarts: 10,
            restart_delay: 3000,
            autorestart: true,
            watch: false
        },

        // ============================================
        // AI Service (Python FastAPI) - Port 8081
        // Internal service, called by backend
        // ============================================
        {
            name: 'urackit-v2-ai',  // Sub-service
            script: '/root/webhook/urackit_v2/ai-service/venv/bin/uvicorn',
            args: 'main:app --host 0.0.0.0 --port 8081',
            cwd: '/root/webhook/urackit_v2/ai-service',
            interpreter: 'none',
            env: {
                PATH: '/root/webhook/urackit_v2/ai-service/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                PYTHONUNBUFFERED: '1'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/root/.pm2/logs/urackit-v2-ai-error.log',
            out_file: '/root/.pm2/logs/urackit-v2-ai-out.log',
            merge_logs: true,
            max_restarts: 10,
            restart_delay: 3000,
            autorestart: true,
            watch: false
        }
    ]
};
