/**
 * MonolixSuite writes parameter names as plain identifiers: omega2_V, beta_Cl_tWT, k12.
 * A presentation table reads them as typeset symbols instead - a Greek base, an index
 * hanging below, a variance exponent above. This turns one into the other.
 */

/** A name split into what the eye reads: a base, and what hangs off it. */
export interface Label {
  base: string;
  sup?: string;
  sub?: string;
}

const GREEK: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  eta: "η",
  theta: "θ",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  omega: "ω",
};

// Only the capitals that don't look like a Latin letter
const GREEK_CAPS: Record<string, string> = {
  gamma: "Γ",
  delta: "Δ",
  theta: "Θ",
  lambda: "Λ",
  phi: "Φ",
  sigma: "Σ",
  omega: "Ω",
};

// Whole token only, never a substring: a loose match would turn alphaCl into αCl.
function greek(token: string): string {
  const lower = token.toLowerCase();
  if (token === lower) {
    return GREEK[lower] ?? token;
  }
  if (token === lower.charAt(0).toUpperCase() + lower.slice(1)) {
    return GREEK_CAPS[lower] ?? token;
  }
  return token;
}

// A multi-part index reads as one subscript: corr_V_Cl is the V,Cl term, not V then Cl.
function subscript(rest: string): string {
  return rest.split("_").join(",");
}

export function parseSymbol(name: string): Label {
  // buildParameterView already strips _pop off a run's own parameters, but this also
  // formats column headers and pass-through names, so it has to be total.
  const trimmed = name.trim().replace(/_pop$/, "");
  if (trimmed === "") {
    return { base: "" };
  }

  // omega2_X is the variance, omega_X the standard deviation: the 2 is an exponent on the
  // symbol, not part of its name.
  const omega = /^omega(2?)_(.+)$/.exec(trimmed);
  if (omega) {
    return {
      base: "ω",
      sup: omega[1] === "2" ? "2" : undefined,
      sub: subscript(omega[2]),
    };
  }

  // Kept upright rather than turned into a rho: Monolix users read these as "corr", and
  // the table should still name what the application named.
  const corr = /^corr_(.+)$/.exec(trimmed);
  if (corr) {
    return { base: "corr", sub: subscript(corr[1]) };
  }

  const split = /^([A-Za-z]+)_(.+)$/.exec(trimmed);
  if (split) {
    return { base: greek(split[1]), sub: subscript(split[2]) };
  }

  // No underscore left: a trailing run of digits is an index rather than part of the name.
  const indexed = /^([A-Za-z]+?)(\d+)$/.exec(trimmed);
  if (indexed) {
    return { base: greek(indexed[1]), sub: indexed[2] };
  }

  return { base: greek(trimmed) };
}
