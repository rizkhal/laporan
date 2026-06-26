module.exports = {
  apps: [
    {
      name: "laporan-api",
      cwd: "/www/wwwroot/laporan.rizkal.space/apps/api",
      script: "./index.ts",
      interpreter: "npx",
      interpreter_args: "tsx",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "500M",
      error_file: "/www/wwwroot/laporan.rizkal.space/logs/api-error.log",
      out_file: "/www/wwwroot/laporan.rizkal.space/logs/api-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      kill_timeout: 5000,
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
