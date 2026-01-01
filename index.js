require('dotenv').config();
const config = require('./config');
const { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ActivityType, ChannelType, PermissionFlagsBits 
} = require('discord.js'); 

const express = require('express');
const app = express();

app.get('/', (req, res) => { res.send('Discord Music Bot is running!'); });
const PORT = process.env.PORT || config.express.port;
app.listen(PORT, '0.0.0.0', () => { console.log(`Express server running on port ${PORT}`); });

const { Shoukaku, Connectors } = require('shoukaku');
const { Kazagumo } = require('kazagumo');

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates];
if (config.enablePrefix) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);

const client = new Client({ intents });
const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), config.lavalink.nodes);

const kazagumo = new Kazagumo({
  defaultSearchEngine: config.lavalink.defaultSearchEngine,
  send: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(payload);
  }
}, new Connectors.DiscordJS(client), config.lavalink.nodes);

// --- CONFIGURATION ---
const OWNER_ID = config.OWNER_ID;
const SONG_NOTIFICATION_CHANNEL_ID = '1411369713266589787'; 
const BOT_JOIN_NOTIFICATION_CHANNEL_ID = '1411369682459427006';
const MUSIC_STOPPED_CHANNEL_ID = '1393633652537163907';
const BOT_LEFT_SERVER_CHANNEL_ID = '1393633926031085669';
const LAVALINK_STATUS_CHANNEL_ID = config.LAVALINK_STATUS_CHANNEL_ID; 

// --- UTILITIES ---
function msToTime(duration) {
    if (!duration || duration < 0) return 'N/A';
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)));
    const sec = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${sec}` : `${minutes}:${sec}`;
}

async function clearBotMessages(channelId) {
    const channel = client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) return;
    try {
        const permissions = channel.permissionsFor(client.user);
        if (!permissions.has(PermissionFlagsBits.ManageMessages)) return;
        const messages = await channel.messages.fetch({ limit: 100 });
        const botMessages = messages.filter(m => m.author.id === client.user.id);
        if (botMessages.size > 0) await channel.bulkDelete(botMessages, true);
    } catch (error) { console.error('Clear error:', error.message); }
}

function timeToMilliseconds(timeString) {
    const parts = timeString.split(':');
    if (parts.length === 1) {
        const secondsMatch = timeString.match(/^(\d+)s$/i);
        return secondsMatch ? parseInt(secondsMatch[1]) * 1000 : parseInt(timeString) * 1000;
    } else if (parts.length === 2) {
        return (parseInt(parts[0]) * 60 + parseInt(parts[1])) * 1000;
    }
    return null;
}

// --- PERSISTENT STATUS SYSTEM ---
let statusMessage = null;
async function updateLavalinkStatus() {
    const channel = client.channels.cache.get(LAVALINK_STATUS_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    let nodeStatusText = "";
    let overallStatus = "Operational";

    shoukaku.nodes.forEach((node) => {
        const isOnline = node.state === 1;
        if (!isOnline) overallStatus = "Partial Operational";

        let statsLine = (isOnline && node.stats) ? 
            `\`\`\`\nPlayers         :: ${node.stats.players}\nPlaying Players :: ${node.stats.playingPlayers}\nUptime          :: ${msToTime(node.stats.uptime)}\nMemory Usage    :: ${Math.round(node.stats.memory.used / 1024 / 1024)} MB\n\`\`\`` 
            : "\n  **Not Operational**\n";
        nodeStatusText += `\n### Node: ${node.name}\n**${isOnline ? "✅ Online" : "❌ Offline"}**\n${statsLine}`;
    });

    const statusEmbed = new EmbedBuilder()
        .setAuthor({ name: "Infinity Music Audio Nodes", iconURL: client.user.displayAvatarURL() })
        .setColor(overallStatus === "Operational" ? "#2B2D31" : "#E67E22")
        .setDescription(`**Status: ${overallStatus}**\n**Last Refresh:** <t:${Math.floor(Date.now() / 1000)}:R>${nodeStatusText}`)
        .setTimestamp();

    try {
        if (!statusMessage) {
            const messages = await channel.messages.fetch({ limit: 10 });
            statusMessage = messages.find(m => m.author.id === client.user.id);
            if (statusMessage) await statusMessage.edit({ embeds: [statusEmbed] });
            else statusMessage = await channel.send({ embeds: [statusEmbed] });
        } else {
            await statusMessage.edit({ embeds: [statusEmbed] });
        }
    } catch (e) { console.error("Status Error:", e.message); }
}

// --- NOTIFICATION HANDLERS ---
async function songPlayNotification(player, track) {
  try {
    const guild = client.guilds.cache.get(player.guildId);
    if (!guild) return;
    const ownerUser = await client.users.fetch(OWNER_ID);
    const embed = new EmbedBuilder()
      .setTitle(`🎶 Song Started`)
      .setDescription(`**[${track.title}](${track.uri})**`)
      .addFields(
        { name: 'Server', value: guild.name, inline: true },
        { name: 'Requested By', value: track.requester.tag, inline: true }
      )
      .setColor('#0099ff').setTimestamp();
    if (ownerUser) await ownerUser.send({ embeds: [embed] }).catch(() => null);
    const channel = client.channels.cache.get(SONG_NOTIFICATION_CHANNEL_ID);
    if (channel?.isTextBased()) await channel.send({ embeds: [embed] }).catch(() => null);
  } catch (e) { console.error(e); }
}

// --- READY EVENT ---
client.on('ready', async () => {
    console.log(`${client.user.tag} is online!`);
    client.user.setActivity({ name: config.activity.name, type: ActivityType[config.activity.type] });

    const commands = [
        new SlashCommandBuilder().setName('play').setDescription('Play a song').addStringOption(o => o.setName('query').setDescription('URL or Name').setRequired(true)),
        new SlashCommandBuilder().setName('skip').setDescription('Skip song'),
        new SlashCommandBuilder().setName('stop').setDescription('Stop music'),
        new SlashCommandBuilder().setName('pause').setDescription('Pause music'),
        new SlashCommandBuilder().setName('resume').setDescription('Resume music'),
        new SlashCommandBuilder().setName('queue').setDescription('View queue'),
        new SlashCommandBuilder().setName('volume').setDescription('Set volume').addIntegerOption(o => o.setName('level').setDescription('0-100')),
        new SlashCommandBuilder().setName('247').setDescription('Toggle 24/7 mode'),
        new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle queue'),
        new SlashCommandBuilder().setName('loop').setDescription('Set loop mode').addStringOption(o => o.setName('mode').setRequired(true).addChoices({name:'Off',value:'none'},{name:'Track',value:'track'},{name:'Queue',value:'queue'})),
        new SlashCommandBuilder().setName('seek').setDescription('Seek to time').addStringOption(o => o.setName('time').setDescription('e.g. 1:30').setRequired(true)),
        new SlashCommandBuilder().setName('remove').setDescription('Remove from queue').addIntegerOption(o => o.setName('number').setRequired(true).setMinValue(1)),
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(config.token);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }

    updateLavalinkStatus();
    setInterval(updateLavalinkStatus, 60000);
});

// --- MUSIC EVENTS ---
kazagumo.on('playerStart', async (player, track) => {
    songPlayNotification(player, track);
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(`${config.emojis.nowplaying} ${track.title}`).setURL(track.uri)
        .setThumbnail(track.thumbnail || null).setColor('#0099ff')
        .addFields(
            { name: 'Artist', value: `🎤 **${track.author || 'Unknown'}**`, inline: true },
            { name: 'Requested by', value: `👤 **${track.requester.tag}**`, inline: true },
            { name: 'Duration', value: `⏰ **${msToTime(track.duration)}**`, inline: true },
            { name: 'Loop', value: `⏺️ **${player.loop}**`, inline: true },
            { name: 'Volume', value: `🔊 **${player.volume}%**`, inline: true }
        ).setTimestamp();

    const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pause').setLabel('Pause').setStyle(ButtonStyle.Primary).setEmoji(config.emojis.pause),
        new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary).setEmoji(config.emojis.skip),
        new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger).setEmoji(config.emojis.stop),
        new ButtonBuilder().setCustomId('loop').setLabel('Loop').setStyle(ButtonStyle.Secondary).setEmoji(config.emojis.loop),
        new ButtonBuilder().setCustomId('shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Secondary).setEmoji(config.emojis.shuffle)
    );

    const msg = await channel.send({ embeds: [embed], components: [controls] });
    player.data.set('currentMessage', msg);
});

kazagumo.on('playerDestroy', (player) => { clearBotMessages(player.textId); });

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async (interaction) => {
    const player = kazagumo.players.get(interaction.guildId);

    if (interaction.isChatInputCommand()) {
        const { commandName, options, member } = interaction;
        if (!member.voice.channel) return interaction.reply({ content: "Join a VC!", ephemeral: true });

        if (commandName === 'play') {
            await interaction.deferReply();
            const res = await kazagumo.search(options.getString('query'), { requester: interaction.user });
            if (!res.tracks.length) return interaction.editReply("No results.");
            const p = await kazagumo.createPlayer({ guildId: interaction.guildId, textId: interaction.channelId, voiceId: member.voice.channel.id });
            p.queue.add(res.tracks[0]);
            if (!p.playing) p.play();
            return interaction.editReply(`Added **${res.tracks[0].title}**`);
        }

        if (!player) return interaction.reply({ content: "Nothing playing.", ephemeral: true });
        // Handle other commands (skip, stop, etc.) as per your logic...
    }

    if (interaction.isButton()) {
        if (!player) return interaction.reply({ content: "No player.", ephemeral: true });
        if (interaction.customId === 'pause') { player.pause(!player.paused); interaction.reply({ content: player.paused ? "Paused" : "Resumed", ephemeral: true }); }
        if (interaction.customId === 'skip') { player.skip(); interaction.reply({ content: "Skipped", ephemeral: true }); }
        if (interaction.customId === 'stop') { player.destroy(); interaction.reply({ content: "Stopped", ephemeral: true }); }
    }
});

client.login(config.token);
