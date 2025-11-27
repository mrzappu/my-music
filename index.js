require('dotenv').config();
const config = require('./config');
// ADDED PermissionFlagsBits to imports
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType, StringSelectMenuBuilder, ChannelType, PermissionFlagsBits } = require('discord.js'); 

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
// These are hardcoded IDs for specific channels for bot notifications
const OWNER_ID = '809441570818359307';
const SONG_NOTIFICATION_CHANNEL_ID = '1411369713266589787'; 
const BOT_JOIN_NOTIFICATION_CHANNEL_ID = '1411369682459427006';
const MUSIC_STOPPED_CHANNEL_ID = '1393633652537163907';
const BOT_LEFT_SERVER_CHANNEL_ID = '1393633926031085669';


// --- NEW CONSTANTS FOR FEATURES ---
// This now uses the value from the updated config.js
const DJ_ROLE_NAME = config.musicControl.djRoleName; 
const BAR_LENGTH = 20;      // Length of the progress bar in characters
const PROGRESS_INTERVAL = 5000; // Update interval in milliseconds (5 seconds)
// ---------------------------------


// --- UTILITY FUNCTION: msToTime ---
/**
 * Converts milliseconds to a human-readable time string (M:SS or H:MM:SS).
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

// --- NEW UTILITY FUNCTION: createProgressBar (Dynamic Seek Bar) ---
/**
 * Generates a visual progress bar for the current track.
 * @param {KazagumoPlayer} player 
 * @param {boolean} isStream - Whether the track is a live stream.
 * @returns {string} The formatted progress bar string.
 */
function createProgressBar(player, isStream) {
    if (isStream) {
        return 'LIVE STREAM 🔴';
    }

    const duration = player.queue.current.duration;
    const position = player.position;
    
    if (!duration || duration === 0) return 'N/A';

    const percentage = position / duration;
    const progress = Math.round(BAR_LENGTH * percentage);
    
    // Create bar string: █ for filled, ░ for empty
    const bar = '█'.repeat(progress) + '░'.repeat(BAR_LENGTH - progress);
    
    // Format time strings
    const currentTime = msToTime(position);
    const totalTime = msToTime(duration);
    
    return `${currentTime} [${bar}] ${totalTime}`;
}
// -----------------------------------------------------------------

// --- NEW UTILITY FUNCTION: canControl (DJ Role System) ---
/**
 * Checks if a user has permission to control the player.
 * @param {import('discord.js').Interaction} interaction 
 * @param {KazagumoPlayer} player 
 * @returns {boolean} True if the user can control the player.
 */
function canControl(interaction, player) {
    const member = interaction.member;
    const isOwner = interaction.guild.ownerId === member.id;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    // Check for the configurable DJ role name
    const isDJ = member.roles.cache.some(role => role.name === DJ_ROLE_NAME);
    const isRequester = player.queue.current && player.queue.current.requester.id === member.id;

    if (isOwner || isAdmin || isDJ || isRequester) {
        return true;
    }
    
    interaction.reply({ 
        content: `${config.emojis.error} You need the **${DJ_ROLE_NAME}** role, Admin privileges, or be the song requester to use this command.`, 
        flags: 64 
    });
    return false;
}
// -------------------------------------------------------


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
        // FIX: Using msToTime utility
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
                { name: 'Server', value: `${guild.name}`, inline: true },
                { name: 'Voice Channel', value: `${vcName}`, inline: true }, // Add VC Info
                { name: 'Requested By', value: `${track.requester.tag}`, inline: true }
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


// --- NEW FUNCTION: Dynamic Progress Bar Updater ---
/**
 * Updates the 'Now Playing' message with the current progress bar and time.
 * @param {KazagumoPlayer} player 
 */
async function updateProgressBar(player) {
    const message = player.data.get('currentMessage');
    const currentTrack = player.queue.current;
    
    // Safety check: ensure track is playing and message exists
    if (!currentTrack || !message || player.paused) return;

    try {
        const isStream = currentTrack.isStream || currentTrack.duration === 0;
        const progressBar = createProgressBar(player, isStream);
        
        const currentEmbed = EmbedBuilder.from(message.embeds[0]);
        
        // Find the "Progress" field (which is the 4th field in the detailed embed, index 3)
        const progressFieldIndex = currentEmbed.data.fields.findIndex(f => f.name.includes('Progress'));

        if (progressFieldIndex !== -1) {
             // Update the Progress field
            currentEmbed.spliceFields(progressFieldIndex, 1, { name: 'Progress', value: `\`${progressBar}\``, inline: false });
            
            // Edit the message
            await message.edit({ embeds: [currentEmbed] }).catch(err => {
                // Ignore 10008 (Unknown Message) as it means the message was deleted
                if (err.code !== 10008) console.error('Error editing progress bar message:', err.message);
            });
        }
    } catch (error) {
        // If any error occurs, clear the interval to stop spamming updates
        const intervalId = player.data.get('progressInterval');
        if (intervalId) clearInterval(intervalId);
        player.data.delete('progressInterval');
        console.error('CRITICAL: Error updating progress bar, stopping interval:', error.message);
    }
}
// --------------------------------------------------


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

// Shoukaku (Lavalink) Events
shoukaku.on('ready', (name) => console.log(`Lavalink Node ${name}: Ready`));
shoukaku.on('error', (name, error) => console.error(`Lavalink Node ${name}: Error - ${error.message}`));
shoukaku.on('close', (name, code, reason) => console.warn(`Lavalink Node ${name}: Closed - Code ${code} | Reason: ${reason || 'No reason'}`));
shoukaku.on('disconnect', (name, players) => console.warn(`Lavalink Node ${name}: Disconnected | Affected players: ${players.size}`));
shoukaku.on('debug', (name, info) => console.debug(`Lavalink Node ${name}: Debug - ${info}`));

// Kazagumo (Music Player) Events
kazagumo.on('playerCreate', (player) => {
  console.log(`Player created for guild: ${player.guildId}`);
  player.data.set('twentyFourSeven', false); // Initialize 24/7 mode state
});

// MODIFIED: playerStart to implement the detailed embed and start the progress bar interval
kazagumo.on('playerStart', async (player, track) => {
  console.log(`Now playing: ${track.title} in guild: ${player.guildId}`);

  // Call the song play notification function (sends DM and Channel msg)
  songPlayNotification(player, track);

  try {
    const channel = client.channels.cache.get(player.textId);

    if (channel) {
      // Clear any existing progress bar interval before starting a new track
      const existingInterval = player.data.get('progressInterval');
      if (existingInterval) clearInterval(existingInterval);

      const isStream = track.isStream || track.duration === 0;
      const durationString = isStream ? 'LIVE STREAM' : msToTime(track.duration);
      const progressBar = createProgressBar(player, isStream);

      // --- START DETAILED EMBED FORMAT WITH PROGRESS BAR FIELD ---
      const embed = new EmbedBuilder()
        .setTitle(`${config.emojis.nowplaying} ${track.title}`)
        .setURL(track.uri)
        .setThumbnail(track.thumbnail || null)
        .setColor('#0099ff')
        .setDescription(':notes: Enjoying the vibes? Type more song names below to keep the party going!')
        .addFields(
          { name: 'Artist', value: `🎤 **${track.author || 'Unknown'}**`, inline: true },
          { name: 'Requested by', value: `👤 **${track.requester.tag}**`, inline: true },
          { name: 'Duration', value: `⏰ **${durationString}**`, inline: true },
          // The progress bar field
          { name: 'Progress', value: `\`${progressBar}\``, inline: false },
          { name: 'Loop', value: `⏺️ **${player.loop}**`, inline: true },
          { name: 'Volume', value: `🔊 **${player.volume}%**`, inline: true },
          { name: '\u200b', value: '\u200b', inline: true } // Empty field for spacing
        )
        .setTimestamp();
      // --- END DETAILED EMBED FORMAT ---

      // Create action row with control buttons (initial state: Pause)
      const controlsRow = new ActionRowBuilder()
        // The customId here will be 'pause' initially, but the button handler logic will change it to 'resume' if clicked while paused.
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
      
      // Start the progress bar update interval if not a stream
      if (!isStream) {
        const intervalId = setInterval(() => updateProgressBar(player), PROGRESS_INTERVAL);
        player.data.set('progressInterval', intervalId);
      }
    }
  } catch (err) {
    console.error('CRITICAL: Error handling playerStart event. Destroying player:', err);
    player.destroy(); 
  }
});

// MODIFIED: playerEnd to include Smart Autoplay logic and clear the interval
kazagumo.on('playerEnd', async (player) => {
  console.log(`Player ended for guild: ${player.guildId}`);

  // Clear the progress bar interval
  const intervalId = player.data.get('progressInterval');
  if (intervalId) clearInterval(intervalId);
  player.data.delete('progressInterval');

  // Get the message containing the last 'Now Playing' embed
  const message = player.data.get('currentMessage');
  
  // --- START SMART AUTOPLAY LOGIC ---
  if (!player.data.get('twentyFourSeven') && player.queue.length === 0) {
      const lastTrack = player.queue.previous;
      const channel = client.channels.cache.get(player.textId);

      // If a track was played previously, attempt to find a related one.
      if (lastTrack && !lastTrack.isStream) {
          try {
              // Search for a related track using the last played track's title
              const searchResult = await kazagumo.search(lastTrack.title, { 
                  requester: client.user, // Bot is the requester for autoplay
                  source: 'youtube' // Explicitly search YouTube for related tracks
              });

              // Filter out the exact same track
              const relatedTracks = searchResult.tracks.filter(t => t.uri !== lastTrack.uri);

              if (relatedTracks.length > 0) {
                  const autoplayTrack = relatedTracks[0];
                  player.queue.add(autoplayTrack); // Add the first related track
                  await player.play(); // Start playing it immediately
                  
                  const autoplayEmbed = new EmbedBuilder()
                      .setDescription(`✨ **Autoplay:** Queue ended, so I'm playing a related track: [${autoplayTrack.title}](${autoplayTrack.uri}).`)
                      .setColor('#32CD32');
                  
                  if (channel) await channel.send({ embeds: [autoplayEmbed] }).catch(console.error);
                  console.log(`Autoplay successful in guild ${player.guildId}: ${autoplayTrack.title}`);
                  return; // Stop here, Autoplay is handling the next track
              }
          } catch (e) {
              console.error(`Autoplay error in guild ${player.guildId}:`, e.message);
              // Fall through to destruction if autoplay fails
          }
      }
  // --- END SMART AUTOPLAY LOGIC ---

    // Standard Disconnect Logic (if Autoplay didn't fire or failed)
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

kazagumo.on('playerException', async (player, type, err) => {
  console.error(`Player exception (${type}) in guild: ${player.guildId}:`, err);

  try {
    const channel = client.channels.cache.get(player.textId);
    
    // FIX: Safely extract the error message with fallbacks
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

// MODIFIED: playerDestroy to clear the interval
kazagumo.on('playerDestroy', async (player) => {
  console.log(`Player destroyed for guild: ${player.guildId}`);

  // Clear the progress bar interval
  const intervalId = player.data.get('progressInterval');
  if (intervalId) clearInterval(intervalId);
  player.data.delete('progressInterval');
  
  // Send Music Stopped Notification (Feature 3)
  const reason = player.queue.current ? `Queue ended after playing: ${player.queue.current.title}` : 'Queue ended.';
  musicStoppedNotification(player.guildId, player.voiceId, reason);

  try {
    // Disable buttons on the last message
    const message = player.data.get('currentMessage');
    if (message && message.editable) {
      try {
        if (message.components && message.components[0] && message.components[0].components) {
          const disabledButtons = message.components[0].components.map(button => {
            return ButtonBuilder.from(button).setDisabled(true);
          });
          await message.edit({ components: [new ActionRowBuilder().addComponents(disabledButtons)] });
        }
      } catch (error) {
        console.error('Error disabling buttons in playerDestroy:', error);
      }
    }
  } catch (error) {
    console.error('Error in playerDestroy message cleanup:', error);
  }
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

// Slash Command Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member, guild } = interaction;
  const voiceChannel = member.voice.channel;
  const permissions = voiceChannel?.permissionsFor(client.user);

  // Check for VC
  if (['play', 'skip', 'stop', 'queue', 'nowplaying', 'pause', 'resume', 'shuffle', 'loop', 'volume', '247'].includes(commandName) && !voiceChannel) {
    return interaction.reply({ content: `${config.emojis.error} You must be in a voice channel to use this command.`, flags: 64 }); 
  }

  // Check for permissions (Connect and Speak)
  // FIX: Use PermissionFlagsBits.Connect and PermissionFlagsBits.Speak
  if (voiceChannel && (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak))) {
    return interaction.reply({ content: `${config.emojis.error} I need the **CONNECT** and **SPEAK** permissions in your voice channel.`, flags: 64 });
  }

  // Handle commands that don't require an existing player (other than 'play')
  if (['help', 'play'].includes(commandName)) {
    // 'help' command
    if (commandName === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setTitle(`${client.user.username} Commands`)
        .setDescription('Use **/** for all commands.')
        .addFields(
          { name: '🎵 Music Commands', value: '`/play`, `/skip`, `/stop`, `/pause`, `/resume`, `/queue`, `/nowplaying`, `/shuffle`, `/loop`, `/volume`, `/247`' },
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
      case 'stop':
      case 'pause':
      case 'resume':
      case 'shuffle':
      case 'loop':
      case 'volume':
      case '247':
        // --- NEW DJ/ROLE CHECK ---
        if (!canControl(interaction, player)) return;
        // -------------------------
        
        if (commandName === 'skip') {
            if (player.queue.length > 0) {
              const skippedTrackTitle = player.queue.current ? player.queue.current.title : 'the current song';
              await player.skip();
              interaction.reply({ content: `${config.emojis.skip} Skipped **${skippedTrackTitle}**.` });
            } else {
              player.destroy();
              interaction.reply({ content: `${config.emojis.stop} Skipped the last song and stopped the player.` });
            }
        } else if (commandName === 'stop') {
            player.destroy();
            interaction.reply({ content: `${config.emojis.stop} Music stopped and queue cleared.` });
        } else if (commandName === 'pause') {
            if (!player.paused) {
              player.pause(true);
              // CUSTOM MESSAGE: This Music Pause Now
              interaction.reply({ content: `${config.emojis.pause} **This Music Pause Now**` });
              // Clear progress bar interval when paused
              const intervalId = player.data.get('progressInterval');
              if (intervalId) clearInterval(intervalId);
              player.data.delete('progressInterval');
            } else {
              interaction.reply({ content: `${config.emojis.warning} Music is already paused.`, flags: 64 });
            }
        } else if (commandName === 'resume') {
            if (player.paused) {
              player.pause(false);
              // CUSTOM MESSAGE: This Music Resume Back
              interaction.reply({ content: `${config.emojis.resume} **This Music Resume Back**` });
               // Restart progress bar interval when resumed
              if (player.queue.current && !player.queue.current.isStream) {
                 const intervalId = setInterval(() => updateProgressBar(player), PROGRESS_INTERVAL);
                 player.data.set('progressInterval', intervalId);
              }
            } else {
              interaction.reply({ content: `${config.emojis.warning} Music is not paused.`, flags: 64 });
            }
        } else if (commandName === 'shuffle') {
            player.queue.shuffle();
            interaction.reply({ content: `${config.emojis.shuffle} Queue shuffled!` });
        } else if (commandName === 'loop') {
            const mode = options.getString('mode');
            player.setLoop(mode);
            interaction.reply({ content: `${config.emojis.loop} Loop mode set to **${mode}**.` });
        } else if (commandName === 'volume') {
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
        } else if (commandName === '247') {
            const current247 = player.data.get('twentyFourSeven');
            player.data.set('twentyFourSeven', !current247);
            const newState = player.data.get('twentyFourSeven') ? 'enabled' : 'disabled';
            
            interaction.reply({ content: `${config.emojis.success} 24/7 mode is now **${newState}**. The bot will ${newState === 'enabled' ? 'stay in the voice channel.' : 'disconnect when the queue is empty.'}` });
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
          // FIX: Use msToTime helper
          const tracks = player.queue.map((track, index) => `${index + 1}. [${track.title}](${track.uri}) - \`[${msToTime(track.duration)}]\``).slice(0, 10);
          
          // FIX: Use msToTime helper for current track too
          queueEmbed.setDescription(`**Now Playing:** [${player.queue.current.title}](${player.queue.current.uri}) - \`[${msToTime(player.queue.current.duration)}]\`\n\n**Up Next:**\n${tracks.join('\n') || 'No more tracks in queue.'}`);

          if (player.queue.length > 10) {
            queueEmbed.setFooter({ text: `+${player.queue.length - 10} more tracks in queue.` });
          }
        }
        interaction.reply({ embeds: [queueEmbed] });
        break;

      case 'nowplaying':
        if (!player.queue.current) {
          return interaction.reply({ content: `${config.emojis.error} No music is currently playing.`, flags: 64 });
        }

        const currentTrack = player.queue.current;
        // FIX: Use msToTime helper
        const durationString = currentTrack.duration ? msToTime(currentTrack.duration) : 'N/A';
        const progressBar = createProgressBar(player, currentTrack.isStream || currentTrack.duration === 0);


        const npEmbed = new EmbedBuilder()
          .setTitle(`${config.emojis.nowplaying} Now Playing`)
          .setDescription(`[${currentTrack.title}](${currentTrack.uri}) - \`[${durationString}]\``)
          .setThumbnail(currentTrack.thumbnail || null)
          .addFields(
            { name: 'Requester', value: currentTrack.requester.tag, inline: true },
            { name: 'Progress Bar', value: `\`${progressBar}\``, inline: false },
            { name: 'Loop Mode', value: player.loop, inline: true }
          )
          .setColor('#0099ff')
          .setTimestamp();

        interaction.reply({ embeds: [npEmbed] });
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

  // --- NEW DJ/ROLE CHECK (for all control buttons) ---
  if (!canControl(interaction, player)) return;
  // ---------------------------------------------------

  // Defer update here to prevent interaction failed error
  await interaction.deferUpdate();

  try {
    switch (interaction.customId) {
      case 'pause':
      case 'resume':
        player.pause(!player.paused);
        
        // Clear or restart interval
        const intervalId = player.data.get('progressInterval');
        if (player.paused && intervalId) {
            clearInterval(intervalId);
            player.data.delete('progressInterval');
        } else if (!player.paused && !intervalId && player.queue.current && !player.queue.current.isStream) {
            const newIntervalId = setInterval(() => updateProgressBar(player), PROGRESS_INTERVAL);
            player.data.set('progressInterval', newIntervalId);
        }

        // Get the new state for the follow-up message (CUSTOM MESSAGES)
        const newStateMessage = player.paused ? 
            `${config.emojis.pause} **This Music Pause Now**` : 
            `${config.emojis.resume} **This Music Resume Back**`;
        
        // Send a temporary follow-up to provide feedback to the user
        await interaction.followUp({ content: newStateMessage, ephemeral: true });

        // --- Logic to change the button/emoji after pausing/resuming ---
        const messageToEdit = interaction.message; 
        if (messageToEdit && messageToEdit.editable) {
            
            if (messageToEdit.components && messageToEdit.components[0] && messageToEdit.components[0].components) {
                
                const existingRow = ActionRowBuilder.from(messageToEdit.components[0]);
                
                const newComponents = existingRow.components.map(component => {
                    if (component.customId === 'pause' || component.customId === 'resume') {
                        if (player.paused) {
                            return ButtonBuilder.from(component)
                                .setCustomId('resume')
                                .setLabel('Resume')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji(config.emojis.resume || '▶️');
                        } else {
                            return ButtonBuilder.from(component)
                                .setCustomId('pause')
                                .setLabel('Pause')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji(config.emojis.pause || '⏸️');
                        }
                    }
                    return ButtonBuilder.from(component);
                });
                
                // Also update the volume and loop info in the embed, as the message is editable
                const updatedRow = new ActionRowBuilder().addComponents(newComponents);
                const currentEmbed = EmbedBuilder.from(messageToEdit.embeds[0]);
                
                // Find fields by name for safe updating
                const loopFieldIndex = currentEmbed.data.fields.findIndex(f => f.name.includes('Loop'));
                const volumeFieldIndex = currentEmbed.data.fields.findIndex(f => f.name.includes('Volume'));
                
                if (loopFieldIndex !== -1) currentEmbed.spliceFields(loopFieldIndex, 1, { name: 'Loop', value: `⏺️ **${player.loop}**`, inline: true });
                if (volumeFieldIndex !== -1) currentEmbed.spliceFields(volumeFieldIndex, 1, { name: 'Volume', value: `🔊 **${player.volume}%**`, inline: true });


                // Also force a progress bar update immediately if resuming
                if (!player.paused && player.queue.current && !player.queue.current.isStream) {
                    const progressBar = createProgressBar(player, false);
                    const progressFieldIndex = currentEmbed.data.fields.findIndex(f => f.name.includes('Progress'));
                    if (progressFieldIndex !== -1) currentEmbed.spliceFields(progressFieldIndex, 1, { name: 'Progress', value: `\`${progressBar}\``, inline: false });
                }
                
                await messageToEdit.edit({ embeds: [currentEmbed], components: [updatedRow] }).catch(err => console.error('Error editing message components/embeds:', err));
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
        
        // Update the embed instantly on the button press
        if (interaction.message && interaction.message.editable) {
             const currentEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
             // Update the Loop field 
             const loopFieldIndex = currentEmbed.data.fields.findIndex(f => f.name.includes('Loop'));
             if (loopFieldIndex !== -1) currentEmbed.spliceFields(loopFieldIndex, 1, { name: 'Loop', value: `⏺️ **${newLoopMode}**`, inline: true });
             await interaction.message.edit({ embeds: [currentEmbed] }).catch(err => console.error('Error editing embed on loop press:', err));
        }

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

// FIX: Renamed 'ready' to 'clientReady' here as well
client.login(config.token);
