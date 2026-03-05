module.exports = {
  apps: [{
    name: 'agent-orchestration',
    script: './server.js',
    env: {
      NODE_ENV: 'production',
      VILLA_USERNAME: 'Matt Serletic',
      VILLA_PASSWORD: require('fs').readFileSync('.password_hash', 'utf8').trim()
    }
  }]
};
