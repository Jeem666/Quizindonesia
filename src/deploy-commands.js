require('dotenv').config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Mulai kuis pilihan ganda Bahasa Indonesia')
    .addIntegerOption(o =>
      o
        .setName('jumlah')
        .setDescription('Jumlah soal (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addStringOption(o =>
      o
        .setName('kesulitan')
        .setDescription('Pilih tingkat kesulitan')
        .addChoices(
          { name: 'Mudah', value: 'Mudah' },
          { name: 'Sedang', value: 'Sedang' },
          { name: 'Sulit', value: 'Sulit' }
        )
    ),

  new SlashCommandBuilder()
    .setName('typingquiz')
    .setDescription('Mulai kuis dengan mengetik jawaban')
    .addIntegerOption(o =>
      o
        .setName('jumlah')
        .setDescription('Jumlah soal (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addStringOption(o =>
      o
        .setName('kesulitan')
        .setDescription('Pilih tingkat kesulitan')
        .addChoices(
          { name: 'Mudah', value: 'Mudah' },
          { name: 'Sedang', value: 'Sedang' },
          { name: 'Sulit', value: 'Sulit' }
        )
    ),

  new SlashCommandBuilder()
    .setName('sambungkata')
    .setDescription('Mulai permainan sambung kata'),

  new SlashCommandBuilder()
    .setName('skor')
    .setDescription('Lihat skor kamu atau pemain lain')
    .addUserOption(o =>
      o
        .setName('user')
        .setDescription('Pemain yang ingin dilihat')
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Lihat 10 pemain dengan poin tertinggi'),

  new SlashCommandBuilder()
    .setName('bantuan')
    .setDescription('Lihat daftar perintah bot'),

  new SlashCommandBuilder()
    .setName('stopgame')
    .setDescription('Hentikan permainan aktif di channel ini')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('reset-skor')
    .setDescription('Reset seluruh skor (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

].map(c => c.toJSON());

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  throw new Error('DISCORD_TOKEN dan CLIENT_ID wajib diisi.');
}

const rest = new REST({ version: '10' })
  .setToken(process.env.DISCORD_TOKEN);

(async () => {
  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      )
    : Routes.applicationCommands(
        process.env.CLIENT_ID
      );

  await rest.put(route, {
    body: commands
  });

  console.log(
    `Berhasil mendaftarkan ${commands.length} slash command.`
  );
})().catch(console.error);
