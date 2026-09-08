export const DEFAULT_PAGE_SIZE = 9;
export const MAX_PAGE_SIZE = 100;

export interface PaginationMetadata {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
}

export interface PaginatedResult<T> extends PaginationMetadata {
    items: T[];
}

/**
 * Normalizes page input by truncating fractional values, defaulting malformed values to page 1,
 * and clamping below-range values to page 1.
 * @param page - Raw page number from route params, query strings, or caller input.
 * @returns A positive integer page number.
 */
export function normalizePage(page: number | string | null | undefined): number {
    const numericPage = Number(page);

    if (!Number.isFinite(numericPage)) {
        return 1;
    }

    return Math.max(1, Math.trunc(numericPage));
}

/**
 * Validates and normalizes page size input for bounded catalog pagination.
 * @param pageSize - Raw page size from caller input.
 * @returns A positive integer page size no larger than `MAX_PAGE_SIZE`.
 * @throws TypeError when page size is malformed, fractional, non-positive, or too large.
 */
export function normalizePageSize(pageSize: number | string = DEFAULT_PAGE_SIZE): number {
    const numericPageSize = Number(pageSize);

    if (!Number.isInteger(numericPageSize) || numericPageSize <= 0 || numericPageSize > MAX_PAGE_SIZE) {
        throw new TypeError(`Page size must be a positive integer no greater than ${MAX_PAGE_SIZE}.`);
    }

    return numericPageSize;
}

/**
 * Calculates a non-zero page count for a collection size and page size.
 * @param totalCount - Number of records in the result set.
 * @param pageSize - Validated page size.
 * @returns At least one page, even for an empty result set.
 */
export function getTotalPages(totalCount: number, pageSize: number = DEFAULT_PAGE_SIZE): number {
    const normalizedPageSize = normalizePageSize(pageSize);
    const normalizedTotalCount = Math.max(0, Math.trunc(Number(totalCount) || 0));
    return Math.max(1, Math.ceil(normalizedTotalCount / normalizedPageSize));
}

/**
 * Slices a collection after applying the shared page normalization and clamping rules.
 * @param items - Already filtered and sorted records.
 * @param page - Requested page number.
 * @param pageSize - Requested page size.
 * @returns The visible page slice and pagination metadata.
 */
export function paginate<T>(
    items: T[],
    page: number | string | null | undefined = 1,
    pageSize: number | string = DEFAULT_PAGE_SIZE,
): PaginatedResult<T> {
    const normalizedPageSize = normalizePageSize(pageSize);
    const totalCount = items.length;
    const totalPages = getTotalPages(totalCount, normalizedPageSize);
    const normalizedPage = normalizePage(page);
    const clampedPage = Math.min(normalizedPage, totalPages);
    const offset = (clampedPage - 1) * normalizedPageSize;

    return {
        items: items.slice(offset, offset + normalizedPageSize),
        page: clampedPage,
        pageSize: normalizedPageSize,
        totalCount,
        totalPages,
        hasPreviousPage: clampedPage > 1,
        hasNextPage: clampedPage < totalPages,
    };
}
