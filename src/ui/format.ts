/** Number/string formatting shared by screens. Keep pure and side-effect free. */

export function fmtCredits(n: number): string {
  return `Cr. ${Math.round(n).toLocaleString('en-US')}`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtHp(kw: number): string {
  return `${Math.round(kw * 1.341)} hp`;
}

export function fmtKw(kw: number): string {
  return `${Math.round(kw)} kW`;
}

export function fmtNm(nm: number): string {
  return `${Math.round(nm)} Nm`;
}

export function fmtKg(kg: number): string {
  return `${Math.round(kg)} kg`;
}

export function fmtKm(m: number): string {
  return `${(m / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} km`;
}

export function fmtPP(pp: number): string {
  return `${pp} PP`;
}

export function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function fmtSpeed(kmh: number, units: 'kmh' | 'mph'): string {
  const v = units === 'mph' ? kmh * 0.621 : kmh;
  return Math.round(v).toString();
}

export function fmtSigned(v: number, digits = 2): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
}

export function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
