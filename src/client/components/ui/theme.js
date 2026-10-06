export const THEMES = ['clean', 'pos', 'dark'];
const THEME_KEY = 'cos_theme';
export function getStoredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    return stored && THEMES.includes(stored) ? stored : 'clean';
}
export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}
export function storeTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
}
