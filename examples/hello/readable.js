// Reading time and Flesch reading ease for a piece of English text.
const syllables = w => (w.toLowerCase().replace(/(?:[^laeiouy]|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g) ?? []).length || 1;

export function measure(text) {
  const words = text.match(/[A-Za-z'’]+/g) ?? [];
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const ease = words.length ? 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length) : 0;
  return { words: words.length, minutes: Math.max(1, Math.round(words.length / 230)), grade: Math.round(ease) };
}
