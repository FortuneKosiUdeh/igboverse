import { getDb } from './db';

export async function findWordByWord(word: string) {
  const db = await getDb();
  return db.collection('words').findOne({ word });
}

export async function findWordById(id: string) {
  const db = await getDb();
  return db.collection('words').findOne({ _id: id });
}

export async function upsertWord(doc: any) {
  const db = await getDb();
  const col = db.collection('words');
  if (doc._id) {
    return col.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }
  return col.updateOne({ word: doc.word }, { $set: doc }, { upsert: true });
}

export async function searchWords(query: any, opts: any = {}) {
  const db = await getDb();
  return db.collection('words').find(query, opts).toArray();
}
