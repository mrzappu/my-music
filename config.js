module.exports = {
  // Bot Configuration
  token: process.env.DISCORD_BOT_TOKEN,
  prefix: '!',
  enablePrefix: true, 
  
  // Owner ID for notifications (You must define OWNER_ID in your .env or replace this)
  OWNER_ID: process.env.OWNER_ID || '809441570818359307',

  // Bot Activity - RE-ADDED TO FIX THE 'TypeError'
  activity: {
    name: 'INFINITY MUSIC',
    type: 'LISTENING' // PLAYING, STREAMING, LISTENING, WATCHING, COMPETING
  },
  
  // NEW: Configuration for Music Control
  musicControl: {
    // Role required to use commands like /skip, /stop, /volume (in addition to requester/admin)
    djRoleName: 'DJ', 
  },

  // Lavalink Configuration
  lavalink: {
    // Note: Your error log shows 'Harmonix-NODE2' is attempting to connect.
    // Ensure your Lavalink server details (URL, Port, Auth) are correct.
    nodes: [{
      name: 'Harmonix-NODE2', 
      url: 'zac.hidencloud.com:24627', 
      auth: 'Kaun.Yuvraj', 
      secure: false, 
    }],
    defaultSearchEngine: 'youtube_music'
  },

  // Hosting Configuration
  express: {
    port: 3000, 
    host: '0.0.0.0', 
  },
  
  // Support Server Link
  support: {
    server: process.env.SUPPORT_SERVER || 'https://discord.gg/your-support-server-invite'
  },

  // Emojis - All your custom animated IDs
  emojis: {
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
    
    // Standard Utility/Status Emojis 
    success: '✅',
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    warning: '⚠️',
  },
};
