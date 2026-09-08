export type GameSortOption = 'title-asc' | 'title-desc' | 'rating-desc';

interface SortableGame {
    id: number;
    title: string;
    starRating: number | null;
}

const combiningMarks = /[\u0300-\u036f]/g;
const asciiDigit = /^[0-9]$/;
/** Marker byte for encoded non-ASCII characters. It is itself single-byte ASCII (0x7F, DEL) and
 * numerically greater than every plain ASCII letter/digit/space this function ever leaves
 * unescaped, so encoded characters consistently sort after ordinary Latin text. */
const NON_ASCII_MARKER = '\u007f';

/**
 * Encodes a single Unicode code point as a fixed-width, pure-ASCII hex token so it can never
 * trigger divergence between JavaScript's UTF-16 code-unit comparison and SQLite's default
 * UTF-8 BINARY collation. Plain ASCII characters (code point < 0x80) are single-byte/single-unit
 * in both encodings and are returned unescaped; everything else (accented letters that survive
 * NFKD decomposition, non-Latin scripts, symbols, and supplementary-plane characters such as
 * emoji) is escaped, since those are exactly the characters whose relative order can differ
 * between UTF-16 code units and UTF-8 bytes (most notably supplementary-plane characters, which
 * are represented as surrogate pairs in UTF-16 but sort correctly by code point in UTF-8).
 * @param character - A single string element containing exactly one Unicode code point.
 * @returns An ASCII-only representation preserving code-point magnitude order.
 */
function encodeCharacter(character: string): string {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x80) {
        return character;
    }

    return `${NON_ASCII_MARKER}${codePoint.toString(16).padStart(6, '0')}`;
}

/**
 * Builds a deterministic, pure-ASCII natural-sort key that produces identical ordering whether
 * compared with JavaScript's UTF-16 `<`/`>` operators or with SQLite's default UTF-8 BINARY
 * collation, so the same key can drive both browser sorting and the SQL scalar-function order
 * used for paginated queries. Titles are diacritic-stripped and case-folded to preserve the
 * previous case-insensitive base-sensitivity behavior, then every character is either passed
 * through unescaped (plain ASCII) or hex-encoded (everything else) so no character can ever
 * cause the two comparison models to disagree. Digit runs are length-prefixed and zero-padded
 * so numbers compare by magnitude rather than lexically (e.g. "Game 2" sorts before "Game 10").
 * @param title - Raw game title.
 * @returns A stable, ASCII-only title ordering key.
 */
export function naturalTitleSortKey(title: string): string {
    const normalized = title.normalize('NFKD').replace(combiningMarks, '').toLocaleLowerCase('en');
    const characters = Array.from(normalized);

    let key = '';
    let index = 0;
    while (index < characters.length) {
        if (asciiDigit.test(characters[index])) {
            let digits = '';
            while (index < characters.length && asciiDigit.test(characters[index])) {
                digits += characters[index];
                index += 1;
            }

            const numericValue = digits.replace(/^0+/, '') || '0';
            key += `${String(numericValue.length).padStart(4, '0')}:${numericValue.padStart(24, '0')}`;
            continue;
        }

        key += encodeCharacter(characters[index]);
        index += 1;
    }

    return key;
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
