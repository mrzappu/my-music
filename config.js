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
  
  // Player Configuration
  player: {
    defaultVolume: 80, // 0 to 100
    autoLeave: true, // Automatically disconnect after inactivity
  },

  // Embed Configuration
  embed: {
    color: '#3498db'
  },

  // Lavalink Configuration
  lavalink: {
    // ⚠️ CRITICAL: Ensure the URL, Port, and Auth are absolutely correct 
    // for the 'Rick_Music' node to prevent the ERR_UNHANDLED_ERROR crash.
    nodes: [{
      name: 'Rick_Music', // <-- NAME CHANGED HERE
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
    server: process.env.SUPPORT_SERVER || 'https://discord.gg/YABAKcjJhC'
  },

  // Emojis - All your custom animated IDs (Ensure these IDs are valid)
  emojis: {
    play: '<a:play:1443619986907336785>',
    pause: '<a:pause:1443620907233837066>',
    resume: '<a:resume:1443619986907336785>',
    skip: '<a:skip:1443619983409287221>',
    stop: '<a:stop:1443621457007353984>',
    queue: '<a:queue:1443621987399946255>',
    error: '❌',
    loop: '🔁',
    shuffle: '🔀',
    playlist: '🎶'
  }
};
