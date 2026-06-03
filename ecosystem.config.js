export default {
  apps: [
    {
      name: 'pinax',
      script: 'server/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PORT: 3001,
        NODE_ENV: 'production'
      },
      error_file: '/root/Pinax/logs/pm2-error.log',
      out_file: '/root/Pinax/logs/pm2-out.log',
      time: true
    }
  ]
}