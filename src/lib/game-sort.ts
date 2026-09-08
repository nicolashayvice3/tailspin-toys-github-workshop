export type GameSortOption = 'title-asc' | 'title-desc' | 'rating-desc';

interface SortableGame {
    id: number;
    title: string;
    starRating: number | null;
}

const titleCollator = new Intl.Collator('en', {
    sensitivity: 'base',
    numeric: true,
});

function compareTitles(a: SortableGame, b: SortableGame, direction: 'asc' | 'desc'): number {
    const titleComparison = titleCollator.compare(a.title, b.title);
    if (titleComparison !== 0) {
        return direction === 'asc' ? titleComparison : -titleComparison;
    }

    return a.id - b.id;
}

/**
 * Returns a new list sorted by title or rating without mutating the source list.
 * Rating order places null ratings after rated games; zero is a valid rating.
 * Equal values use case-insensitive numeric title order, then ID, as a stable tie-break.
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
