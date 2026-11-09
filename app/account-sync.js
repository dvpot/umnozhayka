export const emptyTotals = () => [0, 0, 0, 0, 0, 0];
export const validTotals = totals => Array.isArray(totals) && totals.length === 6 &&
  totals.every(n => Number.isSafeInteger(n) && n >= 0);
export const newPlayId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)),
  byte => byte.toString(16).padStart(2, '0')).join('');

export function createAccountSync({ call, cache, seed, persist, onRemote, onTotals,
  loadRounds = () => [], persistRound = () => {}, removeRound = () => {} }) {
  let { revision = null, pending = null, staged = null, state = null, totals = null, latest = null, errors = null } = cache ?? {};
  const rounds = new Map();
  function loadOutbox() {
    for (const round of loadRounds()) rounds.set(round.key ?? round.roundId, round);
  }
  loadOutbox();
  let work = null;
  let refreshRequested = false;
  const store = () => persist({ revision, pending, staged, state, totals, latest, errors });

  function receive(result, replace, conflict = false) {
    revision = result.revision;
    if (result.totals) {
      totals = result.totals;
      latest = result.latest ?? latest;
      errors = result.errors ?? errors;
      onTotals(totals, latest, errors);
    }
    if (replace && result.state) {
      state = result.state;
      onRemote(state, conflict);
    }
    store();
  }

  async function drain() {
    while (pending || staged || rounds.size || refreshRequested) {
      if (rounds.size) {
        const first = rounds.values().next().value;
        const { key, wrong, ...input } = first;
        const batch = key
          ? [...rounds].filter(([, round]) => round.key && round.roundId === first.roundId &&
            typeof round.wrong === typeof wrong).slice(0, 100)
          : [[first.roundId, first]];
        if (typeof wrong === 'boolean') input.wrongIds = batch.filter(([, round]) => round.wrong).map(([id]) => id);
        for (const [, round] of batch.slice(1)) {
          input.played = input.played.map((word, i) => Number(BigInt(word) | BigInt(round.played[i])));
          input.solved = input.solved.map((word, i) => Number(BigInt(word) | BigInt(round.solved[i])));
          if (round.scores) {
            input.scores = round.scores;
            input.completedAt = round.completedAt;
          }
        }
        const result = await call({ action: key ? 'recordLive' : 'record', ...input });
        for (const [entryKey] of batch) {
          rounds.delete(entryKey);
          removeRound(entryKey);
        }
        if (result.latest || !latest) {
          totals = result.totals;
          latest = result.latest ?? latest;
          errors = result.errors ?? errors;
          onTotals(totals, latest, errors);
        }
        store();
      } else if (revision === null || (!pending && !staged)) {
        refreshRequested = false;
        const result = await call({ action: 'read' });
        if (result.state && result.revision !== revision) {
          const conflict = Boolean(pending || staged);
          pending = null;
          staged = null;
          receive(result, true, conflict);
        } else {
          if (!result.state && !pending && !staged && seed) state = staged = seed;
          receive(result, false);
        }
        seed = null;
      } else {
        if (!pending) {
          pending = { state: staged, revision, writeId: newPlayId() };
          staged = null;
          store();
        }
        const result = await call({ action: 'save', ...pending });
        const accepted = result.writeId === pending.writeId;
        pending = null;
        if (!accepted) staged = null;
        receive(result, !accepted, !accepted);
      }
    }
  }

  return {
    stage(snapshot, progress) {
      state = staged = snapshot;
      if (progress) {
        const round = { ...progress, roundId: snapshot.roundId, key: newPlayId() };
        rounds.set(round.key, round);
        persistRound(round);
      }
      store();
    },
    sync(refresh = false) {
      if (refresh) loadOutbox();
      refreshRequested ||= refresh;
      work ??= drain().finally(() => { work = null; });
      return work;
    }
  };
}
