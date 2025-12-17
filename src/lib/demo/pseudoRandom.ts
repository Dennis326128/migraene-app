/**
 * Seeded Pseudo-Random Number Generator
 * Ensures deterministic, reproducible demo data
 */

export class SeededRandom {
  private seed: number;

  constructor(seedString: string) {
    // Convert string seed to number using simple hash
    this.seed = this.hashString(seedString);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) || 1;
  }

  /**
   * Returns a pseudo-random number between 0 and 1
   */
  next(): number {
    // Mulberry32 algorithm
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  /**
   * Returns a random integer between min (inclusive) and max (inclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Returns true with the given probability (0-1)
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * Picks a random element from an array
   */
  pick<T>(array: readonly T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  /**
   * Shuffles an array (returns new array)
   */
  shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Picks multiple unique elements from an array
   */
  pickMultiple<T>(array: readonly T[], count: number): T[] {
    const shuffled = this.shuffle(array);
    return shuffled.slice(0, Math.min(count, array.length));
  }
}
