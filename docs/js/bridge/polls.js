export function installPolls(ww) {
  const polls = ww.polls;
  polls.addEventListener('updated', () => { state.pollVotesVersion = (state.pollVotesVersion || 0) + 1; });
  window.nostrPolls = {
    tally: (id, n) => polls.tally(id, n),
    vote: (id, i, n) => polls.vote(id, i, n),
    subscribe: (id) => polls.subscribe(id)
  };
}
