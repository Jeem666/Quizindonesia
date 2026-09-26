require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const questions = require('./data/questions');
const words = require('./data/words');
const store = require('./store');

if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN belum diatur.');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const games = new Map();
const COLORS = { blue: 0x3498db, green: 0x2ecc71, red: 0xe74c3c, gold: 0xf1c40f, purple: 0x9b59b6 };

function mentionUser(id) { return `<@${id}>`; }
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function normalizeWord(s) { return s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z]/g, ''); }
function quizButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(['A','B','C','D'].map((x,i) => new ButtonBuilder().setCustomId(`quiz:${i}`).setLabel(x).setStyle(ButtonStyle.Primary).setDisabled(disabled)));
}

async function sendQuizQuestion(channel, game) {
  const q = game.questions[game.index];
  const embed = new EmbedBuilder().setColor(COLORS.blue).setTitle(`🧠 Quiz — Soal ${game.index + 1}/${game.questions.length}`).setDescription(`**${q.question}**\n\n${q.options.map((x,i) => `**${'ABCD'[i]}.** ${x}`).join('\n')}`).addFields({ name: 'Kategori', value: q.category, inline: true }, { name: 'Kesulitan', value: q.difficulty, inline: true }).setFooter({ text: 'Pilih jawaban menggunakan tombol di bawah.' });
  game.message = await channel.send({ embeds: [embed], components: [quizButtons()] });
}

async function finishQuiz(channel, game) {
  const ranking = [...game.scores.entries()].sort((a,b) => b[1].points - a[1].points);
  const lines = ranking.map(([id,s],i) => `${i+1}. ${mentionUser(id)} — **${s.points} poin** (${s.correct} benar)`).join('\n') || 'Belum ada jawaban.';
  const embed = new EmbedBuilder().setColor(COLORS.gold).setTitle('🏆 Quiz selesai!').setDescription(lines).setFooter({ text: 'Gunakan /leaderboard untuk melihat peringkat global.' });
  await channel.send({ embeds: [embed] });
  games.delete(channel.id);
}

async function startQuiz(interaction) {
  if (games.has(interaction.channelId)) return interaction.reply({ content: '⚠️ Sudah ada permainan aktif di channel ini. Gunakan `/stopgame` untuk menghentikannya.', ephemeral: true });
  const jumlah = interaction.options.getInteger('jumlah') || 10;
  const game = { type: 'quiz', index: 0, questions: shuffle(questions).slice(0, jumlah), scores: new Map(), message: null };
  games.set(interaction.channelId, game);
  await interaction.reply({ content: `🎯 **Quiz dimulai!** ${jumlah} soal. Siapa cepat dia dapat poin!` });
  await sendQuizQuestion(interaction.channel, game);
}

async function startWord(interaction) {
  if (games.has(interaction.channelId)) return interaction.reply({ content: '⚠️ Sudah ada permainan aktif di channel ini. Gunakan `/stopgame` untuk menghentikannya.', ephemeral: true });
  const word = words[Math.floor(Math.random() * words.length)];
  const game = { type: 'word', current: word, used: new Set([word]), lastUser: null, chain: 0, timeout: null };
  games.set(interaction.channelId, game);
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.purple).setTitle('🔗 Sambung Kata dimulai!').setDescription(`Kata awal: **${word}**\n\nKetik kata baru yang **diawali huruf terakhir** dari kata sebelumnya.\nContoh: **${word.slice(-1)}...**`).setFooter({ text: 'Kata minimal 3 huruf. Tidak boleh mengulang kata.' })] });
  resetWordTimeout(interaction.channel, game);
}
function resetWordTimeout(channel, game) {
  if (game.timeout) clearTimeout(game.timeout);
  game.timeout = setTimeout(() => { if (games.get(channel.id) === game) { channel.send(`⏰ Permainan sambung kata berakhir karena tidak ada jawaban selama 60 detik. Rantai: **${game.chain}** kata.`); games.delete(channel.id); } }, 60000);
}

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'quiz': return startQuiz(interaction);
        case 'sambungkata': return startWord(interaction);
        case 'bantuan': return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.blue).setTitle('📚 Bantuan Bot').setDescription('`/quiz [jumlah]` — mulai quiz\n`/sambungkata` — mulai sambung kata\n`/skor [user]` — lihat statistik\n`/leaderboard` — peringkat global\n`/stopgame` — hentikan game di channel (butuh Manage Channels)\n`/reset-skor` — reset semua skor (admin)').setFooter({ text: 'Bot Quiz & Sambung Kata Indonesia' })] });
        case 'leaderboard': {
          const list = store.leaderboard(10);
          const text = list.length ? list.map((u,i) => `**${i+1}.** ${u.username} — **${u.points} poin** | ${u.correct} benar | ${u.wrong} salah`).join('\n') : 'Belum ada skor.';
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setTitle('🏆 Leaderboard Global').setDescription(text)] });
        }
        case 'skor': {
          const user = interaction.options.getUser('user') || interaction.user;
          const s = store.getUser(user.id) || { points: 0, correct: 0, wrong: 0, games: 0 };
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.green).setTitle(`📊 Statistik ${user.username}`).setThumbnail(user.displayAvatarURL()).addFields({ name: 'Poin', value: String(s.points), inline: true }, { name: 'Benar', value: String(s.correct), inline: true }, { name: 'Salah', value: String(s.wrong), inline: true }, { name: 'Game', value: String(s.games), inline: true })] });
        }
        case 'stopgame': {
          const game = games.get(interaction.channelId); if (!game) return interaction.reply({ content: 'Tidak ada game aktif.', ephemeral: true });
          if (game.timeout) clearTimeout(game.timeout); games.delete(interaction.channelId);
          return interaction.reply('🛑 Game dihentikan oleh moderator.');
        }
        case 'reset-skor': store.resetAll(); return interaction.reply('♻️ Semua skor berhasil direset.');
      }
    }
    if (interaction.isButton() && interaction.customId.startsWith('quiz:')) {
      const game = games.get(interaction.channelId); if (!game || game.type !== 'quiz') return interaction.reply({ content: 'Game sudah selesai.', ephemeral: true });
      const choice = Number(interaction.customId.split(':')[1]); const q = game.questions[game.index];
      if (!game.scores.has(interaction.user.id)) game.scores.set(interaction.user.id, { points: 0, correct: 0, wrong: 0 });
      const score = game.scores.get(interaction.user.id); const correct = choice === q.answer;
      if (correct) { score.points += 10; score.correct++; store.addStats(interaction.user, { points: 10, correct: 1, games: 1 }); }
      else { score.points = Math.max(0, score.points - 3); score.wrong++; store.addStats(interaction.user, { points: -3, wrong: 1, games: 1 }); }
      await interaction.update({ embeds: [new EmbedBuilder().setColor(correct ? COLORS.green : COLORS.red).setTitle(correct ? '✅ Benar!' : '❌ Salah!').setDescription(`${mentionUser(interaction.user.id)} ${correct ? 'mendapat **+10 poin**.' : `kehilangan **3 poin**. Jawaban benar: **${'ABCD'[q.answer]}. ${q.options[q.answer]}**`}`)], components: [quizButtons(true)] });
      setTimeout(async () => { if (!games.has(interaction.channelId)) return; game.index++; if (game.index >= game.questions.length) return finishQuiz(interaction.channel, game); await sendQuizQuestion(interaction.channel, game); }, 1200);
    }
  } catch (err) { console.error(err); if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Terjadi kesalahan. Cek log bot.', ephemeral: true }).catch(() => {}); }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const game = games.get(message.channel.id); if (!game || game.type !== 'word') return;
  const word = normalizeWord(message.content); if (word.length < 3 || !/^[a-z]+$/.test(word)) return;
  const expected = normalizeWord(game.current).slice(-1);
  if (word[0] !== expected) return;
  if (game.used.has(word)) return message.reply('🔁 Kata itu sudah dipakai. Coba kata lain.');
  game.used.add(word); game.current = word; game.lastUser = message.author.id; game.chain++;
  store.addStats(message.author, { points: 5, correct: 1, games: 1 });
  await message.react('✅').catch(() => {});
  await message.channel.send(`🔗 **${word}** — ${mentionUser(message.author.id)} mendapat **+5 poin**! Selanjutnya harus diawali huruf **${word.slice(-1).toUpperCase()}**.`);
  resetWordTimeout(message.channel, game);
});

client.once('ready', () => console.log(`🤖 ${client.user.tag} online dan siap bermain!`));
client.login(process.env.DISCORD_TOKEN);
