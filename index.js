require('dotenv').config();
const config = require('./config');
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

// Use constants from config for owner and channel IDs
const OWNER_ID = config.OWNER_ID;
const LOG_CHANNEL_ID = config.LOG_CHANNEL_ID;
const JOIN_CHANNEL_ID = config.JOIN_CHANNEL_ID;
const LEAVE_CHANNEL_ID = config.LEAVE_CHANNEL_ID;
const SONG_NOTIFICATION_CHANNEL_ID = config.SONG_NOTIFICATION_CHANNEL_ID;

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
  },
  plugins: [],
}, new Connectors.DiscordJS(client), config.lavalink.nodes);

// --- Utility Functions for Notifications ---

/**
 * Sends a detailed notification about a playing song to the bot owner and official channel.
 * @param {import('kazagumo').KazagumoPlayer} player 
 * @param {import('kazagumo').KazagumoTrack} track 
 */
async function songPlayNotification(player, track) {
  const guild = client.guilds.cache.get(player.guildId);
  if (!guild) return;

  const notificationEmbed = new EmbedBuilder()
    .setTitle(`${config.emojis.nowplaying} Now Playing!`)
    .setDescription(`**Track:** [${track.title}](${track.uri})\n**Guild:** ${guild.name} (\`${guild.id}\`)`)
    .addFields(
      { name: 'Duration', value: `\`${KazagumoTrack.formatedLength(track.duration)}\``, inline: true },
      { name: 'Requested by', value: `${track.requester}`, inline: true }
    )
    .setColor('#0099ff')
    .setTimestamp();

  // 1. Notify Bot Owner
  try {
    const owner = await client.users.fetch(OWNER_ID);
    if (owner) {
      owner.send({ embeds: [notificationEmbed.setTitle('Owner Notification: Song Started')] }).catch(console.error);
    }
  } catch (error) {
    console.error('Error sending song notification to owner:', error);
  }

  // 2. Notify Official Server Channel
  if (SONG_NOTIFICATION_CHANNEL_ID) {
    const channel = client.channels.cache.get(SONG_NOTIFICATION_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      channel.send({ embeds: [notificationEmbed.setTitle('🎶 Song Started: Official Log')] }).catch(console.error);
    }
  }
}

/**
 * Sends a notification when a music player is destroyed.
 * @param {import('kazagumo').KazagumoPlayer} player 
 * @param {string} reason 
 */
async function musicStoppedNotification(player, reason) {
  if (!LOG_CHANNEL_ID) return;

  const guild = client.guilds.cache.get(player.guildId);
  if (!guild) return;

  const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel || !logChannel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle('Music Playback Stopped')
    .setDescription(`Playback in **${guild.name}** has stopped.`)
    .addFields(
      { name: 'Reason', value: reason, inline: true },
      { name: 'Guild ID', value: `\`${guild.id}\``, inline: true }
    )
    .setColor('#ff9900')
    .setTimestamp();

  logChannel.send({ embeds: [embed] }).catch(console.error);
}

// --- Kazagumo Events ---
kazagumo.on('playerStart', (player, track) => {
  player.textChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`${config.emojis.play} Started Playing`)
        .setDescription(`[${track.title}](${track.uri})`)
        .addFields(
          { name: 'Duration', value: `\`${KazagumoTrack.formatedLength(track.duration)}\``, inline: true },
          { name: 'Requested by', value: `${track.requester}`, inline: true }
        )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pause').setLabel('Pause').setStyle(ButtonStyle.Secondary).setEmoji(config.emojis.pause),
        new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary).setEmoji(config.emojis.skip),
        new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger).setEmoji(config.emojis.stop),
        new ButtonBuilder().setCustomId('loop').setLabel('Loop').setStyle(ButtonStyle.Secondary).setEmoji(config.emojis.loop),
        new ButtonBuilder().setCustomId('shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Secondary).setEmoji(config.emojis.shuffle),
      ),
    ]
  }).then(msg => {
    // Store the message ID for later deletion/editing
    if (player.previousMessage) {
      player.previousMessage.delete().catch(console.error);
    }
    player.previousMessage = msg;
  }).catch(console.error);

  songPlayNotification(player, track);
});

kazagumo.on('playerEnd', (player, track) => {
  if (player.twentyFourSeven) return; // Keep player if 24/7 mode is on

  if (player.queue.length === 0) {
    if (player.previousMessage) {
      // Disable buttons on the last message
      const disabledButtons = player.previousMessage.components[0].components.map(button => 
        ButtonBuilder.from(button).setDisabled(true)
      );
      player.previousMessage.edit({ components: [new ActionRowBuilder().addComponents(disabledButtons)] }).catch(console.error);

      player.previousMessage.channel.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(`${config.emojis.queue} Queue ended. Disconnecting...`)
            .setColor('#ff0000')
        ]
      }).then(msg => setTimeout(() => msg.delete().catch(console.error), 5000)).catch(console.error);
    }

    player.destroy();
  }
});

kazagumo.on('playerDestroy', (player, reason) => {
  musicStoppedNotification(player, reason.type || 'Manual Stop or Error');
  if (player.previousMessage && player.previousMessage.editable) {
    const disabledButtons = player.previousMessage.components[0].components.map(button => 
        ButtonBuilder.from(button).setDisabled(true)
    );
    player.previousMessage.edit({ components: [new ActionRowBuilder().addComponents(disabledButtons)] }).catch(console.error);
  }
});

kazagumo.on('playerError', (player, error) => {
  console.error('Kazagumo Player Error:', error);
  if (player.textChannel) {
    player.textChannel.send(`${config.emojis.error} An error occurred during playback: \`${error.message}\``).catch(console.error);
  }
});

// --- Discord Client Events ---
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setActivity(config.activity.name, { type: ActivityType[config.activity.type] });

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

    // --- NEW COMMANDS ---
    new SlashCommandBuilder().setName('seek').setDescription('Seeks to a specific time in the current song.')
      .addStringOption(option =>
        option.setName('time')
          .setDescription('Time in seconds or MM:SS format (e.g., 90 or 1:30)')
          .setRequired(true)),
    new SlashCommandBuilder().setName('remove').setDescription('Removes a song from the queue by its index.')
      .addIntegerOption(option =>
        option.setName('index')
          .setDescription('The number of the song to remove from the /queue list.')
          .setRequired(true)
          .setMinValue(1)),
    new SlashCommandBuilder().setName('clear').setDescription('Clears all tracks from the queue.'),
    // --- END NEW COMMANDS ---
    
    new SlashCommandBuilder().setName('247').setDescription('Toggles 24/7 mode (keeps bot in VC even when queue ends).'),
    new SlashCommandBuilder().setName('help').setDescription('Shows the list of commands.'),
    new SlashCommandBuilder().setName('about').setDescription('Shows information about the bot and helpful links.'),
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(config.token);

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
});

// Helper function to create/get player and check VC status
async function getOrCreatePlayer(interaction) {
  const { guild, member } = interaction;
  const voiceChannel = member.voice.channel;
  const permissions = voiceChannel.permissionsFor(guild.members.me);

  if (!voiceChannel) {
    await interaction.reply({ content: `${config.emojis.error} You must be in a voice channel to use this command!`, ephemeral: true });
    return null;
  }
  if (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
    await interaction.reply({ content: `${config.emojis.error} I need the **Connect** and **Speak** permissions in your voice channel!`, ephemeral: true });
    return null;
  }

  let player = kazagumo.players.get(guild.id);
  if (player && player.voiceId && player.voiceId !== voiceChannel.id) {
    await interaction.reply({ content: `${config.emojis.warn} I'm already playing in another voice channel!`, ephemeral: true });
    return null;
  }
  
  if (!player) {
    player = await kazagumo.createPlayer({
      guildId: guild.id,
      textId: interaction.channelId,
      voiceId: voiceChannel.id,
      volume: 50,
      deaf: true,
      twentyFourSeven: false, // Initial state
    });
  }

  // If a player exists, update text channel and move if needed (though the check above should prevent moving)
  if (player.textId !== interaction.channelId) {
    player.textId = interaction.channelId;
  }

  return player;
}


// --- Slash Command Interaction Handler ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand() && !interaction.isButton()) return;

  const { guild } = interaction;
  if (!guild) return;

  const commandName = interaction.commandName;

  try {
    // Handle commands that don't require an existing player (other than 'play')
    if (['help', 'play', 'about'].includes(commandName)) {
      
      // --- 'help' command with Select Menu ---
      if (commandName === 'help') {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('help_select')
          .setPlaceholder('Select a command for detailed help...')
          .addOptions(
            { label: 'Play', description: 'Plays a song or adds it to the queue.', value: 'help_play', emoji: config.emojis.play },
            { label: 'Stop', description: 'Stops the music and clears the queue.', value: 'help_stop', emoji: config.emojis.stop },
            { label: 'Skip', description: 'Skips the current song.', value: 'help_skip', emoji: config.emojis.skip },
            // NEW OPTIONS
            { label: 'Seek', description: 'Jump to a specific time in the current song.', value: 'help_seek', emoji: config.emojis.seek },
            { label: 'Remove', description: 'Removes a specific song from the queue.', value: 'help_remove', emoji: config.emojis.remove },
            { label: 'Clear Queue', description: 'Removes all songs from the queue.', value: 'help_clear', emoji: config.emojis.clear },
            // END NEW OPTIONS
            { label: 'Loop', description: 'Sets the loop mode (track/queue/none).', value: 'help_loop', emoji: config.emojis.loop },
            { label: 'Volume', description: 'Adjusts the player volume (0-100).', value: 'help_volume', emoji: config.emojis.volume },
            { label: 'Queue', description: 'Displays the current song queue.', value: 'help_queue', emoji: config.emojis.queue },
            { label: 'Utility', description: 'General info and bot statistics.', value: 'help_utility', emoji: config.emojis.stats }
          );
          
        const actionRow = new ActionRowBuilder().addComponents(selectMenu);
          
        const helpEmbed = new EmbedBuilder()
          .setTitle(`${client.user.username} Command Guide`)
          .setDescription('Hello! Use the select menu below to find detailed help and usage examples for any command.')
          .setColor('#00ff00')
          .setFooter({ text: `Developed by Rick_Grimes | Support: ${config.support.server}`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
          .setTimestamp();

        return interaction.reply({ embeds: [helpEmbed], components: [actionRow] });
      }

      // --- /about Command Handler ---
      if (commandName === 'about') {
        const inviteURL = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
        const websiteURL = 'https://infinity-music-bot.com'; 

        const aboutEmbed = new EmbedBuilder()
            .setTitle(`🎶 About ${client.user.username}`)
            .setDescription(`**${client.user.username}** is an advanced Discord music bot powered by **Lavalink** and **Kazagumo**, offering high-quality, stable, and feature-rich music playback.`)
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'Developer', value: `<@${OWNER_ID}>`, inline: true },
                { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
                { name: 'Uptime', value: `\`${Math.floor(client.uptime / 1000)}\` seconds`, inline: true },
                { name: 'Library', value: 'discord.js v14', inline: true },
                { name: 'Engine', value: 'Kazagumo / Shoukaku', inline: true },
                { name: 'Support', value: `[Join our server](${config.support.server})`, inline: true }
            )
            .setColor('#7289DA')
            .setFooter({ text: `Version ${require('./package.json').version}`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();

        // Button Action Row
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Invite Me')
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(config.emojis.invite)
                    .setURL(inviteURL),
                new ButtonBuilder()
                    .setLabel('Support Server')
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(config.emojis.support)
                    .setURL(config.support.server),
                new ButtonBuilder()
                    .setLabel('Website')
                    .setStyle(ButtonStyle.Link)
                    .setEmoji('🔗')
                    .setURL(websiteURL),
            );

        return interaction.reply({ embeds: [aboutEmbed], components: [buttonRow] });
    }

      // 'play' command
      if (commandName === 'play') {
        const query = interaction.options.getString('query');
        const player = await getOrCreatePlayer(interaction);
        if (!player) return;

        await interaction.deferReply();

        const result = await kazagumo.search(query, { requester: interaction.member });

        if (!result.tracks.length) {
          return interaction.editReply({ content: `${config.emojis.error} No results found for \`${query}\`.` });
        }

        const track = result.tracks[0];

        if (result.type === 'PLAYLIST') {
          player.queue.add(result.tracks);
          await interaction.editReply({ 
            embeds: [
              new EmbedBuilder()
                .setColor('#0099ff')
                .setDescription(`${config.emojis.success} Added **${result.tracks.length} tracks** from playlist [${result.playlistName}](${track.uri}) to the queue.`)
            ]
          });
        } else {
          player.queue.add(track);
          await interaction.editReply({ 
            embeds: [
              new EmbedBuilder()
                .setColor('#0099ff')
                .setDescription(`${config.emojis.success} Added [${track.title}](${track.uri}) to the queue.`)
            ]
          });
        }

        if (!player.playing && !player.paused) {
          player.play();
        }
      }
      
      return; // Exit if command was handled above
    }

    // Commands that require an existing player
    const player = kazagumo.players.get(guild.id);
    if (!player) {
      return interaction.reply({ content: `${config.emojis.error} There is no music playing in this guild!`, ephemeral: true });
    }

    // Check if user is in the same VC
    if (interaction.member.voice.channelId !== player.voiceId) {
      return interaction.reply({ content: `${config.emojis.error} You must be in the same voice channel as the bot!`, ephemeral: true });
    }

    await interaction.deferReply();

    switch (commandName) {
      case 'skip':
        player.skip();
        await interaction.editReply({ content: `${config.emojis.skip} Skipped the current song.` });
        break;

      case 'stop':
        player.destroy();
        await interaction.editReply({ content: `${config.emojis.stop} Music stopped and queue cleared.` });
        break;

      case 'queue':
        const queueEmbed = new EmbedBuilder()
          .setTitle(`${config.emojis.queue} Queue for ${guild.name}`)
          .setColor('#800080');

        const tracks = player.queue.map((t, i) => `${i + 1}. [${t.title}](${t.uri}) (${KazagumoTrack.formatedLength(t.duration)}) - ${t.requester}`);
        const currentTrack = player.queue.current ? `**1. [${player.queue.current.title}](${player.queue.current.uri}) (${KazagumoTrack.formatedLength(player.queue.current.duration)}) - ${player.queue.current.requester}** (Now Playing)` : 'No song currently playing.';

        const totalQueueLength = player.queue.length;

        if (totalQueueLength === 0) {
          queueEmbed.setDescription(currentTrack + '\n\nThe queue is empty.');
        } else {
          const queueList = tracks.slice(0, 10).join('\n'); // Show first 10
          queueEmbed.setDescription(currentTrack + '\n\n' + queueList);
          if (totalQueueLength > 10) {
            queueEmbed.setFooter({ text: `...and ${totalQueueLength - 10} more songs in the queue.` });
          }
        }
        await interaction.editReply({ embeds: [queueEmbed] });
        break;

      case 'nowplaying':
        const current = player.queue.current;
        if (!current) {
          return interaction.editReply({ content: `${config.emojis.error} No song is currently playing.` });
        }

        const npEmbed = new EmbedBuilder()
          .setTitle(`${config.emojis.nowplaying} Now Playing`)
          .setDescription(`[${current.title}](${current.uri})`)
          .addFields(
            { name: 'Duration', value: `\`${KazagumoTrack.formatedLength(current.duration)}\``, inline: true },
            { name: 'Requested by', value: `${current.requester}`, inline: true },
            { name: 'Volume', value: `${player.volume}%`, inline: true },
          )
          .setColor('#ffc0cb')
          .setTimestamp();

        await interaction.editReply({ embeds: [npEmbed] });
        break;

      case 'pause':
        if (player.paused) {
          return interaction.editReply({ content: `${config.emojis.warn} The player is already paused.` });
        }
        player.pause(true);
        await interaction.editReply({ content: `${config.emojis.pause} Music paused.` });
        break;

      case 'resume':
        if (!player.paused) {
          return interaction.editReply({ content: `${config.emojis.warn} The player is not paused.` });
        }
        player.pause(false);
        await interaction.editReply({ content: `${config.emojis.resume} Music resumed.` });
        break;

      case 'shuffle':
        player.queue.shuffle();
        await interaction.editReply({ content: `${config.emojis.shuffle} Queue shuffled!` });
        break;

      case 'loop':
        const mode = interaction.options.getString('mode');
        player.setLoop(mode);
        await interaction.editReply({ content: `${config.emojis.loop} Loop mode set to **${mode}**!` });
        break;

      case 'volume':
        const level = interaction.options.getInteger('level');
        if (level === null) {
          return interaction.editReply({ content: `${config.emojis.volume} The current volume is **${player.volume}%**.` });
        }
        player.setVolume(level);
        await interaction.editReply({ content: `${config.emojis.volume} Volume set to **${level}%**!` });
        break;
        
      // --- NEW COMMAND IMPLEMENTATIONS ---
      case 'clear':
        if (player.queue.length === 0) {
          return interaction.editReply({ content: `${config.emojis.warn} The queue is already empty.` });
        }
        player.queue.clear();
        await interaction.editReply({ content: `${config.emojis.clear} The queue has been cleared!` });
        break;

      case 'remove':
        const removeIndex = interaction.options.getInteger('index');
        const actualIndex = removeIndex - 1; 

        if (actualIndex < 0 || actualIndex >= player.queue.length) {
          return interaction.editReply({ content: `${config.emojis.error} Invalid queue index (\`${removeIndex}\`). Use \`/queue\` to see the list.` });
        }
        
        const removedTrack = player.queue.splice(actualIndex, 1)[0];
        await interaction.editReply({ content: `${config.emojis.remove} Removed song **${removeIndex}. [${removedTrack.title}](${removedTrack.uri})** from the queue.` });
        break;

      case 'seek':
        const timeInput = interaction.options.getString('time');
        const currentDuration = player.queue.current.duration;
        
        let positionMs;
        
        // Time parsing: supports pure seconds or MM:SS/HH:MM:SS format
        if (timeInput.includes(':')) {
          const parts = timeInput.split(':').map(Number);
          let seconds = 0;
          if (parts.length === 2) { // MM:SS
            seconds = parts[0] * 60 + parts[1];
          } else if (parts.length === 3) { // HH:MM:SS
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          } else {
            return interaction.editReply({ content: `${config.emojis.error} Invalid time format. Use \`seconds\` or \`MM:SS\`.` });
          }
          positionMs = seconds * 1000;
        } else {
          // Assume time is in seconds
          positionMs = Number(timeInput) * 1000;
        }

        if (isNaN(positionMs) || positionMs < 0 || positionMs > currentDuration) {
          return interaction.editReply({ content: `${config.emojis.error} Invalid time format or position is outside the song's duration (\`0 - ${KazagumoTrack.formatedLength(currentDuration)}\`).` });
        }

        await player.seek(positionMs);
        const soughtTime = KazagumoTrack.formatedLength(positionMs);
        
        await interaction.editReply({ content: `${config.emojis.seek} Seeked to \`${soughtTime}\`.` });
        break;
      // --- END NEW COMMAND IMPLEMENTATIONS ---


      case '247':
        player.twentyFourSeven = !player.twentyFourSeven;
        await interaction.editReply({ 
          content: `${config.emojis.success} 24/7 Mode **${player.twentyFourSeven ? 'ENABLED' : 'DISABLED'}**.\n${player.twentyFourSeven ? 'I will stay in the voice channel until stopped.' : 'I will disconnect when the queue ends.'}` 
        });
        break;
    }

  } catch (error) {
    console.error('Slash command error:', error);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: `${config.emojis.error} An error occurred while running the command.`, ephemeral: true });
    } else {
      await interaction.editReply({ content: `${config.emojis.error} An error occurred while running the command.` });
    }
  }
});


// --- Select Menu Interaction Handler for /help (Updated) ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'help_select') return;

  await interaction.deferUpdate(); 
  
  const selectedValue = interaction.values[0];
  let title = 'Help Command Details';
  let description = 'Select a command from the menu to see its usage.';
  let usage = '/command <argument>';
  let color = '#0099ff';

  switch (selectedValue) {
    case 'help_play':
      title = `${config.emojis.play} /play Command`;
      description = 'Starts music playback or adds a song/playlist to the queue.';
      usage = '`/play <song name or URL>`\nExample: `/play despacito` or `/play https://youtube.com/...`';
      color = '#00ff00';
      break;
    case 'help_stop':
      title = `${config.emojis.stop} /stop Command`;
      description = 'Stops the current playback, clears the entire queue, and makes the bot leave the voice channel.';
      usage = '`/stop`';
      color = '#FF0000';
      break;
    case 'help_skip':
      title = `${config.emojis.skip} /skip Command`;
      description = 'Skips the currently playing track and moves to the next song in the queue.';
      usage = '`/skip`';
      color = '#FFA500';
      break;
      
    // --- NEW HELP CASES ---
    case 'help_seek':
      title = `${config.emojis.seek} /seek Command`;
      description = 'Jumps to a specific position in the currently playing song.';
      usage = '`/seek <time>`\n**Time Formats:** `seconds` (e.g., `/seek 90`) or `MM:SS` (e.g., `/seek 1:30`)';
      color = '#00BFFF';
      break;

    case 'help_remove':
      title = `${config.emojis.remove} /remove Command`;
      description = 'Removes a specific song from the queue using its 1-based index (shown in /queue).';
      usage = '`/remove <index>`\nExample: `/remove 3` to remove the 3rd song in the queue.';
      color = '#FF4500';
      break;

    case 'help_clear':
      title = `${config.emojis.clear} /clear Command`;
      description = 'Removes ALL songs currently in the queue, stopping the playback if the current song ends.';
      usage = '`/clear`';
      color = '#8B0000';
      break;
    // --- END NEW HELP CASES ---
      
    case 'help_loop':
      title = `${config.emojis.loop} /loop Command`;
      description = 'Sets the loop mode for the player.';
      usage = '`/loop <mode>`\n**Modes:** `none`, `track` (loops the current song), `queue` (loops the entire queue).';
      color = '#8A2BE2';
      break;
    case 'help_volume':
      title = `${config.emojis.volume} /volume Command`;
      description = 'Sets the player volume level between 0 and 100. If no level is provided, it shows the current volume.';
      usage = '`/volume <level>`\nExample: `/volume 50` or just `/volume`';
      color = '#FFFF00';
      break;
    case 'help_queue':
        title = `${config.emojis.queue} /queue Command`;
        description = 'Displays the list of songs currently lined up in the queue, including the song that is now playing.';
        usage = '`/queue`';
        color = '#00FFFF';
        break;
    case 'help_utility':
      title = `${config.emojis.stats} Utility Commands`;
      description = 'About, 24/7, and other general commands.';
      usage = '`/about` - Shows bot information and links.\n`/247` - Toggles 24/7 mode (keeps bot in VC when queue ends).\n\n*More utility commands coming soon!*';
      color = '#708090';
      break;
  }
  
  const detailEmbed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .addFields({ name: 'Usage', value: `\`${usage}\``, inline: false })
    .setColor(color)
    .setFooter({ text: `Requested by ${interaction.user.tag}` });

  // Modify the original reply with the new embed (keeping the select menu)
  await interaction.editReply({ embeds: [detailEmbed], components: interaction.message.components });
});
// ------------------------------------------------------------------------

// --- Button Interaction Handler ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (!['pause', 'skip', 'stop', 'loop', 'shuffle'].includes(interaction.customId)) return;

  const player = kazagumo.players.get(interaction.guildId);
  if (!player) {
    return interaction.reply({ content: `${config.emojis.error} There is no music playing to control.`, ephemeral: true });
  }

  if (interaction.member.voice.channelId !== player.voiceId) {
    return interaction.reply({ content: `${config.emojis.error} You must be in the same voice channel as the bot to use the controls!`, ephemeral: true });
  }

  try {
    await interaction.deferUpdate(); // Acknowledge the button press

    switch (interaction.customId) {
      case 'pause':
        const newPauseState = !player.paused;
        player.pause(newPauseState);
        
        // Update button text and style
        const newButton = ButtonBuilder.from(interaction.component)
            .setLabel(newPauseState ? 'Resume' : 'Pause')
            .setEmoji(newPauseState ? config.emojis.resume : config.emojis.pause)
            .setStyle(newPauseState ? ButtonStyle.Success : ButtonStyle.Secondary);
            
        // Find and replace the button in the components array
        const updatedComponents = interaction.message.components.map(row => {
            const newRow = ActionRowBuilder.from(row);
            const buttonIndex = newRow.components.findIndex(c => c.customId === 'pause');
            if (buttonIndex !== -1) {
                newRow.components[buttonIndex] = newButton;
            }
            return newRow;
        });
        
        await interaction.message.edit({ components: updatedComponents });

        // Optional: send a temporary follow-up message to confirm pause/resume
        await interaction.followUp({ content: `${newPauseState ? config.emojis.pause : config.emojis.resume} Music **${newPauseState ? 'paused' : 'resumed'}**!`, flags: 64 });
        break;
        
      case 'skip':
        player.skip();
        await interaction.followUp({ content: `${config.emojis.skip} Song skipped!`, flags: 64 });
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
        
        // Update button style/label (Optional, but good practice)
        const loopStyle = newLoopMode === 'none' ? ButtonStyle.Secondary : ButtonStyle.Success;
        const loopButton = ButtonBuilder.from(interaction.component)
            .setLabel(newLoopMode === 'none' ? 'Loop' : `Loop: ${newLoopMode.toUpperCase()}`)
            .setStyle(loopStyle);
            
        const updatedLoopComponents = interaction.message.components.map(row => {
            const newRow = ActionRowBuilder.from(row);
            const buttonIndex = newRow.components.findIndex(c => c.customId === 'loop');
            if (buttonIndex !== -1) {
                newRow.components[buttonIndex] = loopButton;
            }
            return newRow;
        });
        await interaction.message.edit({ components: updatedLoopComponents });


        // Send a temporary follow-up message to confirm loop change
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


// --- Guild/Bot Status Logging ---

// Bot Joins a Server
client.on('guildCreate', async guild => {
  const joinEmbed = new EmbedBuilder()
    .setTitle(`🎉 Joined New Server: ${guild.name}`)
    .addFields(
      { name: 'Guild ID', value: `\`${guild.id}\``, inline: true },
      { name: 'Members', value: `${guild.memberCount}`, inline: true }
    )
    .setColor('#00ff00')
    .setTimestamp();

  // 1. Send to Owner
  try {
    const owner = await client.users.fetch(OWNER_ID);
    if (owner) {
      // Attempt to get an invite link
      const invite = await guild.channels.cache.filter(c => c.type === ChannelType.GuildText).first()?.createInvite({ maxAge: 0, maxUses: 0 }).catch(() => null);
      if (invite) {
        joinEmbed.addFields({ name: 'Invite', value: `[Join Server](${invite.url})`, inline: false });
      }
      owner.send({ embeds: [joinEmbed] }).catch(console.error);
    }
  } catch (error) {
    console.error('Error fetching owner or sending join notification:', error);
  }

  // 2. Send to Official Join Channel
  if (JOIN_CHANNEL_ID) {
    const joinChannel = client.channels.cache.get(JOIN_CHANNEL_ID);
    if (joinChannel && joinChannel.isTextBased()) {
      joinChannel.send({ embeds: [joinEmbed] }).catch(console.error);
    }
  }
});

// Bot Leaves a Server
client.on('guildDelete', async guild => {
  const leaveEmbed = new EmbedBuilder()
    .setTitle(`👋 Left Server: ${guild.name}`)
    .addFields(
      { name: 'Guild ID', value: `\`${guild.id}\``, inline: true },
      { name: 'Members', value: `${guild.memberCount}`, inline: true }
    )
    .setColor('#ff0000')
    .setTimestamp();

  // 1. Send to Owner
  try {
    const owner = await client.users.fetch(OWNER_ID);
    if (owner) {
      owner.send({ embeds: [leaveEmbed] }).catch(console.error);
    }
  } catch (error) {
    console.error('Error fetching owner or sending leave notification:', error);
  }

  // 2. Send to Official Leave Channel
  if (LEAVE_CHANNEL_ID) {
    const leaveChannel = client.channels.cache.get(LEAVE_CHANNEL_ID);
    if (leaveChannel && leaveChannel.isTextBased()) {
      leaveChannel.send({ embeds: [leaveEmbed] }).catch(console.error);
    }
  }
});


// --- Message Command Handler (Prefix and Mention) ---
client.on('messageCreate', async message => {
  // Ignore bots and non-guild messages
  if (message.author.bot || !message.guild) return;

  const prefix = config.prefix;
  const isPrefixCommand = message.content.toLowerCase().startsWith(prefix.toLowerCase());
  
  // Bot Mention Check
  const isBotMention = message.mentions.has(client.user) && !isPrefixCommand;

  if (isBotMention) {
    // This regex checks for the mention followed by optional whitespace, and then the end of the string
    const mentionRegex = new RegExp(`^<@!?${client.user.id}>\\s*$`);
    
    if (mentionRegex.test(message.content)) {
        
        // --- Same reply logic as the /about command ---
        const inviteURL = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
        const websiteURL = 'https://infinity-music-bot.com'; 

        const aboutEmbed = new EmbedBuilder()
            .setTitle(`🎶 Hello! I'm ${client.user.username}`)
            .setDescription(`I'm an advanced music bot! You can interact with me using **Slash Commands** (start typing \`/\`).`)
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'Developer', value: `<@${OWNER_ID}>`, inline: true },
                { name: 'Commands', value: `Use \`/help\` to see a full list.`, inline: true },
                { name: 'Prefix', value: config.enablePrefix ? `\`${prefix}\`` : 'Disabled', inline: true }
            )
            .setColor('#7289DA');

        // Button Action Row
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Invite Me')
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(config.emojis.invite)
                    .setURL(inviteURL),
                new ButtonBuilder()
                    .setLabel('Support Server')
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(config.emojis.support)
                    .setURL(config.support.server),
                new ButtonBuilder()
                    .setLabel('Website')
                    .setStyle(ButtonStyle.Link)
                    .setEmoji('🔗')
                    .setURL(websiteURL),
            );

        return message.reply({ embeds: [aboutEmbed], components: [buttonRow] });
    }
  }
  // --- END Bot Mention Check ---

  // Check for prefix commands (only if enabled)
  if (config.enablePrefix && isPrefixCommand) {
    // ... Existing prefix command parsing logic ...
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Basic prefix command handler (you can expand this with more commands)
    if (command === 'ping') {
      message.reply(`Pong! Latency is \`${client.ws.ping}ms\``);
    } else if (command === 'play') {
      message.reply(`Please use the **slash command** \`/play\` for music playback!`);
    } else if (command === 'help') {
      message.reply(`Please use the **slash command** \`/help\` to see the command menu.`);
    }
  }
});

client.login(config.token);
