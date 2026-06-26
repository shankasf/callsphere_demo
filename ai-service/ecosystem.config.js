module.exports = {
    apps: [{
        name: 'urackit-v2-ai',
        script: '/root/webhook/urackit_v2/ai-service/venv/bin/uvicorn',
        args: 'main:app --host 0.0.0.0 --port 8081',
        cwd: '/root/webhook/urackit_v2/ai-service',
        interpreter: 'none',
        env: {
            PATH: '/root/webhook/urackit_v2/ai-service/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
        },
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        error_file: '/root/.pm2/logs/urackit-v2-ai-error.log',
        out_file: '/root/.pm2/logs/urackit-v2-ai-out.log',
        merge_logs: true,
        max_restarts: 10,
        restart_delay: 3000,
        autorestart: true,
        watch: false
    }]
};
