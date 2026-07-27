module.exports = {
  apps : [
  //   {
  //   name: "thitracnghiem",
  //   script: 'index.js',
  //   watch: '.'
  // }, {
  //   script: './service-worker/',
  //   watch: ['./service-worker']
  // },
  // { name: "node-3000", script: "./index.js", env: { PORT: 3000 } },
  // { name: "node-3001", script: "./index.js", env: { PORT: 3001 } },
  // { name: "node-3002", script: "./index.js", env: { PORT: 3002 } },
  // { name: "node-3003", script: "./index.js", env: { PORT: 3003 } },
  // { name: "node-3004", script: "./index.js", env: { PORT: 3004 } },
  // { name: "node-3005", script: "./index.js", env: { PORT: 3005 } },
  // { name: "node-3006", script: "./index.js", env: { PORT: 3006 } },
  // { name: "node-3007", script: "./index.js", env: { PORT: 3007 } }
  {
    name: "thitracnghiem",
    script: "./index.js",

    instances: "max",
    exec_mode: "cluster",

    watch: false,

    max_memory_restart: "1G",

    env: {
      NODE_ENV: "production",
      PORT: 3000
    }
  }
],

  deploy : {
    production : {
      user : 'SSH_USERNAME',
      host : 'SSH_HOSTMACHINE',
      ref  : 'origin/master',
      repo : 'GIT_REPOSITORY',
      path : 'DESTINATION_PATH',
      'pre-deploy-local': '',
      'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
