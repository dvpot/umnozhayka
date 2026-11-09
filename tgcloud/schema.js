import { integer, table } from 'sdk/db';

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
