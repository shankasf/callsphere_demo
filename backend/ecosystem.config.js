module.exports = {
    apps: [{
        name: 'urackit-v2-backend',
        script: 'dist/src/main.js',
        cwd: '/root/webhook/urackit_v2/backend',
        env: {
            NODE_ENV: 'production',
            PORT: 3003
        },
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        error_file: '/root/.pm2/logs/urackit-v2-backend-error.log',
        out_file: '/root/.pm2/logs/urackit-v2-backend-out.log',
        merge_logs: true,
        max_restarts: 10,
        restart_delay: 3000,
        autorestart: true,
        watch: false
    }]
};
