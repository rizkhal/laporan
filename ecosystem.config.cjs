module.exports = {
  apps: [
    {
      name: "laporan-api",
      cwd: "/www/wwwroot/rizkal.laporan.space/apps/api",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
