require('dotenv').config();
const config = require('./config');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType, StringSelectMenuBuilder } = require('discord.js');

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
// Channel ID for music stopped notifications (NEW)
const MUSIC_STOPPED_CHANNEL_ID = '1393633652537163907';
// Channel ID for bot left server notifications (NEW)
const BOT_LEFT_SERVER_CHANNEL_ID = '1393633926031085669';

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

    // --- 1. Owner DM ---
    const ownerUser = await client.users.fetch(OWNER_ID);
    
    const ownerEmbed = new EmbedBuilder()
      .setTitle(`${config.emojis.nowplaying} New Song Started! (DM)`)
      .setDescription(`**[${track.title}](${track.uri})**`)
      .addFields(
        { name: 'Server', value: `${guild.name} (\`${guild.id}\`)`, inline: false },
        { name: 'Requested By', value: `${track.requester.tag} (\`${track.requester.id}\`)`, inline: true },
        { name: 'Duration', value: track.duration && track.duration.asString ? `\`${track.duration.asString()}\`` : '`N/A`', inline: true }
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
            .setTitle(`${config.emojis.nowplaying} Song Played on External Server`)
            .setDescription(`**[${track.title}](${track.uri})**`)
            .addFields(
                { name: 'Server', value: `${guild.name}`, inline: true },
                { name: 'Requested By', value: `${track.requester.tag}`, inline: true }
            )
            .setColor('#4CAF50') 
            .setTimestamp();
            
        await songNotificationChannel.send({ embeds: [channelEmbed] }).catch(err => console.error(`Failed to send channel message: ${err.message}`));
        console.log(`Sent 'Now Playing' notification to official song channel.`);
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
 * @param {string} reason 
 */
async function musicStoppedNotification(guildId, reason = 'Bot disconnected or music was manually stopped.') {
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

        const embed = new EmbedBuilder()
            .setTitle('🛑 Music Playback Stopped')
            .setDescription(`Music playback stopped in **${serverName}** (\`${guildId}\`).`)
            .addFields(
                { name: 'Reason', value: reason, inline: true },
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

// --- FEATURE 2: Guild Create Notification ---
client.on('guildCreate', async (guild) => {
  try {
    // --- 1. Owner DM ---
    const ownerUser = await client.users.fetch(OWNER_ID);

    const inviteEmbedOwner = new EmbedBuilder()
      .setTitle('🎉 Bot Added to New Server! (DM)')
      .setDescription(`The bot has been invited to a new guild!`)
      .addFields(
        { name: 'Server Name', value: guild.name, inline: true },
        { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
        { name: 'Member Count', value: `${guild.memberCount}`, inline: true },
        { name: 'Owner', value: `${(await guild.fetchOwner()).user.tag} (\`${guild.ownerId}\`)`, inline: false },
        { name: 'Total Servers', value: `${client.guilds.cache.size}`, inline: true }
      )
      .setThumbnail(guild.iconURL({ dynamic: true }))
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
            .setTitle('🚀 Bot Joined New Server')
            .setDescription(`The bot has been invited to a new server!`)
            .addFields(
                { name: 'Server Name', value: guild.name, inline: true },
                { name: 'Member Count', value: `${guild.memberCount}`, inline: true },
                { name: 'Total Servers', value: `${client.guilds.cache.size}`, inline: false }
            )
            .setColor('#00FFFF') 
            .setTimestamp();
            
        await joinNotificationChannel.send({ embeds: [channelInviteEmbed] }).catch(err => console.error(`Failed to send channel message on guildCreate: ${err.message}`));
        console.log(`Sent 'Guild Create' notification to official bot join channel.`);
    }

  } catch (error) {
    console.error('Error sending guildCreate notification:', error);
  }
});

// --- FEATURE 4: Guild Delete Notification ---
client.on('guildDelete', async (guild) => {
  try {
    // --- 1. Owner DM ---
    const ownerUser = await client.users.fetch(OWNER_ID);

    const leftEmbedOwner = new EmbedBuilder()
      .setTitle('❌ Bot Left Server! (DM)')
      .setDescription(`The bot has been removed from a guild.`)
      .addFields(
        { name: 'Server Name', value: guild.name, inline: true },
        { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
        { name: 'Member Count (Before leaving)', value: `${guild.memberCount}`, inline: true },
        { name: 'New Total Servers', value: `${client.guilds.cache.size}`, inline: false }
      )
      .setThumbnail(guild.iconURL({ dynamic: true }))
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
            .setTitle('📉 Bot Left Server')
            .setDescription(`The bot has been removed from a server.`)
            .addFields(
                { name: 'Server Name', value: guild.name, inline: true },
                { name: 'Total Servers Now', value: `${client.guilds.cache.size}`, inline: true }
            )
            .setColor('#FF8C00') 
            .setTimestamp();
            
        await leftNotificationChannel.send({ embeds: [channelLeftEmbed] }).catch(err => console.error(`Failed to send channel message on guildDelete: ${err.message}`));
        console.log(`Sent 'Guild Delete' notification to official bot left channel.`);
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

// FIX: Robust playerStart to ensure 'Now Playing' message is sent and handles missing duration
kazagumo.on('playerStart', async (player, track) => {
  console.log(`Now playing: ${track.title} in guild: ${player.guildId}`);

  // --- NEW: Call the song play notification function (sends DM and Channel msg) ---
  songPlayNotification(player, track);
  // -------------------------------------------------------------------------------

  try {
    const channel = client.channels.cache.get(player.textId);

    if (channel) {
      // FIX APPLIED: Safely check for track duration
      const durationString = track.duration && track.duration.asString ? track.duration.asString() : 'N/A';

      // Create the "Now Playing" embed
      const embed = new EmbedBuilder()
        .setTitle(`${config.emojis.nowplaying} Now Playing`)
        .setDescription(`[${track.title}](${track.uri}) - \`${durationString}\``)
        .setThumbnail(track.thumbnail || null)
        .setColor('#0099ff')
        .setFooter({ text: `Requested by ${track.requester.tag}`, iconURL: track.requester.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      // Create action row with control buttons
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

kazagumo.on('playerException', async (player, type, err) => {
  console.error(`Player exception (${type}) in guild: ${player.guildId}:`, err);

  try {
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
      const exceptionEmbed = new EmbedBuilder()
        .setTitle('⚠️ Player Error')
        .setDescription(`An error occurred while playing music: \`${err.message}\``)
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

kazagumo.on('playerDestroy', async (player) => {
  console.log(`Player destroyed for guild: ${player.guildId}`);

  // --- NEW: Send Music Stopped Notification (Feature 3) ---
  musicStoppedNotification(player.guildId);
  // --------------------------------------------------------

  try {
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
  // Using flags: 64 for MessageFlags.Ephemeral
  if (['play', 'skip', 'stop', 'queue', 'nowplaying', 'pause', 'resume', 'shuffle', 'loop', 'volume', '247'].includes(commandName) && !voiceChannel) {
    return interaction.reply({ content: `${config.emojis.error} You must be in a voice channel to use this command.`, flags: 64 }); 
  }

  // Check for permissions (Connect and Speak)
  if (voiceChannel && (!permissions.has('Connect') || !permissions.has('Speak'))) {
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

    // FIX: 'play' command updated for proper flow and response
    if (commandName === 'play') {
      await interaction.deferReply(); // Acknowledge the command first 
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
            // NOTE: The 'Now Playing' message will be sent by the 'playerStart' event
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
        return interaction.editReply({ content: `${config.emojis.error} An error occurred while trying to play the song.`, flags: 64 });
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
          await player.skip();
          interaction.reply({ content: `${config.emojis.skip} Skipped **${player.queue.current.title}**.` });
        } else {
          // If queue is empty, destroy the player
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
          interaction.reply({ content: `${config.emojis.pause} Music paused.` });
        } else {
          interaction.reply({ content: `${config.emojis.warning} Music is already paused.`, flags: 64 });
        }
        break;

      case 'resume':
        if (player.paused) {
          player.pause(false);
          interaction.reply({ content: `${config.emojis.resume} Music resumed.` });
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
          const tracks = player.queue.map((track, index) => `${index + 1}. [${track.title}](${track.uri}) - \`[${track.duration.asString()}]\``).slice(0, 10);
          queueEmbed.setDescription(`**Now Playing:** [${player.queue.current.title}](${player.queue.current.uri}) - \`[${player.queue.current.duration.asString()}]\`\n\n**Up Next:**\n${tracks.join('\n') || 'No more tracks in queue.'}`);

          if (player.queue.length > 10) {
            queueEmbed.setFooter({ text: `+${player.queue.length - 10} more tracks in queue.` });
          }
        }
        interaction.reply({ embeds: [queueEmbed] });
        break;

      // FIX: 'nowplaying' command updated to safely check for asString()
      case 'nowplaying':
        if (!player.queue.current) {
          return interaction.reply({ content: `${config.emojis.error} No music is currently playing.`, flags: 64 });
        }

        const currentTrack = player.queue.current;
        const durationString = currentTrack.duration && currentTrack.duration.asString ? currentTrack.duration.asString() : 'N/A';
        const positionString = player.position ? KazagumoTrack.formatedLength(player.position) : '0:00';

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
  if (!player) return interaction.reply({ content: `${config.emojis.warning} There is no music currently playing.`, flags: 64 });

  const member = interaction.member;
  if (!member.voice.channel || member.voice.channel.id !== player.voiceId) {
    return interaction.reply({ content: `${config.emojis.error} You must be in the same voice channel as the bot to use the controls.`, flags: 64 });
  }

  await interaction.deferUpdate();

  try {
    switch (interaction.customId) {
      case 'pause':
      case 'resume':
        player.pause(!player.paused);
        break;
      case 'skip':
        if (player.queue.length > 0) {
            await player.skip();
        } else {
            // If no more tracks, destroy the player
            player.destroy();
            // Edit the last message to disable buttons after stop
            if (interaction.message && interaction.message.editable) {
                const disabledButtons = interaction.message.components[0].components.map(button => 
                    ButtonBuilder.from(button).setDisabled(true)
                );
                await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(disabledButtons)] });
            }
        }
        break;
      case 'stop':
        player.destroy();
        // Edit the last message to disable buttons
        if (interaction.message && interaction.message.editable) {
            const disabledButtons = interaction.message.components[0].components.map(button => 
                ButtonBuilder.from(button).setDisabled(true)
            );
            await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(disabledButtons)] });
        }
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

// FIX: Renamed 'ready' to 'clientReady' here as well
client.login(config.token);
