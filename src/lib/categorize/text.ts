/**
 * Text matching for merchant names.
 *
 * Bank descriptions are noisy: "AMZN Mktp US*2K3L9", "STARBUCKS STORE #12345",
 * "APPLE.COM/BILL". Before comparing, both descriptions and keywords go through
 * the SAME normalisation, so a keyword matches however the bank formats it:
 *   - upper case
 *   - punctuation becomes spaces   ("APPLE.COM/BILL" -> "APPLE COM BILL")
 *   - words containing digits go   (store numbers, reference codes, dates)
 *   - filler words go              (COM, INC, LLC, POS, PURCHASE...)
 */
const NOISE_WORDS = new Set(['COM', 'NET', 'WWW', 'INC', 'LLC', 'LTD', 'USA', 'US', 'POS', 'PURCHASE', 'CHECKCARD', 'SQ', 'TST'])

export function normalizeMerchantText(text: string): string {
  return text
    // Remove accents first: "Hydro-Québec" -> "Hydro-Quebec", not "HYDRO QU BEC".
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word !== '' && !/\d/.test(word) && !NOISE_WORDS.has(word))
    .join(' ')
}

/**
 * True if `keyword` appears in `text` as whole words. Both must already be normalised.
 * Whole words matter: "RENT" must match "APARTMENTS RENT" but not "CURRENT ACCOUNT".
 */
export function containsKeyword(normalizedText: string, normalizedKeyword: string): boolean {
  if (normalizedKeyword === '') return false
  return ` ${normalizedText} `.includes(` ${normalizedKeyword} `)
}

/**
 * Suggests a keyword for a new rule from a description:
 * one distinctive word ("STARBUCKS") or the first two short ones ("WHOLE FOODS").
 * Only a suggestion — the user can edit it before saving.
 */
export function suggestKeyword(description: string): string {
  const words = normalizeMerchantText(description).split(' ').filter(Boolean)
  if (words.length === 0) return description.trim()
  return words[0]!.length >= 6 ? words[0]! : words.slice(0, 2).join(' ')
}
