// Web Worker: runs thousands of simulated tournaments off the main
// thread so the page stays smooth while the numbers crunch.
import { fitModel, simulateMany } from './model.js';

self.onmessage = (e) => {
  const { groups, matches, upTo, n, seed } = e.data;
  const teams = Object.values(groups).flat();
  const t0 = performance.now();
  const model = fitModel(teams, matches, { upTo });
  const res = simulateMany(groups, matches, model, {
    n, upTo, seed,
    onProgress: done => self.postMessage({ type: 'progress', done, n })
  });
  self.postMessage({ type: 'done', ...res, model, ms: Math.round(performance.now() - t0) });
};
