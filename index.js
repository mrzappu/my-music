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
  },
  plugins: [],
}, new Connectors.DiscordJS(client), config.lavalink.nodes); // Changed to use Shoukaku instance

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Set the bot's activity/presence
  client.user.setPresence({
    activities: [{ 
      name: config.activity.name, 
      type: ActivityType[config.activity.type.toUpperCase()] 
    }],
    status: 'online',
  });

  // Register commands
  try {
    const rest = new REST({ version: '10' }).setToken(config.token);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands.map(cmd => cmd.data.toJSON()) },
    );
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Error registering application commands:', error);
  }
});

// --- COMMANDS ---

const commands = [];

// Play Command
const playCommand = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays a song or adds it to the queue.')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The song name or URL to play.')
        .setRequired(true)),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });

    const member = interaction.guild.members.cache.get(interaction.user.id);
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({ content: `${config.emojis.error} You must be in a voice channel to use this command.`, ephemeral: true });
    }

    // Check for bot permissions
    const botMember = interaction.guild.members.cache.get(client.user.id);
    const permissions = voiceChannel.permissionsFor(botMember);
    if (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
      return interaction.reply({ content: `${config.emojis.error} I need permission to **Connect** and **Speak** in your voice channel.`, ephemeral: true });
    }
    
    // Defer the reply for long operations
    await interaction.deferReply();

    const query = interaction.options.getString('query');

    try {
      let player = kazagumo.players.get(interaction.guildId);

      if (!player) {
        player = await kazagumo.createPlayer({
          guildId: interaction.guildId,
          voiceId: voiceChannel.id,
          textId: interaction.channelId,
          shardId: interaction.guild.shardId,
        });
        player.setVolume(config.player.defaultVolume);
      } else if (player.voiceId !== voiceChannel.id) {
        // Handle player already exists in another channel
        if (player.queue.size === 0 && !player.playing) {
          // If the player is idle, move to the new channel
          player.connect(voiceChannel.id);
        } else {
          // If the player is active, disallow channel switch
          return interaction.editReply({ 
            content: `${config.emojis.error} The music player is currently active in another voice channel: <#${player.voiceId}>.`, 
            ephemeral: true 
          });
        }
      }
      
      const res = await kazagumo.search(query, { requester: interaction.user });

      if (!res || !res.tracks.length) {
        return interaction.editReply({ content: `${config.emojis.error} No results found for \`${query}\`.` });
      }

      if (res.type === 'PLAYLIST') {
        player.queue.add(res.tracks);
        if (!player.playing && !player.paused) {
          await player.play();
        }
        return interaction.editReply({ 
          content: `${config.emojis.playlist} Added **${res.tracks.length}** songs from playlist [${res.playlistName}](${query}) to the queue.` 
        });
      } else {
        const track = res.tracks[0];
        player.queue.add(track);
        if (!player.playing && !player.paused) {
          await player.play();
        }
        return interaction.editReply({ 
          content: `${config.emojis.play} Added track **[${track.title}](${track.uri})** to the queue.` 
        });
      }
    } catch (error) {
      console.error('Play command error:', error);
      return interaction.editReply({ content: `${config.emojis.error} An unexpected error occurred while playing the song. (${error.message})` });
    }
  },
};
commands.push(playCommand);


// Skip Command
const skipCommand = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skips the current song.'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const player = kazagumo.players.get(interaction.guildId);

    if (!player || !player.playing) {
      return interaction.editReply({ content: `${config.emojis.error} I am not currently playing anything.` });
    }
    
    // Check if the user is in the same voice channel
    if (interaction.member.voice.channelId !== player.voiceId) {
      return interaction.editReply({ content: `${config.emojis.error} You must be in my voice channel to skip the song.`, ephemeral: true });
    }

    try {
      await player.skip();
      await interaction.editReply({ content: `${config.emojis.skip} Song skipped!` });
    } catch (error) {
      console.error('Skip command error:', error);
      await interaction.editReply({ content: `${config.emojis.error} An error occurred while skipping the song.`, ephemeral: true });
    }
  }
};
commands.push(skipCommand);

// Stop Command
const stopCommand = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stops the music and clears the queue.'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const player = kazagumo.players.get(interaction.guildId);

    if (!player || !player.playing) {
      return interaction.editReply({ content: `${config.emojis.error} I am not currently playing anything.` });
    }
    
    // Check if the user is in the same voice channel
    if (interaction.member.voice.channelId !== player.voiceId) {
      return interaction.editReply({ content: `${config.emojis.error} You must be in my voice channel to stop the music.`, ephemeral: true });
    }

    try {
      player.destroy();
      await interaction.editReply({ content: `${config.emojis.stop} Music stopped and queue cleared. I have left the voice channel.` });
    } catch (error) {
      console.error('Stop command error:', error);
      await interaction.editReply({ content: `${config.emojis.error} An error occurred while stopping the music.`, ephemeral: true });
    }
  }
};
commands.push(stopCommand);

// ... (Other commands like queue, pause, resume, etc. would go here)

// --- SLASH COMMAND HANDLER ---

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.find(cmd => cmd.data.name === interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `${config.emojis.error} There was an error while executing this command!`, ephemeral: true });
    } else {
        await interaction.reply({ content: `${config.emojis.error} There was an error while executing this command!`, ephemeral: true });
    }
  }
});

// --- KAZAGUMO (PLAYER) EVENTS ---

kazagumo.on('playerStart', async (player, track) => {
  if (!player.textId) return;

  const embed = new EmbedBuilder()
    .setColor(config.embed.color)
    .setTitle(`${config.emojis.play} Now Playing`)
    .setDescription(`**[${track.title}](${track.uri})**`)
    .addFields(
      { name: 'Duration', value: `\`${formatTime(track.length)}\``, inline: true },
      { name: 'Requested by', value: `${track.requester}`, inline: true },
      { name: 'Queue Size', value: `\`${player.queue.size}\``, inline: true },
      { name: 'Loop', value: `⏺️ **${player.loop}**`, inline: true }
    )
    .setThumbnail(track.thumbnail || null);

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId('pause').setEmoji(config.emojis.pause).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('skip').setEmoji(config.emojis.skip).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('stop').setEmoji(config.emojis.stop).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('loop').setEmoji(config.emojis.loop).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('shuffle').setEmoji(config.emojis.shuffle).setStyle(ButtonStyle.Secondary)
    );

  try {
    const channel = await client.channels.fetch(player.textId);
    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [embed], components: [row] });
    }
  } catch (error) {
    console.error('Error sending now playing message:', error);
  }
});

kazagumo.on('playerDestroy', async (player) => {
  console.log(`Player destroyed in guild ${player.guildId}`);
  // Optional: Send a message indicating the bot has left
});

kazagumo.on('playerEnd', async (player) => {
  console.log(`Player ended in guild ${player.guildId}`);
  // Logic for what happens when a queue ends naturally
  if (!player.queue.size) {
    setTimeout(() => {
        if (!player.playing) player.destroy();
    }, 60000); // Auto-leave after 60 seconds of inactivity
  }
});

// --- BUTTON INTERACTION HANDLER ---

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  
  if (!interaction.customId || !['pause', 'skip', 'stop', 'loop', 'shuffle'].includes(interaction.customId)) return;

  const player = kazagumo.players.get(interaction.guildId);

  if (!player) {
    return interaction.reply({ content: `${config.emojis.error} I am not currently playing anything.`, ephemeral: true });
  }
  
  // Check if the user is in the same voice channel
  if (interaction.member.voice.channelId !== player.voiceId) {
    return interaction.reply({ content: `${config.emojis.error} You must be in my voice channel to control the music.`, ephemeral: true });
  }

  // Defer the update/reply
  await interaction.deferUpdate().catch(() => {});

  try {
    switch (interaction.customId) {
      case 'pause':
        if (player.paused) {
          player.pause(false);
          await interaction.followUp({ content: `${config.emojis.resume} Playback resumed.`, flags: 64 });
        } else {
          player.pause(true);
          await interaction.followUp({ content: `${config.emojis.pause} Playback paused.`, flags: 64 });
        }
        
        // Update the button appearance
        if (interaction.message && interaction.message.editable) {
            const newRow = ActionRowBuilder.from(interaction.message.components[0]);
            const pauseButton = newRow.components.find(c => c.customId === 'pause');
            if (pauseButton) {
                pauseButton.setEmoji(player.paused ? config.emojis.resume : config.emojis.pause);
            }
            await interaction.message.edit({ components: [newRow] }).catch(err => console.error('Error editing components on pause press:', err));
        }

        break;
      case 'skip':
        await player.skip();
        await interaction.followUp({ content: `${config.emojis.skip} Song skipped!`, flags: 64 });
        break;
      case 'stop':
        player.destroy();
        await interaction.message.delete().catch(() => {}); // Delete the message
        await interaction.followUp({ content: `${config.emojis.stop} Music stopped and queue cleared.`, flags: 64 });
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
             // Update the Loop field (index 3)
             currentEmbed.spliceFields(3, 1, { name: 'Loop', value: `⏺️ **${newLoopMode}**`, inline: true });
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


// --- UTILITY FUNCTIONS ---

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(minutes / 60);
    const finalMinutes = minutes % 60;
    
    if (hours > 0) {
        return `${hours}:${String(finalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(finalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Function to send a notification to the owner/console about Lavalink status
// This is a placeholder function, you may want to enhance this to DM the owner.
function lavalinkStatusNotification(nodeName, isError, message) {
    const status = isError ? '❌ ERROR' : '✅ SUCCESS';
    console.log(`[LAVALINK STATUS] Node: ${nodeName} | Status: ${status} | Message: ${message}`);
}


// --- SHOUKAKU (Lavalink) Events with Notification Function ---
shoukaku.on('ready', (name) => {
    console.log(`Lavalink Node ${name}: Ready`);
    lavalinkStatusNotification(name, false, 'Connection successful and node is ready.');
});
// 🌟 FIX: Added try...catch for robust error handling to prevent process crash
shoukaku.on('error', (name, error) => {
    try {
        console.error(`Lavalink Node ${name}: Error - ${error.message}`);
        lavalinkStatusNotification(name, true, `Error: ${error.message}`);
        // Log the full stack trace for better debugging
        console.error(error.stack); 
    } catch (e) {
        // Catch any error within the handler itself to prevent a recursive crash
        console.error(`CRITICAL: Error processing Shoukaku 'error' event: ${e.message}`);
    }
});
shoukaku.on('close', (name, code, reason) => {
    console.warn(`Lavalink Node ${name}: Closed - Code: ${code}, Reason: ${reason || 'No reason provided'}`);
    lavalinkStatusNotification(name, true, `Connection closed (Code: ${code}). Trying to reconnect...`);
});
shoukaku.on('disconnect', (name, count) => {
    console.error(`Lavalink Node ${name}: Disconnected - Reconnect attempt ${count}`);
    lavalinkStatusNotification(name, true, `Disconnected (Reconnect attempt ${count}).`);
});

// --- DISCORD CLIENT LOGIN ---
client.login(config.token);

// --- UNHANDLED REJECTION/EXCEPTION HANDLERS (Final crash prevention) ---
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});
process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});
