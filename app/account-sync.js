export const emptyTotals = () => [0, 0, 0, 0, 0, 0];
export const validTotals = totals => Array.isArray(totals) && totals.length === 6 &&
  totals.every(n => Number.isSafeInteger(n) && n >= 0);
export const addTotals = (previous, delta) => previous.map((total, i) => total + delta[i]);
export const newPlayId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)),
  byte => byte.toString(16).padStart(2, '0')).join('');

export function createAccountSync({ call, cache, seed, persist, onRemote, onTotals,
  loadRounds = () => [], persistRound = () => {}, removeRound = () => {} }) {
  let { revision = null, pending = null, staged = null, state = null, totals = null } = cache ?? {};
  const rounds = new Map();
  function loadOutbox() {
    for (const round of loadRounds()) rounds.set(round.roundId, round);
  }
  loadOutbox();
  let work = null;
  let refreshRequested = false;
  const store = () => persist({ revision, pending, staged, state, totals });

  function receive(result, replace, conflict = false) {
    revision = result.revision;
    if (result.totals) {
      totals = result.totals;
      onTotals(totals);
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
        const round = rounds.values().next().value;
        const result = await call({ action: 'record', ...round });
        rounds.delete(round.roundId);
        removeRound(round.roundId);
        totals = result.totals;
        onTotals(totals);
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
    stage(snapshot, delta) {
      state = staged = snapshot;
      if (delta.some(n => n > 0)) {
        const round = { roundId: snapshot.roundId, totals: delta };
        rounds.set(round.roundId, round);
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
