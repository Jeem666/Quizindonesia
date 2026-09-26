const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'scores.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ users: {} }, null, 2));

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { users: {} }; }
}
function save(data) { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }
function ensureUser(user) {
  const data = load();
  if (!data.users[user.id]) data.users[user.id] = { id: user.id, username: user.username, points: 0, correct: 0, wrong: 0, games: 0 };
  data.users[user.id].username = user.username;
  save(data);
  return data.users[user.id];
}
function addStats(user, patch) {
  const data = load();
  if (!data.users[user.id]) data.users[user.id] = { id: user.id, username: user.username, points: 0, correct: 0, wrong: 0, games: 0 };
  const u = data.users[user.id];
  u.username = user.username;
  for (const [key, value] of Object.entries(patch)) u[key] = (u[key] || 0) + value;
  save(data);
  return u;
}
function leaderboard(limit = 10) {
  return Object.values(load().users).sort((a,b) => b.points - a.points).slice(0, limit);
}
function getUser(id) { return load().users[id] || null; }
function resetAll() { save({ users: {} }); }
module.exports = { ensureUser, addStats, leaderboard, getUser, resetAll };
