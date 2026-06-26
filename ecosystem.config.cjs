module.exports = {
  apps: [
    {
      name: "laporan-api",
      cwd: "/www/wwwroot/laporan.rizkal.space",
      script: "apps/api/src/index.ts",
      interpreter: "/www/wwwroot/laporan.rizkal.space/node_modules/.bin/tsx",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
    {
      name: "laporan-web",
      cwd: "/www/wwwroot/laporan.rizkal.space/apps/web",
      script: "node_modules/.bin/vite",
      args: "preview --port 4173",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
