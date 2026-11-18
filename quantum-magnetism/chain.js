/* Quantenmagnetismus – quantum Ising ring (transverse-field Ising model), exact diagonalisation without DOM.
   window.QuantumChain:
     H = −J Σ_i σᶻ_i σᶻ_{i+1} − Γ Σ_i σˣ_i − h Σ_i σᶻ_i      ring of N spins ½ (periodic), Pauli matrices
     Basis state s = bit pattern, bit i = 1 ↔ spin i up (σᶻ = +1). Dimension 2^N (N ≤ 12).
     ground({ N, J, gamma, h }) → { E0, psi }   ground state by Lanczos. Without a field (h = 0) the Hamiltonian keeps
                    the parity P = Π σˣ (flipping all spins); both sectors are solved separately and the lower one wins
                    (the even one on a tie). So for Γ → 0 the ferromagnet gives the "cat" state (|↑↑…⟩ + |↓↓…⟩)/√2
                    instead of an arbitrary mix of the two degenerate states.
     levels({ N, J, gamma, h }, k) → the k lowest energies. Lanczos (full reorthogonalisation, fixed pseudo-random
                    start) per parity sector at h = 0; within a sector degenerate levels appear once, so the list
                    is the same for every Γ (no levels that come and go)
     observe(psi, N) → { sx[i], sz[i], zz[r] (⟨σᶻ_0 σᶻ_r⟩, r = 0…N/2), entropy (von-Neumann entropy in bits of
                    the first ⌊N/2⌋ spins), top: [{ s, p }] the most likely basis states }
     exactE0(N, J, gamma) → ground state energy at h = 0 from the free-fermion solution (Pfeuty 1970), for tests */
(function (root) {
  'use strict';

  function diagonal(N, J, h) {
    const dim = 1 << N, d = new Float64Array(dim);
    for (let s = 0; s < dim; s++) {
      let e = 0;
      for (let i = 0; i < N; i++) {
        const zi = (s >> i) & 1 ? 1 : -1;
        const zj = (s >> ((i + 1) % N)) & 1 ? 1 : -1;
        e -= J * zi * zj;
        e -= h * zi;
      }
      d[s] = e;
    }
    return d;
  }

  function apply(N, d, gamma, x, y) {
    const dim = x.length;
    for (let s = 0; s < dim; s++) {
      let v = d[s] * x[s];
      for (let i = 0; i < N; i++) v -= gamma * x[s ^ (1 << i)];
      y[s] = v;
    }
  }

  // Eigenvalues (and optionally eigenvectors) of a symmetric tridiagonal matrix: implicit QL (tql2)
  function tql(a, b, wantVec) {
    const m = a.length, dd = Float64Array.from(a), e = new Float64Array(m);
    for (let i = 1; i < m; i++) e[i - 1] = b[i - 1];
    const z = wantVec ? Array.from({ length: m }, (_, i) => { const r = new Float64Array(m); r[i] = 1; return r; }) : null;
    for (let l = 0; l < m; l++) {
      let iter = 0, mm;
      do {
        for (mm = l; mm < m - 1; mm++) {
          const s = Math.abs(dd[mm]) + Math.abs(dd[mm + 1]);
          if (Math.abs(e[mm]) <= 1e-15 * s) break;
        }
        if (mm !== l) {
          if (iter++ > 60) break;
          let g = (dd[l + 1] - dd[l]) / (2 * e[l]);
          let r = Math.hypot(g, 1);
          g = dd[mm] - dd[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
          let s = 1, c = 1, p = 0, i;
          for (i = mm - 1; i >= l; i--) {
            let f = s * e[i];
            const bb = c * e[i];
            r = Math.hypot(f, g);
            e[i + 1] = r;
            if (r === 0) { dd[i + 1] -= p; e[mm] = 0; break; }
            s = f / r; c = g / r;
            g = dd[i + 1] - p;
            r = (dd[i] - g) * s + 2 * c * bb;
            p = s * r;
            dd[i + 1] = g + p;
            g = c * r - bb;
            if (z) for (let k = 0; k < m; k++) {
              f = z[k][i + 1];
              z[k][i + 1] = s * z[k][i] + c * f;
              z[k][i] = c * z[k][i] - s * f;
            }
          }
          if (r === 0 && i >= l) continue;
          dd[l] -= p; e[l] = g; e[mm] = 0;
        }
      } while (mm !== l);
    }
    return { values: dd, vectors: z }; // vectors[k][j]: component k of eigenvector j
  }

  // Fixed pseudo-random numbers in [−1, 1): the same start vector every time (reproducible results)
  function startVector(dim, sector) {
    let a = 12345;
    const v = new Float64Array(dim);
    for (let s = 0; s < dim; s++) {
      a = (Math.imul(a, 1103515245) + 12345) >>> 0;
      v[s] = (a / 4294967296) * 2 - 1 + 0.5;
    }
    // sector +1: even under flipping all spins (s ↔ dim−1−s), −1: odd, 0: no symmetry
    if (sector) for (let s = 0; s < dim / 2; s++) { const t = dim - 1 - s, m = (v[s] + sector * v[t]) / 2; v[s] = m; v[t] = sector * m; }
    return v;
  }

  function lanczos(p, maxIter, sector, wantVec) {
    const N = p.N, dim = 1 << N, d = diagonal(N, p.J, p.h || 0);
    const m = Math.min(dim, maxIter);
    const V = [];
    let v = startVector(dim, sector);
    let nrm = 0;
    for (const x of v) nrm += x * x;
    nrm = Math.sqrt(nrm);
    for (let s = 0; s < dim; s++) v[s] /= nrm;
    const a = [], b = [], w = new Float64Array(dim);
    for (let j = 0; j < m; j++) {
      V.push(v);
      apply(N, d, p.gamma, v, w);
      let al = 0;
      for (let s = 0; s < dim; s++) al += w[s] * v[s];
      a.push(al);
      // Full reorthogonalisation (twice is enough) against all earlier vectors
      for (let rep = 0; rep < 2; rep++) for (const u of V) {
        let c = 0;
        for (let s = 0; s < dim; s++) c += w[s] * u[s];
        for (let s = 0; s < dim; s++) w[s] -= c * u[s];
      }
      let be = 0;
      for (let s = 0; s < dim; s++) be += w[s] * w[s];
      be = Math.sqrt(be);
      if (j === m - 1 || be < 1e-10) break;
      b.push(be);
      v = new Float64Array(dim);
      for (let s = 0; s < dim; s++) v[s] = w[s] / be;
    }
    const r = tql(a, b, wantVec);
    return { r, V, dim };
  }

  const sectors = p => p.h ? [0] : [1, -1];
  function groundIn(p, sector) {
    const { r, V, dim } = lanczos(p, 90, sector, true);
    let k = 0;
    for (let i = 1; i < r.values.length; i++) if (r.values[i] < r.values[k]) k = i;
    const psi = new Float64Array(dim);
    for (let j = 0; j < V.length; j++) {
      const c = r.vectors[j][k];
      const u = V[j];
      for (let s = 0; s < dim; s++) psi[s] += c * u[s];
    }
    let nrm = 0;
    for (let s = 0; s < dim; s++) nrm += psi[s] * psi[s];
    nrm = Math.sqrt(nrm);
    // Sign convention: the largest amplitude (first one on a tie) is positive
    let big = 0;
    for (let s = 0; s < dim; s++) if (Math.abs(psi[s]) > Math.abs(psi[big]) + 1e-12) big = s;
    const sg = psi[big] < 0 ? -1 : 1;
    for (let s = 0; s < dim; s++) psi[s] *= sg / nrm;
    return { E0: r.values[k], psi };
  }
  function ground(p) {
    let best = null;
    for (const sec of sectors(p)) {
      const g = groundIn(p, sec);
      if (!best || g.E0 < best.E0 - 1e-9 * Math.max(1, Math.abs(g.E0))) best = g;
    }
    return best;
  }

  function levels(p, count) {
    const all = [];
    for (const sec of sectors(p)) {
      const { r } = lanczos(p, 70, sec, false);
      const v = Array.from(r.values).sort((x, y) => x - y), out = [];
      for (const x of v) if (!out.length || x - out[out.length - 1] > 1e-6 * Math.max(1, Math.abs(x))) out.push(x);
      all.push(...out.slice(0, count));
    }
    return all.sort((x, y) => x - y).slice(0, count);
  }

  // Eigenvalues of a small symmetric matrix (Jacobi rotations)
  function symEig(A, n) {
    const a = A.map(r => Float64Array.from(r));
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
      if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
      }
    }
    return Array.from({ length: n }, (_, i) => a[i][i]);
  }

  function observe(psi, N) {
    const dim = psi.length;
    const sx = new Array(N).fill(0), sz = new Array(N).fill(0), zz = new Array((N >> 1) + 1).fill(0);
    for (let s = 0; s < dim; s++) {
      const p = psi[s] * psi[s];
      if (!p) continue;
      const z0 = s & 1 ? 1 : -1;
      for (let i = 0; i < N; i++) {
        const zi = (s >> i) & 1 ? 1 : -1;
        sz[i] += p * zi;
        sx[i] += psi[s] * psi[s ^ (1 << i)];
        if (i < zz.length) zz[i] += p * z0 * zi;
      }
    }
    // Entanglement of the first A spins with the rest: ρ_A = M Mᵀ, M[a][b] = ψ(a + b·2^A)
    const A = N >> 1, da = 1 << A, db = dim >> A;
    const rho = Array.from({ length: da }, () => new Float64Array(da));
    for (let i = 0; i < da; i++) for (let j = i; j < da; j++) {
      let c = 0;
      for (let b = 0; b < db; b++) c += psi[i + (b << A)] * psi[j + (b << A)];
      rho[i][j] = c; rho[j][i] = c;
    }
    let entropy = 0;
    if (A > 0) for (const l of symEig(rho, da)) if (l > 1e-12) entropy -= l * Math.log2(l);
    const idx = Array.from({ length: dim }, (_, s) => s).sort((x, y) => psi[y] * psi[y] - psi[x] * psi[x] || x - y);
    const top = idx.slice(0, 6).map(s => ({ s, p: psi[s] * psi[s] }));
    return { sx, sz, zz, entropy: Math.max(0, entropy), top };
  }

  function exactE0(N, J, gamma) {
    let e = 0;
    for (let n = 0; n < N; n++) {
      const k = Math.PI * (2 * n + 1) / N;
      e -= Math.sqrt(J * J + gamma * gamma - 2 * J * gamma * Math.cos(k));
    }
    return e;
  }

  root.QuantumChain = { ground, levels, observe, exactE0, diagonal };
})(typeof window !== 'undefined' ? window : globalThis);
