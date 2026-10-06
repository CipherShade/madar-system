/**
 * Arabic Text Normalization Utility
 *
 * Normalizes Arabic text to allow fast, fuzzy, and phonetic matching
 * during rush-hour student search at the lobby door.
 *
 * Invariants:
 * - Strips Tashkeel / Harakat (Fatha, Damma, Kasra, Sukun, Shaddah, Tanween)
 * - Normalizes Alef variations (أ, إ, آ -> ا)
 * - Normalizes Taa Marbouta to Haa (ة -> ه)
 * - Normalizes Alef Maksoura to Yaa (ى -> ي)
 * - Strips tatweel (ـ)
 * - Trims multiple whitespace into a single space
 */
export function normalizeArabicText(text) {
    if (!text)
        return '';
    return text
        .replace(/[\u064B-\u065F\u0670]/g, '') // Remove Harakat/Tashkeel
        .replace(/[\u0640]/g, '') // Remove Tatweel (Kashida)
        .replace(/[أإآا]/g, 'ا') // Normalize Alef variants to bare Alef
        .replace(/ة/g, 'ه') // Normalize Taa Marbouta to Haa
        .replace(/ى/g, 'ي') // Normalize Alef Maksoura to Yaa
        .replace(/\s+/g, ' ') // Normalize multiple spaces
        .trim()
        .toLowerCase();
}
