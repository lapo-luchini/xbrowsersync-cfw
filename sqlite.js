import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

const db = await open({
  filename: 'xbskv.sqlite',
  driver: sqlite3.Database,
})
await db.migrate()

export async function get(k) {
  const res = await db.get('SELECT v FROM kv WHERE k = ?', [k])
  return res.v
}

export async function put(k, v) {
  await db.run('REPLACE INTO kv (k, v) VALUES (?, ?)', k, v)
}
