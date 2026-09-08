import { describe, expect, it } from 'vitest';
import { normalizePage, normalizePageSize, paginate } from './pagination';

describe('pagination helpers', () => {
    it('normalizes route and query page values consistently', () => {
        expect(normalizePage(null)).toBe(1);
        expect(normalizePage(undefined)).toBe(1);
        expect(normalizePage('not-a-number')).toBe(1);
        expect(normalizePage(Number.NaN)).toBe(1);
        expect(normalizePage(Number.POSITIVE_INFINITY)).toBe(1);
        expect(normalizePage(-3)).toBe(1);
        expect(normalizePage(2.9)).toBe(2);
    });

    it('rejects invalid page sizes instead of silently changing the caller contract', () => {
        expect(() => normalizePageSize(0)).toThrow(TypeError);
        expect(() => normalizePageSize(-1)).toThrow(TypeError);
        expect(() => normalizePageSize(1.25)).toThrow(TypeError);
        expect(() => normalizePageSize(Number.NaN)).toThrow(TypeError);
        expect(() => normalizePageSize(Number.POSITIVE_INFINITY)).toThrow(TypeError);
        expect(() => normalizePageSize(101)).toThrow(TypeError);
    });

    it('slices items after clamping requested pages to the available range', () => {
        const result = paginate([1, 2, 3, 4, 5], 99, 2);

        expect(result).toEqual({
            items: [5],
            page: 3,
            pageSize: 2,
            totalCount: 5,
            totalPages: 3,
            hasPreviousPage: true,
            hasNextPage: false,
        });
    });
});
