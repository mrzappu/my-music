module.exports = {
  // Bot Configuration
  token: process.env.DISCORD_BOT_TOKEN,
  prefix: '!',
  enablePrefix: true, // Set to false to disable prefix commands
  
  // Owner ID for notifications (You must define OWNER_ID in your .env or replace this)
  OWNER_ID: process.env.OWNER_ID || 'YOUR_DISCORD_USER_ID',

  // Official Server Logging Channels (You must define these in your .env or replace this)
  // These are optional. If undefined, notifications to these channels will be skipped.
  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID || 'YOUR_BOT_LOG_CHANNEL_ID',
  JOIN_CHANNEL_ID: process.env.JOIN_CHANNEL_ID || 'YOUR_BOT_JOIN_CHANNEL_ID',
  LEAVE_CHANNEL_ID: process.env.LEAVE_CHANNEL_ID || 'YOUR_BOT_LEAVE_CHANNEL_ID',
  SONG_NOTIFICATION_CHANNEL_ID: process.env.SONG_NOTIFICATION_CHANNEL_ID || 'YOUR_SONG_NOTIFICATION_CHANNEL_ID',

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

  // Emojis - REPLACE 'YOUR_EMOJI_ID' with the actual IDs of your animated emojis
  emojis: {
    // Animated Music Emojis (Replace the IDs)
    play: '<a:play:1443619986907336785>',
    pause: '<a:pause:1443620907233837066>',
    resume: '<a:resume:1443619986907336785>',
    skip: '<a:skip:1443619983409287221>',
    stop: '<a:stop:1443619980859015354>',
    loop: '<a:loop:1443619976400343100>',
    volume: '<a:volume:1443619978636034099>',
    nowplaying: '<a:np:1443621459057578005>',
    queue: '<a:queue:1443622469423464549>',
    shuffle: '<a:shuffle:1443619973216862461>',
    seek: '<a:seek:1393210917755424789>',
    remove: '<a:remove:1443622707873976411>',
    clear: '<a:clear:1443622995359694849>',
    
    // Standard Utility/Status Emojis (You can change these too if you have animated ones)
    success: '✅',
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    stats: '📊',
    invite: '📩',
    support: '📞',
  },
};
