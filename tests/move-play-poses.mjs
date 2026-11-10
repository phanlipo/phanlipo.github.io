// Synthetic body poses for MovePlay (move-play.spec.mjs): 33 MediaPipe points of a child standing in the middle of a
// 4:3 picture, as the worker delivers them (Float32Array x, y, z, visibility; x, y 0…1, picture not mirrored – so the
// player's left side is on the right of the picture). Runs in the page and in the fake worker, hence a source string.
//
// makePose({ dy, duck, squat, arms: 'up' | 'left' | 'right' | 'clap', legs: 'apart', hand: [x, y], scale, hide: [i…], x })
//   dy     whole body this far up (picture heights; jump) – torso length is 0.25
//   duck   head and shoulders this far down       squat  everything above the knees this far down
//   hand   the right hand (wrist and index finger) at this picture point
//   scale  size around the middle of the body (player came closer)      hide   these points are not seen
export const POSES = String.raw`
function makePose(o) {
  o = o || {};
  const p = [];
  for (let i = 0; i < 33; i++) p.push([0.5, 0.2]);
  const set = (i, x, y) => { p[i] = [x, y]; };
  // Head (nose 0, eyes, ears, mouth around it)
  for (let i = 1; i <= 10; i++) set(i, 0.5 + (i % 2 ? -1 : 1) * 0.01 * Math.ceil(i / 2), 0.19);
  set(0, 0.5, 0.2);
  set(11, 0.56, 0.3); set(12, 0.44, 0.3);
  set(13, 0.58, 0.42); set(14, 0.42, 0.42);
  set(15, 0.585, 0.53); set(16, 0.415, 0.53);
  for (const [i, w] of [[17, 15], [19, 15], [21, 15], [18, 16], [20, 16], [22, 16]]) set(i, p[w][0], p[w][1] + 0.03);
  set(23, 0.54, 0.55); set(24, 0.46, 0.55);
  set(25, 0.54, 0.72); set(26, 0.46, 0.72);
  set(27, 0.54, 0.88); set(28, 0.46, 0.88);
  for (const [i, a] of [[29, 27], [31, 27], [30, 28], [32, 28]]) set(i, p[a][0], p[a][1] + 0.02);
  const upper = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
  const arm = (side, mode) => {
    const [sh, el, wr, idx] = side === 'l' ? [11, 13, 15, 19] : [12, 14, 16, 20];
    const out = side === 'l' ? 1 : -1;
    if (mode === 'up') { set(el, p[sh][0] + out * 0.05, p[sh][1] - 0.12); set(wr, p[sh][0] + out * 0.06, p[sh][1] - 0.22); set(idx, p[wr][0], p[wr][1] - 0.03); }
    if (mode === 'clap') { set(el, p[sh][0] + out * 0.04, p[sh][1] + 0.1); set(wr, 0.5 + out * 0.012, p[sh][1] + 0.12); set(idx, p[wr][0], p[wr][1] - 0.03); }
  };
  if (o.arms === 'up' || o.arms === 'left') arm('l', 'up');
  if (o.arms === 'up' || o.arms === 'right') arm('r', 'up');
  if (o.arms === 'clap') { arm('l', 'clap'); arm('r', 'clap'); }
  if (o.legs === 'apart') { set(25, 0.57, 0.72); set(26, 0.43, 0.72); set(27, 0.61, 0.88); set(28, 0.39, 0.88); }
  if (o.duck) for (const i of upper) p[i][1] += o.duck;
  if (o.squat) for (let i = 0; i <= 24; i++) p[i][1] += o.squat;
  if (o.hand) { set(16, o.hand[0], o.hand[1]); set(20, o.hand[0], o.hand[1]); }
  const f = new Float32Array(33 * 4);
  const k = o.scale || 1, cx = 0.5, cy = 0.55;
  for (let i = 0; i < 33; i++) {
    f[4 * i] = cx + (p[i][0] - cx) * k + (o.x || 0);
    f[4 * i + 1] = cy + (p[i][1] - cy) * k - (o.dy || 0);
    f[4 * i + 3] = (o.hide || []).includes(i) ? 0.1 : 0.95;
  }
  return f;
}`;
