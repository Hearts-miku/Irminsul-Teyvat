import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function loadPack(path) {
  const raw = readFileSync(path, 'utf8');
  const pack = JSON.parse(raw);
  const ids = new Set();
  const stages = new Map(pack.stages.map(s => [s.id, s]));
  const sources = new Set(pack.sources.map(s => s.id));
  if(stages.size!==pack.stages.length || sources.size!==pack.sources.length) throw new Error('内容包范围或来源 ID 重复');
  for (const stage of pack.stages) {
    if (!sources.has(stage.sourceId)) throw new Error('内容包来源缺失');
  }
  for (const record of pack.records) {
    if (ids.has(record.id) || !stages.has(record.stage) || !record.text || (record.sourceId && !sources.has(record.sourceId))) throw new Error('内容包条目无效');
    ids.add(record.id);
  }
  for (const r of pack.records) if (r.branch && !ids.has(r.branch.joins)) throw new Error('对话分支的汇合点缺失');
  return { ...pack, sha256: createHash('sha256').update(raw).digest('hex') };
}

export function createStore(directory, pack,corpus) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'stories.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, progress INTEGER NOT NULL, context TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, role TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS story_records (id TEXT PRIMARY KEY, stage INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS content_packs (id TEXT PRIMARY KEY, version TEXT NOT NULL, sha256 TEXT NOT NULL, imported_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id, created_at);`);
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM story_records');
    const insert = db.prepare('INSERT INTO story_records VALUES (?, ?, ?)');
    for (const row of pack.records) insert.run(row.id, row.stage, JSON.stringify(row));
    db.prepare('INSERT OR REPLACE INTO content_packs VALUES (?, ?, ?, ?)').run(pack.id, pack.version, pack.sha256, new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  const defaults = { mode: 'offline', baseUrl: '', model: '', detail: 'normal' };
  return {
    db,
    settings() { return { ...defaults, ...JSON.parse(db.prepare('SELECT value FROM preferences WHERE id=1').get()?.value ?? '{}') }; },
    saveSettings(value) { db.prepare('INSERT OR REPLACE INTO preferences VALUES (1, ?)').run(JSON.stringify(value)); },
    records(progress) { const raw=corpus?.records(progress);if(raw)return raw;const scope=pack.stages.find(s=>s.id===progress); const independent=scope?.scopeMode==='independent';return db.prepare(`SELECT data FROM story_records WHERE stage ${independent?'=':'<='} ? ORDER BY stage, rowid`).all(progress).map(r => JSON.parse(r.data)); },
    sessions() { return db.prepare('SELECT id,title,progress,created_at FROM sessions ORDER BY created_at DESC').all(); },
    session(id) { const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id); return row && { ...row, context: JSON.parse(row.context) }; },
    createSession(progress = 1) { const id = randomUUID(); db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?)').run(id, '新的旅途', progress, '{}', new Date().toISOString()); return this.session(id); },
    messages(id) { return db.prepare('SELECT * FROM messages WHERE session_id=? ORDER BY rowid').all(id).map(row => ({ ...JSON.parse(row.data), id: row.id, role: row.role })); },
    append(id, role, value) { const message = { ...value, id: randomUUID(), role }; db.prepare('INSERT INTO messages VALUES (?, ?, ?, ?, ?)').run(message.id, id, role, JSON.stringify(value), new Date().toISOString()); return message; },
    updateContext(id, context) { db.prepare('UPDATE sessions SET context=? WHERE id=?').run(JSON.stringify(context), id); },
    title(id, title) { db.prepare('UPDATE sessions SET title=? WHERE id=?').run(title.slice(0, 30), id); },
    setProgress(id, progress) {
      // Changing the boundary clears both sides of history so prior spoilers cannot re-enter a new request.
      db.exec('BEGIN');
      try { db.prepare('DELETE FROM messages WHERE session_id=?').run(id); db.prepare('UPDATE sessions SET progress=?,context=\'{}\',title=\'新的旅途\' WHERE id=?').run(progress, id); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    removeSession(id) { db.prepare('DELETE FROM sessions WHERE id=?').run(id); },
    close() { db.close(); }
  };
}
