const columns = Array.from({ length: 10 }, (_, i) => `x${i + 1}`);
const columnList = columns.join(', ');
const updateBest = columns.map(column =>
  `${column} = NULLIF(max(coalesce(table_progress.${column}, -1), coalesce(excluded.${column}, -1)), -1)`
).join(', ');

export async function handleTableProgress(db, input, ctx, RequestError = Error) {
  const id = ctx?.initData?.user?.id;
  if (!Number.isSafeInteger(id) || id <= 0) throw new RequestError('Нужен аккаунт Telegram.');
  const params = { ':id': id };

  let row;
  if (input?.action === 'read') {
    row = await db.get(`SELECT ${columnList} FROM table_progress WHERE account_id = :id`, params);
  } else if (input?.action === 'merge') {
    const { scores } = input;
    if (!Array.isArray(scores) || scores.length !== columns.length ||
        !scores.every(score => score === null || (Number.isInteger(score) && score >= 0 && score <= 10))) {
      throw new RequestError('Некорректный результат проверки.');
    }
    columns.forEach((column, i) => { params[`:${column}`] = scores[i]; });
    const result = await db.run(
      `INSERT INTO table_progress (account_id, ${columnList})
       VALUES (:id, ${columns.map(column => `:${column}`).join(', ')})
       ON CONFLICT(account_id) DO UPDATE SET ${updateBest}
       RETURNING ${columnList}`,
      params
    );
    [row] = result.rows;
  } else {
    throw new RequestError('Неизвестное действие.');
  }
  return { scores: columns.map(column => row?.[column] ?? null) };
}
