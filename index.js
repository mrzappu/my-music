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

// Client Ready Event
client.on('ready', () => {
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

kazagumo.on('playerStart', async (player, track) => {
  console.log(`Now playing: ${track.title} in guild: ${player.guildId}`);

  try {
    const channel = client.channels.cache.get(player.textId);

    if (channel) {
      // Create the "Now Playing" embed
      const embed = new EmbedBuilder()
        .setTitle(`${config.emojis.nowplaying} Now Playing`)
        .setDescription(`[${track.title}](${track.uri}) - \`[${track.duration.asString()}]\``)
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

      // Send the new message and store it for later reference (e.g., disabling buttons)
      const currentMessage = await channel.send({ embeds: [embed], components: [controlsRow] });

      // Store the message object in player data
      player.data.set('currentMessage', currentMessage);

      // Delete the previous 'Now Playing' message if it exists and is editable
      const previousMessage = player.data.get('previousMessage');
      if (previousMessage && previousMessage.deletable) {
        try {
          await previousMessage.delete();
        } catch (error) {
          // Ignore if message is already deleted or unaccessible
          if (error.code !== 10008) console.error('Error deleting previous message:', error);
        }
      }

      // Update the previous message
      player.data.set('previousMessage', currentMessage);
    }
  } catch (err) {
    console.error('Error handling playerStart event:', err);
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
  if (['play', 'skip', 'stop', 'queue', 'nowplaying', 'pause', 'resume', 'shuffle', 'loop', 'volume', '247'].includes(commandName) && !voiceChannel) {
    return interaction.reply({ content: `${config.emojis.error} You must be in a voice channel to use this command.`, ephemeral: true });
  }

  // Check for permissions (Connect and Speak)
  if (voiceChannel && (!permissions.has('Connect') || !permissions.has('Speak'))) {
    return interaction.reply({ content: `${config.emojis.error} I need the **CONNECT** and **SPEAK** permissions in your voice channel.`, ephemeral: true });
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
        .setFooter({ text: `Developed by Unknownzop | Support: ${config.support.server}`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      return interaction.reply({ embeds: [helpEmbed] });
    }

    // 'play' command
    if (commandName === 'play') {
      await interaction.deferReply();
      const query = options.getString('query');

      try {
        const player = await getOrCreatePlayer(interaction, voiceChannel);
        const searchResult = await kazagumo.search(query, { requester: member.user });

        if (!searchResult || !searchResult.tracks.length) {
          return interaction.editReply({ content: `${config.emojis.error} No results found for \`${query}\`.` });
        }

        if (searchResult.type === 'PLAYLIST') {
          player.queue.add(searchResult.tracks);
          if (!player.playing && !player.paused && player.queue.length > 0) {
            await player.play();
          }

          const playlistEmbed = new EmbedBuilder()
            .setDescription(`${config.emojis.queue} Added **${searchResult.tracks.length}** tracks from playlist [${searchResult.playlistName}](${query}) to the queue.`)
            .setColor('#0099ff');
          return interaction.editReply({ embeds: [playlistEmbed] });
        } else {
          const track = searchResult.tracks[0];
          player.queue.add(track);

          if (!player.playing && !player.paused && player.queue.length > 0) {
            await player.play();
          }

          const addedEmbed = new EmbedBuilder()
            .setDescription(`${config.emojis.success} Added [${track.title}](${track.uri}) to the queue.`)
            .setColor('#00ff00');
          return interaction.editReply({ embeds: [addedEmbed] });
        }
      } catch (error) {
        console.error('Play command error:', error);
        return interaction.editReply({ content: `${config.emojis.error} An error occurred while trying to play the song.`, ephemeral: true });
      }
    }
  }

  // Commands that require an existing player
  const player = kazagumo.players.get(guild.id);

  if (!player) {
    return interaction.reply({ content: `${config.emojis.warning} There is no music currently playing in this guild.`, ephemeral: true });
  }

  // Check if the user is in the same VC as the bot
  if (voiceChannel.id !== player.voiceId) {
    return interaction.reply({ content: `${config.emojis.error} You must be in the same voice channel as the bot to control it.`, ephemeral: true });
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
          interaction.reply({ content: `${config.emojis.warning} Music is already paused.`, ephemeral: true });
        }
        break;

      case 'resume':
        if (player.paused) {
          player.pause(false);
          interaction.reply({ content: `${config.emojis.resume} Music resumed.` });
        } else {
          interaction.reply({ content: `${config.emojis.warning} Music is not paused.`, ephemeral: true });
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

      case 'nowplaying':
        if (!player.queue.current) {
          return interaction.reply({ content: `${config.emojis.error} No music is currently playing.`, ephemeral: true });
        }

        const npEmbed = new EmbedBuilder()
          .setTitle(`${config.emojis.nowplaying} Now Playing`)
          .setDescription(`[${player.queue.current.title}](${player.queue.current.uri}) - \`[${player.queue.current.duration.asString()}]\``)
          .setThumbnail(player.queue.current.thumbnail || null)
          .addFields(
            { name: 'Requester', value: player.queue.current.requester.tag, inline: true },
            { name: 'Duration', value: player.queue.current.duration.asString(), inline: true },
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
            return interaction.reply({ content: `${config.emojis.error} Volume must be between 0 and 100.`, ephemeral: true });
          }
          await player.setVolume(level);
          interaction.reply({ content: `${config.emojis.volume} Volume set to **${level}%**.` });
        } else {
          interaction.reply({ content: `${config.emojis.volume} Current volume is **${player.volume}%**.`, ephemeral: true });
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
    interaction.reply({ content: `${config.emojis.error} An unexpected error occurred while executing the command.`, ephemeral: true }).catch(() => null);
  }
});

// Button Interaction Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (!interaction.guild) return;

  const player = kazagumo.players.get(interaction.guildId);
  if (!player) return interaction.reply({ content: `${config.emojis.warning} There is no music currently playing.`, ephemeral: true });

  const member = interaction.member;
  if (!member.voice.channel || member.voice.channel.id !== player.voiceId) {
    return interaction.reply({ content: `${config.emojis.error} You must be in the same voice channel as the bot to use the controls.`, ephemeral: true });
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
        await interaction.followUp({ content: `${config.emojis.loop} Loop mode set to **${newLoopMode}**!`, ephemeral: true });
        break;
      case 'shuffle':
        player.queue.shuffle();
        await interaction.followUp({ content: `${config.emojis.shuffle} Queue shuffled!`, ephemeral: true });
        break;
    }
  } catch (error) {
    console.error('Button interaction error:', error);
    await interaction.followUp({ content: `${config.emojis.error} An error occurred while processing your request.`, ephemeral: true });
  }
});

// Prefix Command Handler (if enabled in config)
if (config.enablePrefix) {
  client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Map prefix commands to existing slash command logic for simplicity
    switch (commandName) {
        case 'play':
        case 'p':
            // Simple approach: create a mock interaction for testing
            const mockInteraction = {
                isChatInputCommand: () => true,
                commandName: 'play',
                options: {
                    getString: (name) => args.join(' '),
                },
                member: message.member,
                guild: message.guild,
                channelId: message.channel.id,
                deferReply: async () => { /* no-op */ },
                editReply: async (data) => message.channel.send(data),
                reply: async (data) => message.channel.send(data),
            };
            // Note: Full implementation of prefix commands is more complex and involves
            // converting to a real slash command or fully rewriting the logic.
            // For now, only the slash command handler is fully functional.
            // Consider using only slash commands for a cleaner bot implementation.
            await message.reply(`${config.emojis.warning} Prefix commands are currently only partially supported. Please use **/** slash commands like \`/play ${args.join(' ')}\`.`);
            break;
        case 'help':
            const helpEmbed = new EmbedBuilder()
                .setTitle(`${client.user.username} Commands`)
                .setDescription('Please use **/** slash commands for full functionality.')
                .addFields(
                    { name: '🎵 Music Commands', value: '`/play`, `/skip`, `/stop`, `/pause`, `/resume`, `/queue`, `/nowplaying`, `/shuffle`, `/loop`, `/volume`, `/247`' },
                    { name: 'ℹ️ Utility', value: '`/help`' }
                )
                .setColor('#00ff00')
                .setFooter({ text: `Developed by Unknownzop | Support: ${config.support.server}`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();
            message.channel.send({ embeds: [helpEmbed] });
            break;
    }
  });
}


client.login(config.token);