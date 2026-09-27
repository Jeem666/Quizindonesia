require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const questions = require('./data/questions');
const typingQuestions = require('./data/typingquestions');

const {
  normalizeWord,
  isValidWord,
  getRandomWord,
  getWordCount
} = require('./data/words');

const store = require('./store');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN belum ditemukan di file .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/*
==================================================
GAME STORAGE
==================================================
*/

const games = new Map();

/*
==================================================
WARNA EMBED
==================================================
*/

const COLORS = {
  blue: 0x3498db,
  green: 0x2ecc71,
  red: 0xe74c3c,
  gold: 0xf1c40f,
  purple: 0x9b59b6
};

/*
==================================================
HELPER
==================================================
*/

function mentionUser(id) {
  return `<@${id}>`;
}

function shuffle(array) {
  const arr = [...array];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

/*
==================================================
SAMBUNG KATA
==================================================
*/

const WORD_GAME_TIME = 60 * 1000;

/*
Menentukan awalan yang harus dipakai
untuk giliran sekarang.
*/
function updateRequiredLetters(game) {
  const elapsed = Date.now() - game.startedAt;

  /*
  0 - 60 detik
  Gunakan 1 huruf terakhir.
  */
  if (elapsed < WORD_GAME_TIME) {
    game.requiredLetters =
      game.current.slice(-1);

    return game.requiredLetters;
  }

  /*
  Setelah 60 detik:
  random 2 atau 3 huruf terakhir.
  */

  const requestedLength =
    Math.random() < 0.5 ? 2 : 3;

  /*
  Jangan meminta lebih panjang dari kata
  yang tersedia.
  */
  const actualLength = Math.min(
    requestedLength,
    game.current.length
  );

  game.requiredLetters =
    game.current.slice(-actualLength);

  return game.requiredLetters;
}

/*
Reset timer 60 detik sejak jawaban terakhir.
*/
function resetWordTimeout(channel, game) {
  if (game.timeout) {
    clearTimeout(game.timeout);
  }

  game.timeout = setTimeout(() => {
    if (games.get(channel.id) !== game) {
      return;
    }

    channel.send(
      `⏰ **Waktu habis!**\n\n` +
      `Tidak ada jawaban selama **60 detik**.\n\n` +
      `🔗 Rantai: **${game.chain}** kata\n` +
      `🔤 Kata terakhir: **${game.current}**`
    );

    games.delete(channel.id);
  }, WORD_GAME_TIME);
}

/*
Menambah kesalahan.
*/
async function wordMistake(message, game, reason) {
  game.mistakes++;

  /*
  Kesalahan ketiga = game selesai.
  */
  if (game.mistakes >= 3) {
    if (game.timeout) {
      clearTimeout(game.timeout);
    }

    games.delete(message.channel.id);

    await message.reply(
      `❌ **Kesalahan 3/3!**\n\n` +
      `${reason}\n\n` +
      `🛑 **Permainan berakhir.**\n` +
      `🔗 Rantai terakhir: **${game.chain}** kata.\n` +
      `🔤 Kata terakhir: **${game.current}**`
    );

    return true;
  }

  await message.reply(
    `❌ **Salah ${game.mistakes}/3**\n` +
    `${reason}\n\n` +
    `❤️ Kesempatan tersisa: **${3 - game.mistakes}**`
  );

  return false;
}

/*
Mulai Sambung Kata.
*/
async function startWord(interaction) {
  if (games.has(interaction.channelId)) {
    return interaction.reply({
      content:
        '⚠️ Sudah ada permainan aktif di channel ini. Gunakan `/stopgame` untuk menghentikannya.',
      ephemeral: true
    });
  }

  const word = getRandomWord();

  const game = {
    type: 'word',

    current: word,

    used: new Set([
      word
    ]),

    startedAt: Date.now(),

    mistakes: 0,

    lastUser: null,

    chain: 0,

    requiredLetters: null,

    timeout: null
  };

  /*
  Tentukan awalan pertama.
  */
  updateRequiredLetters(game);

  games.set(
    interaction.channelId,
    game
  );

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.purple)
        .setTitle('🔗 Sambung Kata dimulai!')
        .setDescription(
          `🔤 Kata awal: **${word}**\n\n` +

          `➡️ Kata berikutnya harus diawali:\n` +

          `# **${game.requiredLetters.toUpperCase()}**\n\n` +

          `🏆 Jawaban benar: **+5 poin**\n` +

          `❤️ Kesalahan: **0/3**\n` +

          `⏰ Waktu per jawaban: **60 detik**`
        )
        .addFields({
          name: '📖 Aturan',
          value:
            '• Kata harus ada di database\n' +
            '• Minimal 3 huruf\n' +
            '• Tidak boleh mengulang kata\n' +
            '• 0–60 detik menggunakan 1 huruf terakhir\n' +
            '• Setelah 60 detik menggunakan 2 atau 3 huruf terakhir\n' +
            '• Salah 3 kali → game berakhir\n' +
            '• Jawaban benar → +5 poin'
        })
        .setFooter({
          text:
            `Database: ${getWordCount().toLocaleString('id-ID')} kata`
        })
    ]
  });

  resetWordTimeout(
    interaction.channel,
    game
  );
}

/*
==================================================
QUIZ
==================================================
*/

function createQuizButtons(options, disabled = false) {
  const row =
    new ActionRowBuilder();

  options.forEach((option, index) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`quiz_${index}`)
        .setLabel(
          `${String.fromCharCode(65 + index)}. ${option}`
        )
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    );
  });

  return row;
}

async function sendQuizQuestion(channel, game) {
  if (game.index >= game.questions.length) {
    return finishQuiz(channel, game);
  }

  const question =
    game.questions[game.index];

  const options =
    shuffle(question.options);

  game.currentQuestion = {
    ...question,
    shuffledOptions: options
  };

  const embed =
    new EmbedBuilder()
      .setColor(COLORS.blue)
      .setTitle(
        `🧠 Quiz — Soal ${game.index + 1}/${game.questions.length}`
      )
      .setDescription(
        `**${question.question}**`
      )
      .addFields({
        name: '🏆 Skor',
        value: `${game.score} poin`,
        inline: true
      });

  await channel.send({
    embeds: [embed],
    components: [
      createQuizButtons(options)
    ]
  });
}

async function finishQuiz(channel, game) {
  const embed =
    new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle('🏆 Quiz selesai!')
      .setDescription(
        `Skor akhir: **${game.score} poin**\n\n` +
        `Benar: **${game.correct}**\n` +
        `Salah: **${game.wrong}**`
      );

  await channel.send({
    embeds: [embed]
  });

  games.delete(channel.id);
}

async function startQuiz(interaction) {
  if (games.has(interaction.channelId)) {
    return interaction.reply({
      content:
        '⚠️ Sudah ada permainan aktif di channel ini.',
      ephemeral: true
    });
  }

  const selected =
    shuffle(questions).slice(
      0,
      Math.min(10, questions.length)
    );

  if (selected.length === 0) {
    return interaction.reply({
      content:
        '❌ Database quiz kosong.',
      ephemeral: true
    });
  }

  const game = {
    type: 'quiz',

    questions: selected,

    index: 0,

    score: 0,

    correct: 0,

    wrong: 0,

    answered: false
  };

  games.set(
    interaction.channelId,
    game
  );

  await interaction.reply({
    content:
      '🧠 **Quiz dimulai!**'
  });

  await sendQuizQuestion(
    interaction.channel,
    game
  );
}

/*
==================================================
TYPING QUIZ
==================================================
*/

async function sendTypingQuestion(channel, game) {
  if (game.index >= game.questions.length) {
    const embed =
      new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle('⌨️ Typing Quiz selesai!')
        .setDescription(
          `🏆 Skor: **${game.score} poin**\n` +
          `✅ Benar: **${game.correct}**\n` +
          `❌ Salah: **${game.wrong}**`
        );

    await channel.send({
      embeds: [embed]
    });

    games.delete(channel.id);

    return;
  }

  const question =
    game.questions[game.index];

  game.currentQuestion =
    question;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.blue)
        .setTitle(
          `⌨️ Typing Quiz ${game.index + 1}/${game.questions.length}`
        )
        .setDescription(
          `**${question.question}**`
        )
        .setFooter({
          text:
            'Ketik jawabanmu di chat.'
        })
    ]
  });
}

async function startTypingQuiz(interaction) {
  if (games.has(interaction.channelId)) {
    return interaction.reply({
      content:
        '⚠️ Sudah ada permainan aktif di channel ini.',
      ephemeral: true
    });
  }

  const selected =
    shuffle(typingQuestions).slice(
      0,
      Math.min(10, typingQuestions.length)
    );

  if (selected.length === 0) {
    return interaction.reply({
      content:
        '❌ Database typing quiz kosong.',
      ephemeral: true
    });
  }

  const game = {
    type: 'typing',

    questions: selected,

    index: 0,

    score: 0,

    correct: 0,

    wrong: 0
  };

  games.set(
    interaction.channelId,
    game
  );

  await interaction.reply({
    content:
      '⌨️ **Typing Quiz dimulai!**'
  });

  await sendTypingQuestion(
    interaction.channel,
    game
  );
}

/*
==================================================
SLASH COMMANDS
==================================================
*/

client.on(
  'interactionCreate',
  async interaction => {

    /*
    COMMAND
    */
    if (interaction.isChatInputCommand()) {

      try {

        if (
          interaction.commandName ===
          'quiz'
        ) {
          return startQuiz(
            interaction
          );
        }

        if (
          interaction.commandName ===
          'typingquiz'
        ) {
          return startTypingQuiz(
            interaction
          );
        }

        if (
          interaction.commandName ===
          'sambungkata'
        ) {
          return startWord(
            interaction
          );
        }

        if (
          interaction.commandName ===
          'bantuan'
        ) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(
                  COLORS.blue
                )
                .setTitle(
                  '📖 Bantuan Bot'
                )
                .setDescription(
                  '**🎮 Game**\n' +
                  '`/quiz` — Quiz pilihan ganda\n' +
                  '`/typingquiz` — Quiz mengetik\n' +
                  '`/sambungkata` — Sambung Kata\n\n' +

                  '**🏆 Statistik**\n' +
                  '`/skor` — Lihat skor\n' +
                  '`/leaderboard` — Leaderboard\n\n' +

                  '**⚙️ Lainnya**\n' +
                  '`/stopgame` — Hentikan game aktif'
                )
            ]
          });
        }

        if (
          interaction.commandName ===
          'stopgame'
        ) {

          const game =
            games.get(
              interaction.channelId
            );

          if (!game) {
            return interaction.reply({
              content:
                'ℹ️ Tidak ada game aktif di channel ini.',
              ephemeral: true
            });
          }

          if (game.timeout) {
            clearTimeout(
              game.timeout
            );
          }

          games.delete(
            interaction.channelId
          );

          return interaction.reply({
            content:
              '🛑 Game berhasil dihentikan.'
          });
        }

        if (
          interaction.commandName ===
          'leaderboard'
        ) {
          if (
            typeof store.getLeaderboard !==
            'function'
          ) {
            return interaction.reply({
              content:
                '⚠️ Fungsi leaderboard belum tersedia di store.js.',
              ephemeral: true
            });
          }

          const leaderboard =
            store.getLeaderboard();

          if (
            !leaderboard ||
            leaderboard.length === 0
          ) {
            return interaction.reply({
              content:
                '📊 Belum ada data leaderboard.',
              ephemeral: true
            });
          }

          const text =
            leaderboard
              .slice(0, 10)
              .map(
                (user, index) =>
                  `**${index + 1}.** ${mentionUser(user.id)} — **${user.points || 0} poin**`
              )
              .join('\n');

          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(
                  COLORS.gold
                )
                .setTitle(
                  '🏆 Leaderboard'
                )
                .setDescription(
                  text
                )
            ]
          });
        }

        if (
          interaction.commandName ===
          'skor'
        ) {

          if (
            typeof store.getStats !==
            'function'
          ) {
            return interaction.reply({
              content:
                '⚠️ Fungsi skor belum tersedia di store.js.',
              ephemeral: true
            });
          }

          const stats =
            store.getStats(
              interaction.user.id
            );

          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(
                  COLORS.gold
                )
                .setTitle(
                  `📊 Statistik ${interaction.user.username}`
                )
                .addFields(
                  {
                    name: '🏆 Poin',
                    value:
                      `${stats?.points || 0}`,
                    inline: true
                  },
                  {
                    name: '✅ Benar',
                    value:
                      `${stats?.correct || 0}`,
                    inline: true
                  },
                  {
                    name: '🎮 Game',
                    value:
                      `${stats?.games || 0}`,
                    inline: true
                  }
                )
            ]
          });
        }

        if (
          interaction.commandName ===
          'reset-skor'
        ) {

          if (
            !interaction.memberPermissions?.has(
              'Administrator'
            )
          ) {
            return interaction.reply({
              content:
                '❌ Kamu harus menjadi administrator untuk menggunakan command ini.',
              ephemeral: true
            });
          }

          if (
            typeof store.resetStats ===
            'function'
          ) {
            store.resetStats();
          }

          return interaction.reply({
            content:
              '♻️ Semua skor berhasil direset.'
          });
        }

      } catch (error) {

        console.error(
          '❌ Error interaction:',
          error
        );

        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction.followUp({
            content:
              '❌ Terjadi kesalahan pada bot.',
            ephemeral: true
          }).catch(() => {});
        } else {
          await interaction.reply({
            content:
              '❌ Terjadi kesalahan pada bot.',
            ephemeral: true
          }).catch(() => {});
        }
      }

      return;
    }

    /*
    BUTTON QUIZ
    */
    if (
      interaction.isButton()
    ) {

      if (
        !interaction.customId.startsWith(
          'quiz_'
        )
      ) {
        return;
      }

      const game =
        games.get(
          interaction.channelId
        );

      if (
        !game ||
        game.type !== 'quiz'
      ) {
        return interaction.reply({
          content:
            '❌ Game ini sudah selesai.',
          ephemeral: true
        });
      }

      if (game.answered) {
        return interaction.reply({
          content:
            '⚠️ Soal ini sudah dijawab.',
          ephemeral: true
        });
      }

      game.answered = true;

      const selectedIndex =
        Number(
          interaction.customId
            .replace('quiz_', '')
        );

      const selectedAnswer =
        game.currentQuestion
          .shuffledOptions[
            selectedIndex
          ];

      const correctAnswer =
        game.currentQuestion.answer;

      const correct =
        normalizeWord(
          selectedAnswer
        ) ===
        normalizeWord(
          correctAnswer
        );

      if (correct) {

        game.score += 10;

        game.correct++;

        store.addStats(
          interaction.user,
          {
            points: 10,
            correct: 1,
            games: 1
          }
        );

        await interaction.reply({
          content:
            `✅ Benar! Kamu mendapatkan **+10 poin**.`
        });

      } else {

        game.wrong++;

        await interaction.reply({
          content:
            `❌ Salah!\nJawaban yang benar: **${correctAnswer}**`
        });
      }

      game.index++;

      game.answered = false;

      setTimeout(() => {
        sendQuizQuestion(
          interaction.channel,
          game
        ).catch(console.error);
      }, 1000);
    }
  }
);

/*
==================================================
MESSAGE CREATE
==================================================
*/

client.on(
  'messageCreate',
  async message => {

    /*
    Jangan proses bot.
    */
    if (
      message.author.bot
    ) {
      return;
    }

    /*
    Hanya guild.
    */
    if (
      !message.guild
    ) {
      return;
    }

    const game =
      games.get(
        message.channelId
      );

    if (!game) {
      return;
    }

    /*
    ==============================================
    TYPING QUIZ
    ==============================================
    */

    if (
      game.type === 'typing'
    ) {

      const answer =
        normalizeWord(
          message.content
        );

      const expected =
        normalizeWord(
          game.currentQuestion.answer
        );

      if (!answer) {
        return;
      }

      if (
        answer === expected
      ) {

        game.score += 10;

        game.correct++;

        store.addStats(
          message.author,
          {
            points: 10,
            correct: 1,
            games: 1
          }
        );

        await message.react(
          '✅'
        ).catch(() => {});

        await message.channel.send(
          `⌨️ **Benar!** ${mentionUser(message.author.id)} mendapatkan **+10 poin**.`
        );

      } else {

        game.wrong++;

        await message.react(
          '❌'
        ).catch(() => {});

        await message.channel.send(
          `❌ Salah, ${mentionUser(message.author.id)}.`
        );
      }

      game.index++;

      await sendTypingQuestion(
        message.channel,
        game
      );

      return;
    }

    /*
    ==============================================
    SAMBUNG KATA
    ==============================================
    */

    if (
      game.type !== 'word'
    ) {
      return;
    }

    /*
    Ambil teks mentah.
    */
    const rawAnswer =
      message.content
        .trim()
        .toLowerCase();

    /*
    HARUS HANYA HURUF.
    
    Jadi:
    rumah       ✅
    rumah123    ❌
    rumah!      ❌
    rumah dua   ❌
    */
    if (
      !/^[a-z]+$/.test(
        rawAnswer
      )
    ) {

      await wordMistake(
        message,
        game,
        'Jawaban hanya boleh berisi huruf tanpa angka, simbol, atau spasi.'
      );

      return;
    }

    /*
    Minimal 3 huruf.
    */
    if (
      rawAnswer.length < 3
    ) {

      await wordMistake(
        message,
        game,
        'Kata harus memiliki minimal **3 huruf**.'
      );

      return;
    }

    /*
    Normalisasi.
    */
    const answer =
      normalizeWord(
        rawAnswer
      );

    /*
    Pastikan kata benar-benar
    terdapat di database.
    */
    if (
      !isValidWord(answer)
    ) {

      await wordMistake(
        message,
        game,
        `**${answer}** tidak ditemukan di database kata.`
      );

      return;
    }

    /*
    Tidak boleh mengulang.
    */
    if (
      game.used.has(answer)
    ) {

      await wordMistake(
        message,
        game,
        `Kata **${answer}** sudah pernah digunakan.`
      );

      return;
    }

    /*
    Cek awalan yang diwajibkan.
    */
    const required =
      game.requiredLetters;

    if (
      !answer.startsWith(
        required
      )
    ) {

      await wordMistake(
        message,
        game,
        `Kata harus diawali **${required.toUpperCase()}**.`
      );

      return;
    }

    /*
    ==============================================
    JAWABAN BENAR
    ==============================================
    */

    game.used.add(
      answer
    );

    game.current =
      answer;

    game.lastUser =
      message.author.id;

    game.chain++;

    store.addStats(
      message.author,
      {
        points: 5,
        correct: 1,
        games: 1
      }
    );

    /*
    Setelah jawaban benar,
    tentukan awalan baru.

    Jika sudah >60 detik,
    random lagi antara 2 atau 3 huruf.
    */
    updateRequiredLetters(
      game
    );

    /*
    Reset timer 60 detik
    karena ada jawaban.
    */
    resetWordTimeout(
      message.channel,
      game
    );

    await message.react(
      '✅'
    ).catch(() => {});

    await message.channel.send(
      `🔗 **${answer}**\n\n` +

      `✅ ${mentionUser(message.author.id)} mendapatkan **+5 poin**!\n\n` +

      `➡️ Selanjutnya harus diawali:\n` +

      `# **${game.requiredLetters.toUpperCase()}**\n\n` +

      `❤️ Kesalahan: **${game.mistakes}/3**\n` +

      `🔗 Rantai: **${game.chain}** kata`
    );
  }
);

/*
==================================================
READY
==================================================
*/

client.once(
  'clientready',
  () => {
    console.log(
      `✅ Bot online sebagai ${client.user.tag}`
    );

    console.log(
      `📚 Database Sambung Kata: ${getWordCount().toLocaleString('id-ID')} kata`
    );
  }
);

/*
==================================================
LOGIN
==================================================
*/

client.login(
  DISCORD_TOKEN
);
