export type GameSortOption = 'title-asc' | 'title-desc' | 'rating-desc';

interface SortableGame {
    id: number;
    title: string;
    starRating: number | null;
}

const combiningMarks = /[\u0300-\u036f]/g;
const numberChunk = /\d+/g;

/**
 * Builds a deterministic natural-sort key compatible with SQLite scalar-function ordering.
 * Numeric chunks are length-prefixed before zero-padding so "Game 2" sorts before "Game 10",
 * and diacritics are removed to preserve the previous case-insensitive base-sensitivity behavior.
 * @param title - Raw game title.
 * @returns A stable title ordering key.
 */
export function naturalTitleSortKey(title: string): string {
    return title
        .normalize('NFKD')
        .replace(combiningMarks, '')
        .toLocaleLowerCase('en')
        .replace(numberChunk, (chunk) => {
            const numericValue = chunk.replace(/^0+/, '') || '0';
            return `${String(numericValue.length).padStart(4, '0')}:${numericValue.padStart(24, '0')}`;
        });
}

function compareTitles(a: SortableGame, b: SortableGame, direction: 'asc' | 'desc'): number {
    const normalizedTitleA = naturalTitleSortKey(a.title);
    const normalizedTitleB = naturalTitleSortKey(b.title);
    const titleComparison =
        normalizedTitleA < normalizedTitleB ? -1 : normalizedTitleA > normalizedTitleB ? 1 : 0;

    if (titleComparison !== 0) {
        return direction === 'asc' ? titleComparison : -titleComparison;
    }

    return a.id - b.id;
}

/**
 * Returns a new list sorted by title or rating without mutating the source list.
 * Rating order places null ratings after rated games; zero is a valid rating.
 * Equal values use the same natural case-insensitive title order and ID tie-break as SQLite pagination queries.
 * @param games - Games or game-like records to sort.
 * @param sort - Requested title or rating ordering.
 * @returns A newly ordered list.
 */
export function sortGames<T extends SortableGame>(games: T[], sort: GameSortOption = 'title-asc'): T[] {
    return [...games].sort((a, b) => {
        if (sort === 'title-asc') {
            return compareTitles(a, b, 'asc');
        }

        if (sort === 'title-desc') {
            return compareTitles(a, b, 'desc');
        }

        const aRated = a.starRating !== null;
        const bRated = b.starRating !== null;
        if (aRated !== bRated) {
            return aRated ? -1 : 1;
        }

        if (aRated && bRated && a.starRating !== b.starRating) {
            return (b.starRating ?? 0) - (a.starRating ?? 0);
        }

        return compareTitles(a, b, 'asc');
    });
}
