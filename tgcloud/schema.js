import { integer, table, text } from 'sdk/db';

// Только технический ключ аккаунта и лучшие результаты. Без профилей и истории.
export const tableProgress = table('table_progress', {
  accountId: integer('account_id').primaryKey(),
  x1: integer('x1'),
  x2: integer('x2'),
  x3: integer('x3'),
  x4: integer('x4'),
  x5: integer('x5'),
  x6: integer('x6'),
  x7: integer('x7'),
  x8: integer('x8'),
  x9: integer('x9'),
  x10: integer('x10')
});

export const accountPlay = table('account_play', {
  accountId: integer('account_id').primaryKey(),
  revision: integer('revision').notNull(),
  writeId: text('write_id').notNull(),
  state: text('state').notNull()
});

export const accountRound = table('account_round', {
  roundKey: text('round_key').primaryKey(),
  mode: integer('mode').notNull(),
  correct: integer('correct').notNull(),
  total: integer('total').notNull()
});

export const accountRoundProgress = table('account_round_progress', {
  roundKey: text('round_key').primaryKey(),
  mode: integer('mode').notNull(),
  playedLo: integer('played_lo').notNull(),
  playedHi: integer('played_hi').notNull(),
  solvedLo: integer('solved_lo').notNull(),
  solvedHi: integer('solved_hi').notNull()
});

export const accountRoundResult = table('account_round_result', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roundKey: text('round_key').notNull().unique(),
  mode: integer('mode').notNull(),
  completedAt: integer('completed_at').notNull(),
  scores: text('scores').notNull()
});
