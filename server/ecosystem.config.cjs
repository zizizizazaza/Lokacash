module.exports = {
  apps: [
    {
      name: 'LokaCash',
      script: 'dist/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      // Restart on crash, max 10 restarts in 1 min before backing off
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
    },
    {
      name: 'Aegean',
      script: '.venv/bin/python',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8100',
      cwd: __dirname + '/tools/aegean-consensus',
      interpreter: 'none',  // Don't let PM2 wrap with node
      env: {
        PYTHONPATH: 'src',
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
    },
  ],
};
