/* Quantenmagnetismus – classical Ising model on a lattice, without DOM.
   window.IsingLattice:
     build(type, L) → lattice { type, L, n, z, nb, bonds, x, y, W, H, sub, nsub }
       type  'square' | 'triangular' | 'kagome'; L = linear size in unit cells (periodic boundaries)
             square: L×L sites, 4 neighbours; triangular: L×L sites, 6 neighbours (L multiple of 3, so the three
             sublattices fit); kagome: L×L cells with 3 sites each, 4 neighbours.
       nb    Int32Array n·z: neighbours of site i are nb[i·z … i·z+z−1]
       bonds Int32Array of pairs (i, j), every nearest-neighbour bond once
       x, y  drawing position of every site (bond length 1); W × H = drawing size. The lattice is periodic along
             x, so x is wrapped into [0, W) and the drawing is a rectangle; bonds that wrap around are not drawn.
       sub   sublattice of every site (square: 2 like a chessboard, triangular and kagome: 3)
     createSim(lattice, seed) → sim with
       s            Int8Array spins ±1
       set({ J, h, T })   coupling (J > 0 ferro, J < 0 antiferro), field h, temperature T (k_B = 1, units of |J|)
                    H = −J Σ_<ij> s_i s_j − h Σ_i s_i
       flips(k)     k single-spin Metropolis steps on random sites (one sweep = n steps)
       sweep(k)     k sweeps
       randomize() / order(kind)  hot start / 'up', 'down', 'neel' (lowest energy pattern for J < 0 on the
                    square lattice, a two-up-one-down pattern on the triangular and kagome lattices)
       measure()    { m, ms, e, frustrated, acc }: magnetisation per site, staggered (order parameter of the
                    antiferromagnet: chessboard on the square lattice, largest sublattice difference otherwise),
                    energy per site, share of bonds with J s_i s_j < 0, acceptance rate since the last measure()
     exact(type, J) → { tc, e0, s0 } known results (see README.md): critical temperature (null if none),
                    ground state energy per site and residual entropy per site at h = 0
     onsagerM(T)  spontaneous magnetisation of the square-lattice ferromagnet (Onsager/Yang), 0 above Tc */
(function (root) {
  'use strict';
  const S3 = Math.sqrt(3) / 2;
  const mod = (a, b) => ((a % b) + b) % b;

  function build(type, L) {
    if (type === 'square') {
      const n = L * L, z = 4, nb = new Int32Array(n * z), x = new Float32Array(n), y = new Float32Array(n), sub = new Uint8Array(n);
      const id = (i, j) => mod(j, L) * L + mod(i, L);
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const k = id(i, j);
        nb.set([id(i + 1, j), id(i - 1, j), id(i, j + 1), id(i, j - 1)], k * z);
        x[k] = i + 0.5; y[k] = j + 0.5; sub[k] = (i + j) & 1;
      }
      return finish({ type, L, n, z, nb, x, y, sub, nsub: 2, W: L, H: L });
    }
    if (type === 'triangular') {
      // Axial coordinates: a1 = (1, 0), a2 = (1/2, √3/2); neighbours ±a1, ±a2, ±(a1 − a2)
      const n = L * L, z = 6, nb = new Int32Array(n * z), x = new Float32Array(n), y = new Float32Array(n), sub = new Uint8Array(n);
      const id = (i, j) => mod(j, L) * L + mod(i, L);
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const k = id(i, j);
        nb.set([id(i + 1, j), id(i - 1, j), id(i, j + 1), id(i, j - 1), id(i + 1, j - 1), id(i - 1, j + 1)], k * z);
        x[k] = mod(i + j / 2 + 0.5, L); y[k] = (j + 0.5) * S3; sub[k] = mod(i - j, 3);
      }
      return finish({ type, L, n, z, nb, x, y, sub, nsub: 3, W: L, H: L * S3 });
    }
    if (type === 'kagome') {
      // Triangular Bravais lattice a1 = (2, 0), a2 = (1, √3), sites A = 0, B = a1/2, C = a2/2 in every cell
      const n = 3 * L * L, z = 4, nb = new Int32Array(n * z), x = new Float32Array(n), y = new Float32Array(n), sub = new Uint8Array(n);
      const id = (i, j, s) => 3 * (mod(j, L) * L + mod(i, L)) + s;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const a = id(i, j, 0), b = id(i, j, 1), c = id(i, j, 2);
        nb.set([b, c, id(i - 1, j, 1), id(i, j - 1, 2)], a * z);
        nb.set([a, c, id(i + 1, j, 0), id(i + 1, j - 1, 2)], b * z);
        nb.set([a, b, id(i, j + 1, 0), id(i - 1, j + 1, 1)], c * z);
        const ox = 2 * i + j, oy = 2 * S3 * j;
        x[a] = mod(ox + 0.5, 2 * L); y[a] = oy + S3 / 2;
        x[b] = mod(ox + 1.5, 2 * L); y[b] = oy + S3 / 2;
        x[c] = mod(ox + 1, 2 * L); y[c] = oy + S3 * 1.5;
        sub[a] = 0; sub[b] = 1; sub[c] = 2;
      }
      return finish({ type, L, n, z, nb, x, y, sub, nsub: 3, W: 2 * L, H: 2 * S3 * L });
    }
    throw new Error('unknown lattice ' + type);
  }
  // Bond list (each pair once) from the neighbour table
  function finish(lat) {
    const pairs = [];
    for (let i = 0; i < lat.n; i++) for (let k = 0; k < lat.z; k++) {
      const j = lat.nb[i * lat.z + k];
      if (i < j) pairs.push(i, j);
    }
    lat.bonds = Int32Array.from(pairs);
    return lat;
  }

  // Small, fast, seedable random numbers (mulberry32)
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createSim(lat, seed) {
    const { n, z, nb } = lat;
    const s = new Int8Array(n).fill(1);
    let rand = rng(seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed);
    let J = 1, h = 0, T = 2;
    // Acceptance probability for flipping spin s with neighbour sum σ: table index ((s+1)/2)·(z+1) + (σ+z)/2
    const acc = new Float64Array(2 * (z + 1));
    let tried = 0, accepted = 0;
    function table() {
      for (let si = 0; si < 2; si++) for (let q = 0; q <= z; q++) {
        const sp = si ? 1 : -1, sum = 2 * q - z;
        const dE = 2 * sp * (J * sum + h);
        acc[si * (z + 1) + q] = dE <= 0 ? 1 : (T > 0 ? Math.exp(-dE / T) : 0);
      }
    }
    table();
    const sim = {
      lat, s,
      get J() { return J; }, get h() { return h; }, get T() { return T; },
      seed(v) { rand = rng(v); },
      set(p) {
        if (p.J != null) J = p.J;
        if (p.h != null) h = p.h;
        if (p.T != null) T = Math.max(0, p.T);
        table();
      },
      flips(k) {
        for (let t = 0; t < k; t++) {
          const i = (rand() * n) | 0;
          let sum = 0;
          for (let q = i * z, e = q + z; q < e; q++) sum += s[nb[q]];
          const si = s[i];
          const p = acc[(si > 0 ? z + 1 : 0) + ((sum + z) >> 1)];
          tried++;
          if (p >= 1 || rand() < p) { s[i] = -si; accepted++; }
        }
      },
      sweep(k = 1) { sim.flips(k * n); },
      randomize() { for (let i = 0; i < n; i++) s[i] = rand() < 0.5 ? 1 : -1; },
      order(kind) {
        for (let i = 0; i < n; i++) {
          if (kind === 'down') s[i] = -1;
          else if (kind === 'neel') s[i] = lat.nsub === 2 ? (lat.sub[i] ? -1 : 1) : (lat.sub[i] === 2 ? -1 : 1);
          else s[i] = 1;
        }
      },
      measure() {
        let m = 0;
        const subSum = new Float64Array(lat.nsub), subN = new Float64Array(lat.nsub);
        for (let i = 0; i < n; i++) { m += s[i]; subSum[lat.sub[i]] += s[i]; subN[lat.sub[i]]++; }
        let bond = 0, bad = 0;
        const b = lat.bonds;
        for (let k = 0; k < b.length; k += 2) {
          const p = s[b[k]] * s[b[k + 1]];
          bond += p;
          if (J * p < 0) bad++;
        }
        let ms;
        if (lat.nsub === 2) ms = (subSum[0] / subN[0] - subSum[1] / subN[1]) / 2;
        else {
          // Largest difference between two sublattice magnetisations, /2 → 1 for a perfect up-down pattern
          const v = Array.from(subSum, (x, k) => x / subN[k]);
          ms = (Math.max(...v) - Math.min(...v)) / 2;
        }
        const r = { m: m / n, ms, e: (-J * bond - h * m) / n, frustrated: b.length ? bad / (b.length / 2) : 0, acc: tried ? accepted / tried : 0 };
        tried = 0; accepted = 0;
        return r;
      }
    };
    return sim;
  }

  const TC = {
    square: 2 / Math.log(1 + Math.SQRT2),
    triangular: 4 / Math.log(3),
    kagome: 4 / Math.log(3 + 2 * Math.sqrt(3))
  };
  // Residual entropy per site of the Ising antiferromagnet (Wannier 1950, Kanô & Naya 1953)
  const S0_AF = { triangular: 0.3383, kagome: 0.5018 };
  function exact(type, J) {
    const z = { square: 4, triangular: 6, kagome: 4 }[type];
    const bondsPerSite = z / 2;
    if (J >= 0 || type === 'square') return { tc: TC[type], e0: -Math.abs(J) * bondsPerSite, s0: 0 };
    // Frustrated antiferromagnet: in every triangle at least one of three bonds is unhappy → a third of all bonds
    return { tc: null, e0: -Math.abs(J) * bondsPerSite / 3, s0: S0_AF[type] };
  }
  function onsagerM(T) {
    if (!(T < TC.square)) return 0;
    if (T <= 0) return 1;
    return Math.pow(1 - Math.pow(Math.sinh(2 / T), -4), 1 / 8);
  }

  root.IsingLattice = { build, createSim, exact, onsagerM, TC, rng };
})(typeof window !== 'undefined' ? window : globalThis);
