module.exports = {
  // Bot Configuration
  token: process.env.DISCORD_BOT_TOKEN,
  prefix: '!',
  enablePrefix: true, // Set to false to disable prefix commands

  // Bot Activity
  activity: {
    name: 'INFINITY MUSIC',
    type: 'LISTENING' // PLAYING, STREAMING, LISTENING, WATCHING, COMPETING
  },

  // Lavalink Configuration
  lavalink: {
    nodes: [{
      name: 'Harmonix-NODE2', // Updated Node Name
      url: 'zac.hidencloud.com:24627', // New Host and Port
      auth: 'Kaun.Yuvraj', // New Password
      secure: false, // Set to false for this connection
    }],
    defaultSearchEngine: 'youtube_music'
  },

  // Hosting Configuration
  express: {
    port: 3000, // Default port for local testing
    host: '0.0.0.0', // Listen on all interfaces
  },
  
  // Support Server Link
  support: {
    server: process.env.SUPPORT_SERVER || 'https://discord.gg/your-support-server-invite'
  },

  // Emojis
  emojis: {
    play: '▶️',
    pause: '⏸️',
    resume: '▶️',
    skip: '⏭️',
    stop: '⏹️',
    queue: '📜',
    shuffle: '🔀',
    loop: '🔄',
    volume: '🔊',
    nowplaying: '🎵',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    music: '🎵',
    user: '👤',
    duration: '⏱️',
    position: '📍',
    ping: '🏓',
    stats: '📊',
    invite: '📨',
    support: '💬',
    uptime: '⌚',
    servers: '🌐',
    users: '👥',
    channels: '💬',
    memory: '🧠',
    platform: '💻',
    node: '🟢',
    api: '📡'
  },
};
