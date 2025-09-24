const TZ = "Europe/Berlin"; // Fest für Migräne-App

export function berlinDateFromUTC(d = new Date()): Date {
  // "spiegelt" UTC in Berlin-Zeit, bleibt ein JS-Date-Objekt
  return new Date(new Date(d).toLocaleString("en-US", { timeZone: TZ }));
}

export function berlinYesterdayMidnightUTC(): Date {
  const nowBerlin = berlinDateFromUTC();
  nowBerlin.setDate(nowBerlin.getDate() - 1);
  nowBerlin.setHours(0, 0, 0, 0);
  
  // Rechne Berlin-00:00 zurück nach UTC
  const offset = nowBerlin.getTimezoneOffset() * 60000;
  const utcTime = nowBerlin.getTime() + offset;
  
  // Korrigiere für Berlin Timezone (UTC+1/UTC+2)
  const berlinOffset = -1 * 60 * 60000; // UTC+1 in Millisekunden
  const berlinTime = utcTime + berlinOffset;
  
  return new Date(berlinTime);
}

export function toISODateUTC(d: Date): string {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

export function berlinDateToday(): string {
  const berlin = berlinDateFromUTC();
  const year = berlin.getFullYear();
  const month = String(berlin.getMonth() + 1).padStart(2, '0');
  const day = String(berlin.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function berlinDateYesterday(): string {
  const berlin = berlinDateFromUTC();
  berlin.setDate(berlin.getDate() - 1);
  const year = berlin.getFullYear();
  const month = String(berlin.getMonth() + 1).padStart(2, '0');
  const day = String(berlin.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}