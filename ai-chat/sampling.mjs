// Sampling filter for model.generate (logits_processor). transformers.js 4.3 only applies temperature
// and top_k – top_p is ignored there. Without it, every one of the 64 candidates can be drawn, and with
// a strongly quantised model (Gemma 4 in 2 bits) the tail holds stray pieces from other scripts
// (Chinese, Greek …) that then show up in the middle of German words.
// Keeps the most likely tokens until their probabilities add up to top_p, and drops tokens that are
// less than min_p times as likely as the best one. Works on the logits in place, row by row.
export function samplingFilter({ top_k = 64, top_p = 1, min_p = 0 } = {}) {
  return (input_ids, logits) => {
    const vocab = logits.dims.at(-1), data = logits.data;
    for (let off = 0; off < data.length; off += vocab) filterRow(data, off, vocab, top_k, top_p, min_p);
    return logits;
  };
}

function filterRow(d, off, vocab, topK, topP, minP) {
  const k = Math.min(topK > 0 ? topK : vocab, vocab);
  // The k largest logits, sorted from the largest down
  const vals = new Float64Array(k), idx = new Int32Array(k);
  let n = 0, sum = 0, max = -Infinity;
  for (let i = 0; i < vocab; i++) if (d[off + i] > max) max = d[off + i];
  if (max === -Infinity) return;
  for (let i = 0; i < vocab; i++) {
    const v = d[off + i];
    sum += Math.exp(v - max);
    if (n < k || v > vals[n - 1]) {
      let j = n < k ? n++ : n - 1;
      while (j > 0 && vals[j - 1] < v) { vals[j] = vals[j - 1]; idx[j] = idx[j - 1]; j--; }
      vals[j] = v; idx[j] = i;
    }
  }
  let keep = 0, cum = 0;
  for (; keep < n; keep++) {
    const rel = Math.exp(vals[keep] - max);        // probability relative to the best token
    if (keep > 0 && (cum >= topP || rel < minP)) break;
    cum += rel / sum;
  }
  d.fill(-Infinity, off, off + vocab);
  for (let j = 0; j < keep; j++) d[off + idx[j]] = vals[j];
}
