/**
 * Normalizes a title-search query without interpreting wildcard or regex syntax.
 * @param query - Raw text entered by the user.
 * @returns A trimmed, case-insensitive search value.
 */
export function normalizeTitleSearch(query: string): string {
    return query.trim().toLocaleLowerCase();
}

/**
 * Checks whether a game title contains a title-search query.
 * @param title - Title to inspect.
 * @param query - Raw text entered by the user.
 * @returns Whether the normalized query is empty or a literal substring of the title.
 */
export function titleMatchesSearch(title: string, query: string): boolean {
    const normalizedQuery = normalizeTitleSearch(query);
    return normalizedQuery.length === 0 || title.toLocaleLowerCase().includes(normalizedQuery);
}
