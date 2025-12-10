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
    // 🚀 UPDATED LAVALINK NODE CONFIGURATION
    nodes: [{
      name: 'Void_Music_Node', // Changed the name to reflect the new host
      url: 'nexus.voidhosting.vip:6004', 
      auth: 'cocaine', 
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

  //...
};
