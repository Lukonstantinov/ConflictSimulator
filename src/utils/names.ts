/**
 * Procedural fantasy country name generator.
 * Uses syllable chains to produce names like "Valdoria", "Kethnar", "Zephyrim".
 */

const PREFIXES = [
  'Val', 'Kal', 'Zeph', 'Mor', 'Dra', 'Ash', 'Eld', 'Nor', 'Var', 'Sol',
  'Kor', 'Thal', 'Gar', 'Fen', 'Bel', 'Syl', 'Rav', 'Tor', 'Cyr', 'Ix',
  'Ael', 'Dur', 'Har', 'Kaz', 'Lyr', 'Myr', 'Ost', 'Pyr', 'Sar', 'Ven',
];

const MIDDLES = [
  'do', 'tha', 'go', 'na', 'ri', 'le', 'ar', 'en', 'or', 'an',
  'al', 'eth', 'is', 'un', 'os', 'ir', 'em', 'ak', 'ul', 'ad',
];

const SUFFIXES = [
  'ria', 'nar', 'ion', 'heim', 'mar', 'gard', 'wyn', 'dor', 'mir',
  'land', 'dale', 'rim', 'oth', 'rak', 'ven', 'lia', 'thas', 'ros',
  'ia', 'um', 'or', 'is', 'ax', 'eon', 'ara', 'iel', 'us', 'ane',
];

const TITLES = [
  'Kingdom of', 'Empire of', 'Republic of', 'Dominion of', 'Realm of',
  'Principality of', 'Confederacy of', 'Sultanate of', 'Free State of',
  'Grand Duchy of',
];

export function generateCountryName(index: number, seed: number): string {
  // Simple hash to get deterministic but varied names
  const hash = (seed * 2654435761 + index * 340573321) >>> 0;

  const pi = hash % PREFIXES.length;
  const mi = (hash >>> 8) % MIDDLES.length;
  const si = (hash >>> 16) % SUFFIXES.length;
  const useMiddle = (hash >>> 24) % 3 !== 0; // 2/3 chance of middle syllable
  const useTitle = (hash >>> 28) % 5 === 0; // 1/5 chance of title prefix

  let name = PREFIXES[pi];
  if (useMiddle) name += MIDDLES[mi];
  name += SUFFIXES[si];

  if (useTitle) {
    const ti = (hash >>> 12) % TITLES.length;
    name = `${TITLES[ti]} ${name}`;
  }

  return name;
}

/** Generate a batch of unique names */
export function generateCountryNames(count: number, seed: number): string[] {
  const names = new Set<string>();
  let idx = 0;
  while (names.size < count && idx < count * 10) {
    names.add(generateCountryName(idx, seed));
    idx++;
  }
  return Array.from(names).slice(0, count);
}
