const fs = require('fs');
const path = require('path');

const wordsPath = path.join(__dirname, 'words.json');

let data;

try {
  data = JSON.parse(
    fs.readFileSync(wordsPath, 'utf8')
  );
} catch (error) {
  console.error('❌ Gagal membaca data/words.json');
  console.error(error);
  process.exit(1);
}

// Bisa menerima:
// [
//   "manusia",
//   "rumah"
// ]
//
// atau:
// {
//   "words": [
//     "manusia",
//     "rumah"
//   ]
// }

const rawWords = Array.isArray(data)
  ? data
  : Array.isArray(data.words)
    ? data.words
    : [];

/**
 * Membersihkan kata untuk kebutuhan pengecekan.
 */
function normalizeWord(word) {
  return String(word)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

/**
 * Database utama.
 */
const wordSet = new Set();

for (const word of rawWords) {
  const original = String(word)
    .trim()
    .toLowerCase();

  // Hanya menerima kata yang benar-benar terdiri
  // dari huruf a-z.
  if (!/^[a-z]+$/.test(original)) {
    continue;
  }

  // Minimal 3 huruf.
  if (original.length < 3) {
    continue;
  }

  wordSet.add(original);
}

const words = [...wordSet];

/**
 * Mengecek apakah kata ada di database.
 */
function isValidWord(word) {
  const normalized = normalizeWord(word);

  if (!normalized) {
    return false;
  }

  return wordSet.has(normalized);
}

/**
 * Mengambil kata random dari database.
 */
function getRandomWord() {
  if (words.length === 0) {
    throw new Error(
      'Database kata kosong. Isi data/words.json terlebih dahulu.'
    );
  }

  const index = Math.floor(
    Math.random() * words.length
  );

  return words[index];
}

/**
 * Jumlah kata yang tersedia.
 */
function getWordCount() {
  return wordSet.size;
}

module.exports = {
  words,
  wordSet,
  normalizeWord,
  isValidWord,
  getRandomWord,
  getWordCount
};
