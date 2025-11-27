module.exports = {
  // Bot Configuration
  token: process.env.DISCORD_BOT_TOKEN,
  prefix: '!',
  enablePrefix: true, // Set to false to disable prefix commands
  
  // Owner ID for notifications (You must define OWNER_ID in your .env or replace this)
  OWNER_ID: process.env.OWNER_ID || '809441570818359307',

  // Official Server Logging Channels (You must define these in your .env or replace this)
  // These are optional. If undefined, notifications to these channels will be skipped.
  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID || '1393633652537163907',
  JOIN_CHANNEL_ID: process.env.JOIN_CHANNEL_ID || '1411369682459427006',
  LEAVE_CHANNEL_ID: process.env.LEAVE_CHANNEL_ID || '1393633926031085669',
  SONG_NOTIFICATION_CHANNEL_ID: process.env.SONG_NOTIFICATION_CHANNEL_ID || '1411369713266589787',

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
    warn: '⚠️',
    info: 'ℹ️',
    stats: '📊',
    invite: '📩',
    support: '📞',
    // ... add any other emojis you might need
  },
};
