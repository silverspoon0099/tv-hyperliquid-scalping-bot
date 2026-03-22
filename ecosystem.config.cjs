module.exports = {
  apps: [
    {
      name: 'hyperliquid-bot',
      script: 'dist/server.js',
      watch: false,
      env: {
        ENV: 'testnet',
        WEBHOOK_SECRET: '',
        // …other defaults
      },
      env_production: {
        ENV: 'mainnet',
        WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
        // …
      }
    }
  ]
};