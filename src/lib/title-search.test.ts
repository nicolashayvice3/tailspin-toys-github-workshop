import { describe, expect, it } from 'vitest';
import { normalizeTitleSearch, titleMatchesSearch } from './title-search';

describe('title search', () => {
    it('normalizes surrounding whitespace and case', () => {
        expect(normalizeTitleSearch('  cOdE  ')).toBe('code');
    });

    it.each([
        ['Code Quest', 'code', true],
        ['Code Quest', '  QUEST  ', true],
        ['Code Quest', '', true],
        ['Code % _ Quest', '% _', true],
        ['Code Quest', 'missing', false],
    ])('matches literal title substrings for %j and %j', (title, query, expected) => {
        expect(titleMatchesSearch(title, query)).toBe(expected);
    });
});
