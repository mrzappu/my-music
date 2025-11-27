require('dotenv').config();
const config = require('./config');
// ADDED PermissionFlagsBits to imports
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType, ChannelType, PermissionFlagsBits } = require('discord.js'); 

const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Discord Music Bot is running!');
});

// FIX for Render Hosting: Use process.env.PORT, listening on '0.0.0.0'
const PORT = process.env.PORT || config.express.port;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Express server running on port ${PORT}`);
});

const { Shoukaku, Connectors } = require('shoukaku');
const { Kazagumo, KazagumoTrack } = require('kazagumo');

// Set up intents based on prefix configuration
const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
];

// Only add MessageContent intent if prefix commands are enabled
if (config.enablePrefix) {
  intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
}

const client = new Client({ intents });

const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), config.lavalink.nodes);

const kazagumo = new Kazagumo({
  defaultSearchEngine: config.lavalink.defaultSearchEngine,
  send: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(payload);
  }
}, new Connectors.DiscordJS(client), config.lavalink.nodes);

// --- OWNER & OFFICIAL SERVER CONFIGURATION ---
const OWNER_ID = '809441570818359307';
// Channel ID for song played notifications
const SONG_NOTIFICATION_CHANNEL_ID = '1411369713266589787'; 
// Channel ID for bot join notifications
const BOT_JOIN_NOTIFICATION_CHANNEL_ID = '1411369682459427006';
// Channel ID for music stopped notifications
const MUSIC_STOPPED_CHANNEL_ID = '1393633652537163907';
// Channel ID for bot left server notifications
const BOT_LEFT_SERVER_CHANNEL_ID = '1393633926031085669';
// NEW: Lavalink Status Notification Channel ID
const LAVALINK_STATUS_CHANNEL_ID = '1389121367332622337'; 

// --- UTILITY FUNCTION: msToTime ---
/**
 * Converts milliseconds to a human-readable time string (M:SS or H:MM:SS).
 * This replaces the error-prone KazagumoTrack.formatLength.
 * @param {number} duration - Duration in milliseconds.
 * @returns {string} Formatted time string.
 */
function msToTime(duration) {
    if (!duration || duration < 0) return 'N/A';
    
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)));

    const sec = String(seconds).padStart(2, '0');
    
    if (hours > 0) {
        const min = String(minutes).padStart(2, '0');
        return `${hours}:${min}:${sec}`;
    } else {
        const totalMinutes = Math.floor(duration / (1000 * 60));
        return `${totalMinutes}:${sec}`;
    }
}
// -----------------------------------

// --- NEW UTILITY FUNCTION: clearBotMessages ---
/**
 * Clears recent bot messages (up to 100) from a specified text channel.
 * This is called when the bot leaves the VC or the music stops.
 * @param {string} channelId - The ID of the text channel.
 */
async function clearBotMessages(channelId) {
    const channel = client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
        console.warn(`Attempted to clear messages in non-text channel or missing channel: ${channelId}`);
        return;
    }

    try {
        // Check for MANAGE_MESSAGES permission
        const permissions = channel.permissionsFor(client.user);
        if (!permissions.has(PermissionFlagsBits.ManageMessages)) {
            console.warn(`Bot lacks MANAGE_MESSAGES permission in channel ${channel.name} to clear messages.`);
            return;
        }

        // Fetch up to 100 recent messages
        const messages = await channel.messages.fetch({ limit: 100 });
        
        // Filter messages sent by the bot
        const botMessages = messages.filter(m => m.author.id === client.user.id);
        
        if (botMessages.size > 0) {
            // Bulk delete the filtered messages (messages older than 14 days will fail gracefully)
            await channel.bulkDelete(botMessages, true);
            console.log(`Successfully cleared ${botMessages.size} bot messages from channel: ${channel.id}`);
        } else {
            console.log(`No recent bot messages found to clear in channel: ${channel.id}`);
        }
    } catch (error) {
        // Error code 50034 is for messages older than 14 days which cannot be bulk deleted.
        if (error.code === 50034) {
             console.warn(`Failed to bulk delete messages due to age limit (over 14 days old) in channel: ${channelId}`);
        } else {
            console.error(`Error clearing bot messages in channel ${channelId}:`, error.message);
        }
    }
}
// ----------------------------------------------

// --- FEATURE 1: Song Play Notification ---
/**
 * Sends a direct message to the bot owner and a message to the official song notification channel when a track starts playing.
 * @param {KazagumoPlayer} player 
 * @param {KazagumoTrack} track 
 */
async function songPlayNotification(player, track) {
  try {
    const guild = client.guilds.cache.get(player.guildId);
    if (!guild) return;

    const voiceChannel = client.channels.cache.get(player.voiceId);
    const vcName = voiceChannel ? voiceChannel.name : 'Unknown VC';

    // --- 1. Owner DM ---
    const ownerUser = await client.users.fetch(OWNER_ID);
    
    const ownerEmbed = new EmbedBuilder()
      .setTitle(`🎶 New Song Started! (DM)`) // Enhanced Emoji
      .setDescription(`**[${track.title}](${track.uri})**`)
      .setThumbnail(guild.iconURL({ dynamic: true })) // Add Server Icon
      .addFields(
        { name: 'Server', value: `${guild.name} (\`${guild.id}\`)`, inline: false },
        { name: 'Voice Channel', value: `${vcName} (\`${player.voiceId}\`)`, inline: true }, // Add VC Info
        { name: 'Requested By', value: `${track.requester.tag} (\`${track.requester.id}\`)`, inline: true },
        // FIX: Using msToTime
        { name: 'Duration', value: track.duration ? `\`${msToTime(track.duration)}\`` : '`N/A`', inline: true }
      )
      .setColor('#0099ff')
      .setTimestamp();
      
    if (ownerUser) {
        await ownerUser.send({ embeds: [ownerEmbed] }).catch(err => console.error(`Failed to send DM to owner: ${err.message}`));
        console.log(`Sent 'Now Playing' DM to bot owner.`);
    }

    // --- 2. Official Server Channel Message (Song Played Channel) ---
    const songNotificationChannel = client.channels.cache.get(SONG_NOTIFICATION_CHANNEL_ID);

    if (songNotificationChannel && songNotificationChannel.isTextBased()) {
        const channelEmbed = new EmbedBuilder()
            .setTitle(`🎶 Song Played on External Server`) // Enhanced Emoji
            .setDescription(`**[${track.title}](${track.uri})**`)
            .setThumbnail(guild.iconURL({ dynamic: true })) // Add Server Icon
            .addFields(
                { name: 'Server', value: guild.name, inline: true },
                { name: 'Voice Channel', value: vcName, inline: true }, // Add VC Info
                { name: 'Requested By', value: track.requester.tag, inline: true }
            )
            .setColor('#4CAF50') 
            .setTimestamp();
            
        await songNotificationChannel.send({ embeds: [channelEmbed] }).catch(err => console.error(`Failed to send channel message: ${err.message}`));
        console.log(`Sent 'Now Playing' notification to official song channel.`);
    } else {
        console.warn("Official song notification channel not found or is not a text channel. ID: " + SONG_NOTIFICATION_CHANNEL_ID);
    }

  } catch (error) {
    console.error('Error sending song play notification:', error);
  }
}
// --------------------------------------------------------

// --- FEATURE 3: Music Stopped Notification ---
/**
 * Sends a notification to the designated channel when the music playback stops (player is destroyed).
 * @param {string} guildId 
 * @param {string} voiceId
 * @param {string} reason 
 */
async function musicStoppedNotification(guildId, voiceId, reason = 'Bot disconnected or music was manually stopped.') {
    try {
        const notificationChannel = client.channels.cache.get(MUSIC_STOPPED_CHANNEL_ID);
        if (!notificationChannel || !notificationChannel.isTextBased()) {
            console.warn("Music stopped channel not found or is not a text channel. ID: " + MUSIC_STOPPED_CHANNEL_ID);
            return;
        }

        const guild = client.guilds.cache.get(guildId);
        const serverName = guild ? guild.name : 'Unknown Server';
        
        // Format current date and time
        const now = new Date();
        const dateTimeString = now.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
        });

        let voiceChannelName = 'N/A';
        if (voiceId) {
            const vc = client.channels.cache.get(voiceId);
            voiceChannelName = vc ? vc.name : `VC ID: ${voiceId}`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🔇 Music Playback Stopped') // Enhanced Emoji
            .setDescription(`Playback stopped in **${serverName}** (\`${guildId}\`).`)
            .setThumbnail(guild ? guild.iconURL({ dynamic: true }) : null) // Add Server Icon
            .addFields(
                { name: 'Reason', value: reason, inline: false },
                { name: 'Voice Channel', value: voiceChannelName, inline: true }, // Add VC Info
                { name: 'Date & Time', value: `\`${dateTimeString}\``, inline: true }
            )
            .setColor('#FF5733')
            .setTimestamp();
            
        await notificationChannel.send({ embeds: [embed] }).catch(err => console.error(`Failed to send music stopped message: ${err.message}`));
        console.log(`Sent 'Music Stopped' notification for guild ${guildId}.`);

    } catch (error) {
        console.error('Error in musicStoppedNotification:', error);
    }
}
// ---------------------------------------------

// --- NEW FEATURE: Lavalink Status Notification Function ---
/**
 * Sends a notification to the designated channel when a Lavalink node connects or disconnects.
 * @param {string} name 
 * @param {boolean} isError 
 * @param {string} message 
 */
async function lavalinkStatusNotification(name, isError, message) {
    try {
        const notificationChannel = client.channels.cache.get(LAVALINK_STATUS_CHANNEL_ID);
        if (!notificationChannel || !notificationChannel.isTextBased()) {
            console.warn("Lavalink status channel not found or is not a text channel. ID: " + LAVALINK_STATUS_CHANNEL_ID);
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(isError ? '🚨 Lavalink Node Down' : '✅ Lavalink Node Up')
            .setDescription(`**Node:** \`${name}\``)
            .addFields(
                { name: 'Status', value: message, inline: false }
            )
            .setColor(isError ? '#FF0000' : '#00FF00')
            .setTimestamp();
            
        await notificationChannel.send({ embeds: [embed] }).catch(err => console.error(`Failed to send Lavalink status message: ${err.message}`));
    } catch (error) {
        console.error('Error in lavalinkStatusNotification:', error);
    }
}
// -----------------------------------------------------

// Client Ready Event (renamed to clientReady to avoid deprecation warning)
client.on('clientReady', () => {
  console.log(`${client.user.tag} is online!`);

  client.user.setActivity({
    name: config.activity.name,
    type: ActivityType[config.activity.type],
  });

  // Register Slash Commands
  const commands = [
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('Plays a song or adds it to the queue.')
      .addStringOption(option =>
        option.setName('query')
          .setDescription('The song name or URL')
          .setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Skips the current song.'),
    new SlashCommandBuilder().setName('stop').setDescription('Stops the music and clears the queue.'),
    new SlashCommandBuilder().setName('queue').setDescription('Displays the current queue.'),
    new SlashCommandBuilder().setName('nowplaying').setDescription('Shows the current playing song.'),
    new SlashCommandBuilder().setName('pause').setDescription('Pauses the current song.'),
    new SlashCommandBuilder().setName('resume').setDescription('Resumes the current song.'),
    new SlashCommandBuilder().setName('shuffle').setDescription('Shuffles the queue.'),
    new SlashCommandBuilder().setName('loop').setDescription('Sets the loop mode (off/track/queue).')
      .addStringOption(option =>
        option.setName('mode')
          .setDescription('The loop mode')
          .setRequired(true)
          .addChoices(
            { name: 'Off', value: 'none' },
            { name: 'Track', value: 'track' },
            { name: 'Queue', value: 'queue' },
          )),
    new SlashCommandBuilder().setName('volume').setDescription('Adjusts the player volume.')
      .addIntegerOption(option =>
        option.setName('level')
          .setDescription('Volume level (0-100)')
          .setRequired(false)
          .setMinValue(0)
          .setMaxValue(100)),
    new SlashCommandBuilder().setName('247').setDescription('Toggles 24/7 mode (keeps bot in VC even when queue ends).'),
    new SlashCommandBuilder().setName('help').setDescription('Shows the list of commands.'),
    new SlashCommandBuilder().setName('seek').setDescription('Seeks to a specific time in the current track.')
      .addStringOption(option =>
        option.setName('time')
          .setDescription('Time to seek to (e.g., 1:30 or 90s)')
          .setRequired(true)),
    // NEW: Remove Command
    new SlashCommandBuilder().setName('remove').setDescription('Removes a track from the queue by its number.')
      .addIntegerOption(option =>
        option.setName('number')
          .setDescription('The queue number of the track to remove (use /queue).')
          .setRequired(true)
          .setMinValue(1)), // Queue numbers start at 1
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(config.token);

  (async () => {
    try {
      console.log('Started refreshing application (/) commands.');
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands },
      );
      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error(error);
    }
  })();
});

// --- FEATURE 2: Guild Create Notification (Bot Joined) ---
client.on('guildCreate', async (guild) => {
  try {
    // --- Attempt to generate an invite link for the server ---
    let inviteLink = 'N/A (No suitable channel found or missing permissions)';
    try {
        const textChannel = guild.channels.cache
            // FIX: Use PermissionFlagsBits.CreateInstantInvite
            .filter(c => c.type === ChannelType.GuildText && c.viewable && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreateInstantInvite))
            .sort((a, b) => a.position - b.position)
            .first();

        if (textChannel) {
            const invite = await textChannel.createInvite({
                maxAge: 0, // 0 means unlimited
                maxUses: 0, // 0 means unlimited
                reason: 'Bot join notification link'
            });
            inviteLink = `[Click to Join](${invite.url})`;
        }
    } catch (err) {
        console.error(`Failed to create invite for ${guild.name}: ${err.message}`);
    }
    // ---------------------------------------------------------
    
    // --- 1. Owner DM ---
    const ownerUser = await client.users.fetch(OWNER_ID);

    const inviteEmbedOwner = new EmbedBuilder()
      .setTitle('🎉 Bot Added to New Server! (DM)')
      .setDescription(`The bot has been invited to a new guild!`)
      .setThumbnail(guild.iconURL({ dynamic: true })) // Add Server Icon
      .addFields(
        { name: 'Server Name', value: guild.name, inline: true },
        { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
        { name: 'Member Count', value: `${guild.memberCount}`, inline: true },
        { name: 'Owner', value: `${(await guild.fetchOwner()).user.tag} (\`${guild.ownerId}\`)`, inline: false },
        { name: 'Total Servers', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'Invite Link', value: inviteLink, inline: false }
      )
      .setColor('#00ff00')
      .setTimestamp();
      
    if (ownerUser) {
        await ownerUser.send({ embeds: [inviteEmbedOwner] }).catch(err => console.error(`Failed to send DM to owner on guildCreate: ${err.message}`));
        console.log(`Sent 'Guild Create' DM to bot owner.`);
    }

    // --- 2. Official Server Channel Message (Bot Join Channel) ---
    const joinNotificationChannel = client.channels.cache.get(BOT_JOIN_NOTIFICATION_CHANNEL_ID);

    if (joinNotificationChannel && joinNotificationChannel.isTextBased()) {
        const channelInviteEmbed = new EmbedBuilder()
            .setTitle('🚀 Bot Joined New Server! 🥳') // Enhanced Emoji
            .setDescription(`The bot has been invited to a new server!`)
            .setThumbnail(guild.iconURL({ dynamic: true })) // Add Server Icon
            .addFields(
                { name: 'Server Name', value: guild.name, inline: true },
                { name: 'Member Count', value: `${guild.memberCount}`, inline: true },
                { name: 'Total Servers', value: `${client.guilds.cache.size}`, inline: false },
                { name: 'Invite Link', value: inviteLink, inline: false } // Add Invite Link
            )
            .setColor('#00FFFF') 
            .setTimestamp();
            
        await joinNotificationChannel.send({ embeds: [channelInviteEmbed] }).catch(err => console.error(`Failed to send channel message on guildCreate: ${err.message}`));
        console.log(`Sent 'Guild Create' notification to official bot join channel.`);
    } else {
        console.warn("Official bot join notification channel not found or is not a text channel. ID: " + BOT_JOIN_NOTIFICATION_CHANNEL_ID);
    }

  } catch (error) {
    console.error('Error sending guildCreate notification:', error);
  }
});

// --- FEATURE 4: Guild Delete Notification (Bot Left Server) ---
client.on('guildDelete', async (guild) => {
  try {
    // --- 1. Owner DM ---
    const ownerUser = await client.users.fetch(OWNER_ID);

    const leftEmbedOwner = new EmbedBuilder()
      .setTitle('💔 Bot Left Server! (DM)') // Enhanced Emoji
      .setDescription(`The bot has been removed from a guild.`)
      .setThumbnail(guild.iconURL({ dynamic: true })) // Add Server Icon
      .addFields(
        { name: 'Server Name', value: guild.name, inline: true },
        { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
        { name: 'Member Count (Before leaving)', value: `${guild.memberCount}`, inline: true },
        { name: 'New Total Servers', value: `${client.guilds.cache.size}`, inline: false }
      )
      .setColor('#FF0000')
      .setTimestamp();
      
    if (ownerUser) {
        await ownerUser.send({ embeds: [leftEmbedOwner] }).catch(err => console.error(`Failed to send DM to owner on guildDelete: ${err.message}`));
        console.log(`Sent 'Guild Delete' DM to bot owner.`);
    }

    // --- 2. Official Server Channel Message (Bot Left Server Channel) ---
    const leftNotificationChannel = client.channels.cache.get(BOT_LEFT_SERVER_CHANNEL_ID);

    if (leftNotificationChannel && leftNotificationChannel.isTextBased()) {
        const channelLeftEmbed = new EmbedBuilder()
            .setTitle('📉 Bot Left Server') // Enhanced Emoji
            .setDescription(`The bot has been removed from the server **${guild.name}**!`)
            .setThumbnail(guild.iconURL({ dynamic: true })) // Add Server Icon
            .addFields(
                { name: 'Server Name', value: guild.name, inline: true },
                { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
                { name: 'Total Servers Now', value: `${client.guilds.cache.size}`, inline: false },
                { name: 'Invite Link Status', value: `*Unable to create invite (bot left). Check support server for help: ${config.support.server}*`, inline: false } // Add Status
            )
            .setColor('#FF8C00') 
            .setTimestamp();
            
        await leftNotificationChannel.send({ embeds: [channelLeftEmbed] }).catch(err => console.error(`Failed to send channel message on guildDelete: ${err.message}`));
        console.log(`Sent 'Guild Delete' notification to official bot left channel.`);
    } else {
        console.warn("Official bot left server channel not found or is not a text channel. ID: " + BOT_LEFT_SERVER_CHANNEL_ID);
    }
  } catch (error) {
    console.error('Error sending guildDelete notification:', error);
  }
});
// --------------------------------------------------------

// --- NEW: Shoukaku (Lavalink) Events with Notification Function ---
shoukaku.on('ready', (name) => {
    console.log(`Lavalink Node ${name}: Ready`);
    lavalinkStatusNotification(name, false, 'Connection successful and node is ready.');
});
shoukaku.on('error', (name, error) => {
    console.error(`Lavalink Node ${name}: Error - ${error.message}`);
    lavalinkStatusNotification(name, true, `Error: ${error.message}`);
});
shoukaku.on('close', (name, code, reason) => {
    console.warn(`Lavalink Node ${name}: Closed - Code ${code} | Reason: ${reason || 'No reason'}`);
    lavalinkStatusNotification(name, true, `Connection closed. Code: ${code} | Reason: ${reason || 'Unknown'}`);
});
shoukaku.on('disconnect', (name, players) => {
    console.warn(`Lavalink Node ${name}: Disconnected | Affected players: ${players.size}`);
    lavalinkStatusNotification(name, true, `Node disconnected. Affected players: ${players.size}.`);
});
shoukaku.on('debug', (name, info) => console.debug(`Lavalink Node ${name}: Debug - ${info}`));
// ------------------------------------------------------------------

// Kazagumo (Music Player) Events
kazagumo.on('playerCreate', (player) => {
  console.log(`Player created for guild: ${player.guildId}`);
  player.data.set('twentyFourSeven', false); // Initialize 24/7 mode state
});

// FIX: Robust playerStart to ensure 'Now Playing' message is sent and handles missing duration
kazagumo.on('playerStart', async (player, track) => {
  console.log(`Now playing: ${track.title} in guild: ${player.guildId}`);

  // Call the song play notification function (sends DM and Channel msg)
  songPlayNotification(player, track);

  try {
    const channel = client.channels.cache.get(player.textId);

    if (channel) {
      // FIX: Using msToTime
      const durationString = track.duration ? msToTime(track.duration) : 'N/A';

      // Create the "Now Playing" embed
      const embed = new EmbedBuilder()
        .setTitle(`${config.emojis.nowplaying} Now Playing`)
        .setDescription(`[${track.title}](${track.uri}) - \`${durationString}\``)
        .setThumbnail(track.thumbnail || null)
        .setColor('#0099ff')
        .setFooter({ text: `Requested by ${track.requester.tag}`, iconURL: track.requester.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      // Create action row with control buttons (initial state: Pause)
      const controlsRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId('pause').setLabel('Pause').setStyle(ButtonStyle.Primary).setEmoji(config.emojis.pause),
          new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary).setEmoji(config.emojis.skip),
          new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger).setEmoji(config.emojis.stop),
          new ButtonBuilder().setCustomId('loop').setLabel('Loop').setStyle(ButtonStyle.Secondary).setEmoji(config.emojis.loop),
          new ButtonBuilder().setCustomId('shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Secondary).setEmoji(config.emojis.shuffle)
        );

      // Send the new message and store it for later reference
      let currentMessage;
      try {
        currentMessage = await channel.send({ embeds: [embed], components: [controlsRow] });
      } catch (msgError) {
        console.error('Error sending Now Playing message (Permissions Issue?):', msgError.message);
        return; 
      }
      
      // Store the message object in player data
      player.data.set('currentMessage', currentMessage);

      // Delete the previous 'Now Playing' message if it exists and is deletable
      const previousMessage = player.data.get('previousMessage');
      if (previousMessage && previousMessage.deletable) {
        try {
          await previousMessage.delete();
        } catch (error) {
          if (error.code !== 10008) console.error('Error deleting previous message:', error);
        }
      }

      // Update the previous message
      player.data.set('previousMessage', currentMessage);
    }
  } catch (err) {
    console.error('CRITICAL: Error handling playerStart event. Destroying player:', err);
    // Destroy the player to prevent a stuck state if something goes wrong
    player.destroy(); 
  }
});

// FIX: Add missing playerEnd event to handle queue advancement and disconnect
kazagumo.on('playerEnd', async (player) => {
  console.log(`Player ended for guild: ${player.guildId}`);

  // Get the message containing the last 'Now Playing' embed
  const message = player.data.get('currentMessage');

  // Check if 24/7 mode is off and the queue is empty
  if (!player.data.get('twentyFourSeven') && player.queue.length === 0) {
    if (message && message.editable) {
      try {
        // Disable control buttons on the last message
        if (message.components && message.components[0] && message.components[0].components) {
          const disabledButtons = message.components[0].components.map(button => {
            return ButtonBuilder.from(button).setDisabled(true);
          });
          await message.edit({ components: [new ActionRowBuilder().addComponents(disabledButtons)] });
        }
      } catch (error) {
        console.error('Error disabling buttons in playerEnd:', error);
      }
    }

    // Send a "Queue ended" message
    const endEmbed = new EmbedBuilder()
      .setDescription(`${config.emojis.stop} **Queue has ended! Disconnecting...**`)
      .setColor('#FF0000')
      .setTimestamp();

    // Use the text channel the player is bound to
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
      await channel.send({ embeds: [endEmbed] }).catch(console.error);
    }

    // Destroy the player, which disconnects the bot from the voice channel
    player.destroy();
  }
});

// FIX: Added robust error handling for reading 'err.message'
kazagumo.on('playerException', async (player, type, err) => {
  console.error(`Player exception (${type}) in guild: ${player.guildId}:`, err);

  try {
    const channel = client.channels.cache.get(player.textId);
    
    // FIX: Safely extract the error message with fallbacks
    // Use optional chaining for robustness against missing 'err' or 'err.message'
    const errorMessage = err?.message || err?.error || `Unknown error of type: ${type}`;

    if (channel) {
      const exceptionEmbed = new EmbedBuilder()
        .setTitle('⚠️ Player Error')
        .setDescription(`An error occurred while playing music: \`${errorMessage}\``)
        .setColor('#FFA500')
        .setTimestamp();

      channel.send({ embeds: [exceptionEmbed] }).catch(console.error);
    }
  } catch (err) {
    console.error('Error handling player exception:', err);
  }
});

kazagumo.on('playerResolveError', (player, track, message) => {
  console.error('Player resolve error:', message);

  try {
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
      const resolveErrorEmbed = new EmbedBuilder()
        .setTitle('🔍 Track Resolution Error')
        .setDescription(`Failed to resolve track: **${track.title}**\nReason: ${message}`)
        .setColor('#FF0000')
        .setTimestamp();

      channel.send({ embeds: [resolveErrorEmbed] }).catch(console.error);
    }
  } catch (err) {
    console.error('Error handling resolve error:', err);
  }
});

// MODIFIED: Added call to clearBotMessages(player.textId)
kazagumo.on('playerDestroy', async (player) => {
  console.log(`Player destroyed for guild: ${player.guildId}`);

  // Send Music Stopped Notification (Feature 3)
  const reason = player.queue.current ? `Queue ended after playing: ${player.queue.current.title}` : 'Queue ended or bot manually stopped.';
  musicStoppedNotification(player.guildId, player.voiceId, reason);

  // --- NEW: Clear Chat Feature (Clears all bot messages) ---
  // Give Discord a moment for other cleanup to finish, then clear messages.
  await new Promise(resolve => setTimeout(resolve, 500)); 
  await clearBotMessages(player.textId);
  // -----------------------------
  
  // Clean up player data
  player.data.delete('currentMessage');
  player.data.delete('previousMessage');

  // Removed manual message/button cleanup as clearBotMessages handles it
});

// Helper function to get or create player
async function getOrCreatePlayer(interaction, voiceChannel) {
  let player = kazagumo.players.get(interaction.guildId);

  if (!player) {
    player = await kazagumo.createPlayer({
      guildId: interaction.guildId,
      voiceId: voiceChannel.id,
      textId: interaction.channelId,
      shardId: interaction.guild.shardId,
      volume: 100,
    });
  } else if (player.voiceId !== voiceChannel.id) {
    // Player exists but user is in a different VC, move the bot
    await player.setVoiceChannel(voiceChannel.id);
    player.setTextChannel(interaction.channelId); // Update text channel to the current channel
  }

  return player;
}

// Helper function to convert time string (M:SS or SSs) to milliseconds
function timeToMilliseconds(timeString) {
  const parts = timeString.split(':');
  let milliseconds = 0;

  if (parts.length === 1) {
    // Format: SSs, e.g., '90s'
    const secondsMatch = timeString.match(/^(\d+)s$/i);
    if (secondsMatch) {
      milliseconds = parseInt(secondsMatch[1]) * 1000;
    } else {
      // Assume raw seconds if no 's' is present, e.g., '90'
      milliseconds = parseInt(timeString) * 1000;
    }
  } else if (parts.length === 2) {
    // Format: M:SS, e.g., '1:30'
    const minutes = parseInt(parts[0]);
    const seconds = parseInt(parts[1]);
    milliseconds = (minutes * 60 + seconds) * 1000;
  } else {
    // Invalid format
    return null;
  }
  return milliseconds;
}

// Slash Command Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member, guild } = interaction;
  const voiceChannel = member.voice.channel;
  const permissions = voiceChannel?.permissionsFor(client.user);

  // Check for VC
  if (['play', 'skip', 'stop', 'queue', 'nowplaying', 'pause', 'resume', 'shuffle', 'loop', 'volume', '247', 'seek', 'remove'].includes(commandName) && !voiceChannel) {
    return interaction.reply({ content: `${config.emojis.error} You must be in a voice channel to use this command.`, flags: 64 }); 
  }

  // Check for permissions (Connect and Speak)
  // FIX: Use PermissionFlagsBits.Connect and PermissionFlagsBits.Speak
  if (voiceChannel && (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak))) {
    return interaction.reply({ content: `${config.emojis.error} I need the **CONNECT** and **SPEAK** permissions in your voice channel.`, flags: 64 });
  }

  // Handle commands that don't require an existing player (other than 'play' and 'help')
  if (['help', 'play'].includes(commandName)) {
    // 'help' command
    if (commandName === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setTitle(`${client.user.username} Commands`)
        .setDescription('Use **/** for all commands.')
        .addFields(
          { name: '🎵 Music Commands', value: '`/play`, `/skip`, `/stop`, `/pause`, `/resume`, `/queue`, `/nowplaying`, `/shuffle`, `/loop`, `/volume`, `/247`, `/seek`, `/remove`' },
          { name: 'ℹ️ Utility', value: '`/help`' }
        )
        .setColor('#00ff00')
        .setFooter({ text: `Developed by Rick_Grimes | Support: ${config.support.server}`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      return interaction.reply({ embeds: [helpEmbed] });
    }

    // FIX: 'play' command updated for crash prevention and proper flow
    if (commandName === 'play') {
      // FIX: Wrap deferReply in try/catch to prevent bot crash on 10062 timeout
      try {
          await interaction.deferReply(); // Acknowledge the command first 
      } catch (e) {
          if (e.code === 10062) {
              // Interaction timed out before deferReply could be sent, gracefully stop command.
              console.error(`Interaction timeout (10062) on /play command from user ${member.user.tag}. Aborting command execution.`);
              return; 
          }
          // Re-throw other errors
          throw e; 
      }
      
      const query = options.getString('query');

      try {
        const player = await getOrCreatePlayer(interaction, voiceChannel);
        const searchResult = await kazagumo.search(query, { requester: member.user });

        if (!searchResult || !searchResult.tracks.length) {
          return interaction.editReply({ content: `${config.emojis.error} No results found for \`${query}\`.` });
        }

        const isPlaying = player.playing || player.paused;

        if (searchResult.type === 'PLAYLIST') {
          player.queue.add(searchResult.tracks);
          
          if (!isPlaying) {
            await player.play(); // Start playing if nothing is active
          }

          const playlistEmbed = new EmbedBuilder()
            .setDescription(`${config.emojis.queue} Added **${searchResult.tracks.length}** tracks from playlist [${searchResult.playlistName}](${query}) to the queue.`)
            .setColor('#0099ff');
          return interaction.editReply({ embeds: [playlistEmbed] });
        } else {
          const track = searchResult.tracks[0];
          player.queue.add(track);

          if (!isPlaying) {
            await player.play(); // Start playing if nothing is active
            const startingEmbed = new EmbedBuilder()
                .setDescription(`${config.emojis.success} Starting playback of **${track.title}**!`)
                .setColor('#00ff00');
            return interaction.editReply({ embeds: [startingEmbed] });
          }

          const addedEmbed = new EmbedBuilder()
            .setDescription(`${config.emojis.success} Added [${track.title}](${track.uri}) to the queue at position **#${player.queue.length}**.`)
            .setColor('#00ff00');
          return interaction.editReply({ embeds: [addedEmbed] });
        }
      } catch (error) {
        console.error('Play command error:', error);
        // Only attempt editReply if deferReply succeeded
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: `${config.emojis.error} An error occurred while trying to play the song.`, flags: 64 }).catch(() => null);
        }
      }
    }
  }

  // Commands that require an existing player
  const player = kazagumo.players.get(guild.id);

  if (!player) {
    return interaction.reply({ content: `${config.emojis.warning} There is no music currently playing in this guild.`, flags: 64 });
  }

  // Check if the user is in the same VC as the bot
  if (voiceChannel.id !== player.voiceId) {
    return interaction.reply({ content: `${config.emojis.error} You must be in the same voice channel as the bot to control it.`, flags: 64 });
  }


  // Command handlers
  try {
    switch (commandName) {
      case 'skip':
        if (player.queue.length > 0) {
          // FIX: Use current track title and check for existence
          const skippedTrackTitle = player.queue.current ? player.queue.current.title : 'the current song';
          await player.skip();
          interaction.reply({ content: `${config.emojis.skip} Skipped **${skippedTrackTitle}**.` });
        } else {
          player.destroy();
          interaction.reply({ content: `${config.emojis.stop} Skipped the last song and stopped the player.` });
        }
        break;

      case 'stop':
        player.destroy();
        interaction.reply({ content: `${config.emojis.stop} Music stopped and queue cleared.` });
        break;

      case 'pause':
        if (!player.paused) {
          player.pause(true);
          // CUSTOM MESSAGE: This Music Pause Now
          interaction.reply({ content: `${config.emojis.pause} **This Music Pause Now**` });
        } else {
          interaction.reply({ content: `${config.emojis.warning} Music is already paused.`, flags: 64 });
        }
        break;

      case 'resume':
        if (player.paused) {
          player.pause(false);
          // CUSTOM MESSAGE: This Music Resume Back
          interaction.reply({ content: `${config.emojis.resume} **This Music Resume Back**` });
        } else {
          interaction.reply({ content: `${config.emojis.warning} Music is not paused.`, flags: 64 });
        }
        break;

      case 'queue':
        const queueEmbed = new EmbedBuilder()
          .setTitle(`${config.emojis.queue} Queue for ${guild.name}`)
          .setColor('#0099ff')
          .setTimestamp();

        if (!player.queue.current) {
          queueEmbed.setDescription('The queue is empty.');
        } else {
          // FIX: Using msToTime
          const tracks = player.queue.map((track, index) => `${index + 1}. [${track.title}](${track.uri}) - \`[${msToTime(track.duration)}]\``).slice(0, 10);
          
          // FIX: Using msToTime for current track too
          queueEmbed.setDescription(`**Now Playing:** [${player.queue.current.title}](${player.queue.current.uri}) - \`[${msToTime(player.queue.current.duration)}]\`\n\n**Up Next:**\n${tracks.join('\n') || 'No more tracks in queue.'}`);

          if (player.queue.length > 10) {
            queueEmbed.setFooter({ text: `+${player.queue.length - 10} more tracks in queue.` });
          }
        }
        interaction.reply({ embeds: [queueEmbed] });
        break;

      case 'nowplaying':
        // Variable is safe here because it's inside a case block
        const currentTrack = player.queue.current; 

        if (!currentTrack) {
          return interaction.reply({ content: `${config.emojis.error} No music is currently playing.`, flags: 64 });
        }

        // FIX: Using msToTime
        const durationString = currentTrack.duration ? msToTime(currentTrack.duration) : 'N/A';
        const positionString = player.position ? msToTime(player.position) : '0:00';

        const npEmbed = new EmbedBuilder()
          .setTitle(`${config.emojis.nowplaying} Now Playing`)
          .setDescription(`[${currentTrack.title}](${currentTrack.uri}) - \`[${durationString}]\``)
          .setThumbnail(currentTrack.thumbnail || null)
          .addFields(
            { name: 'Requester', value: currentTrack.requester.tag, inline: true },
            { name: 'Progress', value: `${positionString} / ${durationString}`, inline: true },
            { name: 'Loop Mode', value: player.loop, inline: true }
          )
          .setColor('#0099ff')
          .setTimestamp();

        interaction.reply({ embeds: [npEmbed] });
        break;

      case 'shuffle':
        player.queue.shuffle();
        interaction.reply({ content: `${config.emojis.shuffle} Queue shuffled!` });
        break;

      case 'loop':
        const mode = options.getString('mode');
        player.setLoop(mode);
        interaction.reply({ content: `${config.emojis.loop} Loop mode set to **${mode}**.` });
        break;

      case 'volume':
        const level = options.getInteger('level');

        if (level !== null) {
          if (level < 0 || level > 100) {
            return interaction.reply({ content: `${config.emojis.error} Volume must be between 0 and 100.`, flags: 64 });
          }
          await player.setVolume(level);
          interaction.reply({ content: `${config.emojis.volume} Volume set to **${level}%**.` });
        } else {
          interaction.reply({ content: `${config.emojis.volume} Current volume is **${player.volume}%**.`, flags: 64 });
        }
        break;

      case '247':
        const current247 = player.data.get('twentyFourSeven');
        player.data.set('twentyFourSeven', !current247);
        const newState = player.data.get('twentyFourSeven') ? 'enabled' : 'disabled';
        
        interaction.reply({ content: `${config.emojis.success} 24/7 mode is now **${newState}**. The bot will ${newState === 'enabled' ? 'stay in the voice channel.' : 'disconnect when the queue is empty.'}` });
        break;
        
      // Seek Command Handler 
      case 'seek':
        const timeInput = options.getString('time');
        const seekTrack = player.queue.current; 

        if (!seekTrack || seekTrack.isStream) {
            return interaction.reply({ content: `${config.emojis.error} Cannot seek on a live stream.`, flags: 64 });
        }
        
        const seekTimeMs = timeToMilliseconds(timeInput);
        
        if (seekTimeMs === null || isNaN(seekTimeMs)) {
            return interaction.reply({ content: `${config.emojis.error} Invalid time format. Use M:SS (e.g., 1:30) or SSs (e.g., 90s).`, flags: 64 });
        }
        
        const totalDurationMs = seekTrack.duration; 

        if (seekTimeMs < 0 || seekTimeMs > totalDurationMs) {
            // FIX: Using msToTime
            return interaction.reply({ content: `${config.emojis.error} Seek time must be between 0 and ${msToTime(totalDurationMs)}.`, flags: 64 });
        }

        await player.seek(seekTimeMs);
        
        // FIX: Using msToTime
        const seekTimeFormatted = msToTime(seekTimeMs);
        
        interaction.reply({ content: `${config.emojis.seek} Seeked to **${seekTimeFormatted}** in the track.` });
        break;

      // NEW: Remove Command Handler
      case 'remove':
        const trackNumber = options.getInteger('number');
        const queueLength = player.queue.length;

        if (queueLength === 0) {
            return interaction.reply({ content: `${config.emojis.warning} The queue is empty. There are no tracks to remove.`, flags: 64 });
        }

        // Check if the number is within valid range (1 to queue length)
        if (trackNumber < 1 || trackNumber > queueLength) {
            return interaction.reply({ content: `${config.emojis.error} Invalid track number. The queue has ${queueLength} tracks.`, flags: 64 });
        }

        // trackNumber is 1-based, array index is 0-based.
        const trackIndex = trackNumber - 1; 
        
        // Get the track before splicing it out
        const trackToRemove = player.queue[trackIndex]; 
        
        // Remove the track at the specified index
        player.queue.splice(trackIndex, 1);

        const removedEmbed = new EmbedBuilder()
            .setDescription(`${config.emojis.success} Removed track **#${trackNumber}** from the queue: [${trackToRemove.title}](${trackToRemove.uri}).`)
            .setColor('#FF5733');
            
        interaction.reply({ embeds: [removedEmbed] });
        break;
    }
  } catch (error) {
    console.error(`Command ${commandName} error:`, error);
    interaction.reply({ content: `${config.emojis.error} An unexpected error occurred while executing the command.`, flags: 64 }).catch(() => null);
  }
});

// Button Interaction Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (!interaction.guild) return;

  const player = kazagumo.players.get(interaction.guildId);
  
  // Helper function to safely reply and handle 10062 timeout errors
  const handleTimeoutReply = async (content) => {
    try {
        await interaction.reply({ content, flags: 64 });
    } catch (e) {
        if (e.code === 10062) {
            console.error(`Interaction timeout (10062) on button check reply from user ${interaction.user.tag} in guild ${interaction.guild.name}. Aborting command.`);
            return true; // Indicate that the error was handled
        }
        throw e; // Re-throw other errors
    }
    return false; // Indicate that the reply succeeded
  };

  // 1. Player check
  if (!player) {
    if (await handleTimeoutReply(`${config.emojis.warning} There is no music currently playing.`)) return;
    return;
  }

  const member = interaction.member;

  // 2. Voice channel check
  if (!member.voice.channel || member.voice.channel.id !== player.voiceId) {
    if (await handleTimeoutReply(`${config.emojis.error} You must be in the same voice channel as the bot to use the controls.`)) return;
    return;
  }

  // Defer update here to prevent interaction failed error
  await interaction.deferUpdate();

  try {
    switch (interaction.customId) {
      case 'pause':
      case 'resume':
        player.pause(!player.paused);

        // Get the new state for the follow-up message (CUSTOM MESSAGES)
        const newStateMessage = player.paused ? 
            `${config.emojis.pause} **This Music Pause Now**` : 
            `${config.emojis.resume} **This Music Resume Back**`;
        
        // Send a temporary follow-up to provide feedback to the user
        await interaction.followUp({ content: newStateMessage, ephemeral: true });

        // --- Logic to change the button/emoji after pausing/resuming ---
        const messageToEdit = interaction.message; 
        if (messageToEdit && messageToEdit.editable) {
            
            // Ensure components exist before trying to read them
            if (messageToEdit.components && messageToEdit.components[0] && messageToEdit.components[0].components) {
                
                // Get existing row (components[0] is the ActionRow holding the buttons)
                const existingRow = ActionRowBuilder.from(messageToEdit.components[0]);
                
                const newComponents = existingRow.components.map(component => {
                    // Check for the pause or resume button
                    if (component.customId === 'pause' || component.customId === 'resume') {
                        
                        // After the toggle, check the player's new state
                        if (player.paused) {
                            // Player is paused, so the button should now offer to RESUME
                            return ButtonBuilder.from(component)
                                .setCustomId('resume')
                                .setLabel('Resume')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji(config.emojis.resume || '▶️');
                        } else {
                            // Player is playing, so the button should now offer to PAUSE
                            return ButtonBuilder.from(component)
                                .setCustomId('pause')
                                .setLabel('Pause')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji(config.emojis.pause || '⏸️');
                        }
                    }
                    // Keep other buttons as they are
                    return ButtonBuilder.from(component);
                });
                
                // Update the message with the new components
                const updatedRow = new ActionRowBuilder().addComponents(newComponents);
                await messageToEdit.edit({ components: [updatedRow] }).catch(err => console.error('Error editing message components:', err));
            }
        }
        // --- END Button Change Logic ---
        break;
      case 'skip':
        if (player.queue.length > 0) {
            await player.skip();
        } else {
            // If no more tracks, destroy the player
            player.destroy();
        }
        break;
      case 'stop':
        player.destroy();
        break;
      case 'loop':
        // Cycle through loop modes: none -> track -> queue -> none
        let newLoopMode = 'none';
        if (player.loop === 'none') {
          newLoopMode = 'track';
        } else if (player.loop === 'track') {
          newLoopMode = 'queue';
        }
        player.setLoop(newLoopMode);
        // Optional: send a temporary follow-up message to confirm loop change
        await interaction.followUp({ content: `${config.emojis.loop} Loop mode set to **${newLoopMode}**!`, flags: 64 });
        break;
      case 'shuffle':
        player.queue.shuffle();
        await interaction.followUp({ content: `${config.emojis.shuffle} Queue shuffled!`, flags: 64 });
        break;
    }
  } catch (error) {
    console.error('Button interaction error:', error);
    await interaction.followUp({ content: `${config.emojis.error} An error occurred while processing your request.`, flags: 64 });
  }
});

client.login(config.token);
