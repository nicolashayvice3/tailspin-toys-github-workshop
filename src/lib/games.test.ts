import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllCategories,
    getAllGames,
    getAllGameIds,
    getAllPublishers,
    getAllPublisherIds,
    getCatalogSummary,
    getGameById,
    getPaginatedGames,
    getGamesByPublisherId,
    getPublisherById,
} from './games';
import { sortGames, naturalTitleSortKey, type GameSortOption } from './game-sort';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

async function seedFilteredGames(db: Database): Promise<{
    strategyId: number;
    puzzleId: number;
    codeforgeId: number;
    devmastersId: number;
}> {
    const [strategy] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [puzzle] = await db
        .insert(categories)
        .values({ name: 'Puzzle', description: 'cat' })
        .returning({ id: categories.id });

    const [codeforge] = await db
        .insert(publishers)
        .values({ name: 'CodeForge', description: 'pub' })
        .returning({ id: publishers.id });
    const [devmasters] = await db
        .insert(publishers)
        .values({ name: 'DevMasters', description: 'pub' })
        .returning({ id: publishers.id });

    await db.insert(games).values([
        {
            title: 'Alpha Strategy',
            description: 'Strategy game',
            starRating: 4.2,
            categoryId: strategy.id,
            publisherId: codeforge.id,
        },
        {
            title: 'Bravo Strategy',
            description: 'Another strategy game',
            starRating: 4.2,
            categoryId: strategy.id,
            publisherId: devmasters.id,
        },
        {
            title: 'Charlie Puzzle',
            description: 'Puzzle game',
            starRating: 4.8,
            categoryId: puzzle.id,
            publisherId: codeforge.id,
        },
        {
            title: 'Delta Puzzle',
            description: 'Another puzzle game',
            starRating: 3.9,
            categoryId: puzzle.id,
            publisherId: devmasters.id,
        },
    ]);

    return {
        strategyId: strategy.id,
        puzzleId: puzzle.id,
        codeforgeId: codeforge.id,
        devmastersId: devmasters.id,
    };
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    describe('sortGames', () => {
        const gameList = [
            { id: 4, title: 'game 2', starRating: null },
            { id: 2, title: 'Game 10', starRating: 0 },
            { id: 3, title: 'game 1', starRating: 4.5 },
            { id: 1, title: 'GAME 1', starRating: 4.5 },
            { id: 5, title: 'Unrated', starRating: null },
        ];

        it.each<GameSortOption>(['title-asc', 'title-desc', 'rating-desc'])('supports %s ordering', (sort) => {
            const originalIds = gameList.map((game) => game.id);
            const sorted = sortGames(gameList, sort);

            expect(sorted).not.toBe(gameList);
            expect(gameList.map((game) => game.id)).toEqual(originalIds);
        });

        it('orders titles by natural case-insensitive comparison with ID tie-breaking', () => {
            expect(sortGames(gameList, 'title-asc').map((game) => game.id)).toEqual([1, 3, 4, 2, 5]);
            expect(sortGames(gameList, 'title-desc').map((game) => game.id)).toEqual([5, 2, 4, 1, 3]);
        });

        it('orders ratings highest first, keeps zero rated, and places null last', () => {
            expect(sortGames(gameList, 'rating-desc').map((game) => game.id)).toEqual([1, 3, 2, 4, 5]);
        });

        it.each([
            { games: [] },
            { games: [{ id: 1, title: 'Only game', starRating: null }] },
        ])(
            'handles a collection with %s',
            ({ games }) => {
                expect(sortGames(games, 'rating-desc')).toHaveLength(games.length);
            },
        );
    });

    // The base catalog query should stay stable even with no explicit filters applied.
    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({
            id: expect.any(Number),
            name: 'Strategy',
            description: 'cat',
        });
        expect(all[0].publisher).toEqual({
            id: expect.any(Number),
            name: 'Pub One',
            description: 'pub',
        });
    });

        it('returns a SQL-sliced page of games with bounded pagination metadata', async () => {
            await seedGames(db, 21);

            const firstPage = await getPaginatedGames(db, { page: 1, pageSize: 9 });
            expect(firstPage.items).toHaveLength(9);
            expect(firstPage.items.map((game) => game.title)).toEqual([
                'Game 01',
                'Game 02',
                'Game 03',
                'Game 04',
                'Game 05',
                'Game 06',
                'Game 07',
                'Game 08',
                'Game 09',
            ]);
            expect(firstPage).toMatchObject({
                page: 1,
                pageSize: 9,
                totalCount: 21,
                totalPages: 3,
                hasPreviousPage: false,
                hasNextPage: true,
            });

            const lastPage = await getPaginatedGames(db, { page: 3, pageSize: 9 });
            expect(lastPage.items.map((game) => game.title)).toEqual(['Game 19', 'Game 20', 'Game 21']);
            expect(lastPage).toMatchObject({
                page: 3,
                totalCount: 21,
                totalPages: 3,
                hasPreviousPage: true,
                hasNextPage: false,
            });
        });

        it('clamps malformed, fractional, negative, and too-large requested pages consistently', async () => {
            await seedGames(db, 12);

            await expect(getPaginatedGames(db, { page: Number.NaN, pageSize: 5 })).resolves.toMatchObject({ page: 1 });
            await expect(getPaginatedGames(db, { page: Number.POSITIVE_INFINITY, pageSize: 5 })).resolves.toMatchObject({ page: 1 });
            await expect(getPaginatedGames(db, { page: -7, pageSize: 5 })).resolves.toMatchObject({ page: 1 });
            await expect(getPaginatedGames(db, { page: 2.9, pageSize: 5 })).resolves.toMatchObject({ page: 2 });
            await expect(getPaginatedGames(db, { page: 99, pageSize: 5 })).resolves.toMatchObject({ page: 3 });
        });

        it('rejects malformed page sizes explicitly', async () => {
            await seedGames(db, 3);

            await expect(getPaginatedGames(db, { pageSize: 0 })).rejects.toThrow(TypeError);
            await expect(getPaginatedGames(db, { pageSize: 1.5 })).rejects.toThrow(/page size/i);
            await expect(getPaginatedGames(db, { pageSize: Number.POSITIVE_INFINITY })).rejects.toThrow(/page size/i);
            await expect(getPaginatedGames(db, { pageSize: 101 })).rejects.toThrow(/no greater than 100/i);
        });

        it('paginates filtered totals after applying category OR and publisher AND rules', async () => {
            const { strategyId, puzzleId, codeforgeId } = await seedFilteredGames(db);

            const firstPage = await getPaginatedGames(db, {
                filters: { categoryIds: [strategyId, puzzleId], publisherIds: [codeforgeId] },
                page: 1,
                pageSize: 1,
            });
            const secondPage = await getPaginatedGames(db, {
                filters: { categoryIds: [strategyId, puzzleId], publisherIds: [codeforgeId] },
                page: 2,
                pageSize: 1,
            });

            expect(firstPage.items.map((game) => game.title)).toEqual(['Alpha Strategy']);
            expect(secondPage.items.map((game) => game.title)).toEqual(['Charlie Puzzle']);
            expect(firstPage.totalCount).toBe(2);
            expect(firstPage.totalPages).toBe(2);
        });

        it('keeps default SQL title ordering compatible with browser sorting boundaries', async () => {
            const [category] = await db
                .insert(categories)
                .values({ name: 'Strategy', description: 'cat' })
                .returning({ id: categories.id });
            const [publisher] = await db
                .insert(publishers)
                .values({ name: 'Pub One', description: 'pub' })
                .returning({ id: publishers.id });

            await db.insert(games).values([
                { title: 'Éclair 2', description: 'Accent two', starRating: null, categoryId: category.id, publisherId: publisher.id },
                { title: 'eclair 10', description: 'Accent ten', starRating: 0, categoryId: category.id, publisherId: publisher.id },
                { title: 'Zed', description: 'Zed upper', starRating: 4.5, categoryId: category.id, publisherId: publisher.id },
                { title: 'éclair 1', description: 'Accent one', starRating: 4.5, categoryId: category.id, publisherId: publisher.id },
                { title: 'ÉCLAIR 1', description: 'Accent one upper', starRating: 4.5, categoryId: category.id, publisherId: publisher.id },
                { title: 'zed', description: 'Zed lower', starRating: 4.5, categoryId: category.id, publisherId: publisher.id },
            ]);

            const sqlOrdered = await getAllGames(db);
            const browserOrdered = sortGames(sqlOrdered, 'title-asc');

            expect(sqlOrdered.map((game) => game.id)).toEqual(browserOrdered.map((game) => game.id));
            expect(sqlOrdered.map((game) => game.title)).toEqual([
                'éclair 1',
                'ÉCLAIR 1',
                'Éclair 2',
                'eclair 10',
                'Zed',
                'zed',
            ]);
        });

        it('keeps SQL and browser title ordering aligned for supplementary-plane and non-Latin BMP characters', async () => {
            const [category] = await db
                .insert(categories)
                .values({ name: 'Strategy', description: 'cat' })
                .returning({ id: categories.id });
            const [publisher] = await db
                .insert(publishers)
                .values({ name: 'Pub One', description: 'pub' })
                .returning({ id: publishers.id });

            // "😀" (U+1F600) is a supplementary-plane character represented in JavaScript as a
            // UTF-16 surrogate pair. Comparing raw title strings would make UTF-16 code-unit
            // order (used by the browser) diverge from UTF-8 byte order (SQLite's default
            // BINARY collation) for exactly this kind of character. "Ж" (U+0416) is a non-Latin
            // Basic Multilingual Plane character used as a control to prove ordinary BMP text
            // still sorts consistently between the two engines.
            await db.insert(games).values([
                {
                    title: '😀 Emoji Game',
                    description: 'emoji',
                    starRating: null,
                    categoryId: category.id,
                    publisherId: publisher.id,
                },
                {
                    title: 'Ж Cyrillic Game',
                    description: 'cyrillic',
                    starRating: null,
                    categoryId: category.id,
                    publisherId: publisher.id,
                },
                {
                    title: 'Zebra Game',
                    description: 'latin',
                    starRating: null,
                    categoryId: category.id,
                    publisherId: publisher.id,
                },
                {
                    title: 'ascii game',
                    description: 'latin lower',
                    starRating: null,
                    categoryId: category.id,
                    publisherId: publisher.id,
                },
            ]);

            const sqlOrdered = await getAllGames(db);
            const browserOrdered = sortGames(sqlOrdered, 'title-asc');

            expect(sqlOrdered.map((game) => game.id)).toEqual(browserOrdered.map((game) => game.id));
            expect(sqlOrdered.map((game) => game.title)).toEqual([
                'ascii game',
                'Zebra Game',
                'Ж Cyrillic Game',
                '😀 Emoji Game',
            ]);

            for (const game of sqlOrdered) {
                const key = naturalTitleSortKey(game.title);
                expect([...key].every((character) => character.codePointAt(0) !== undefined && character.codePointAt(0)! <= 0x7f)).toBe(true);
            }
        });
    // Related descriptions should be normalized consistently even when the underlying text is blank.
    it('normalizes missing and whitespace-only related descriptions to null', async () => {
        const [category] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: '   ' })
            .returning({ id: categories.id });
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Skyforge', description: null })
            .returning({ id: publishers.id });

        await db.insert(games).values({
            title: 'Night Shift',
            description: 'Late-night puzzler',
            starRating: 4.5,
            categoryId: category.id,
            publisherId: publisher.id,
        });

        const game = await getGameById(db, 1);
        expect(game?.category).toEqual({ id: category.id, name: 'Puzzle', description: null });
        expect(game?.publisher).toEqual({ id: publisher.id, name: 'Skyforge', description: null });
    });

    // Category and publisher lookup tables should stay sorted and behave predictably when empty.
    it('returns all categories and publishers in name order, including empty tables', async () => {
        await db.insert(categories).values([
            { name: 'Puzzle', description: 'puzzle' },
            { name: 'Adventure', description: 'adventure' },
            { name: 'Strategy', description: 'strategy' },
        ]);
        await db.insert(publishers).values([
            { name: 'GitHub Games', description: 'github' },
            { name: 'CodeForge', description: 'codeforge' },
            { name: 'DevMasters', description: 'devmasters' },
        ]);

        expect((await getAllCategories(db)).map((entry) => entry.name)).toEqual(['Adventure', 'Puzzle', 'Strategy']);
        expect((await getAllPublishers(db)).map((entry) => entry.name)).toEqual(['CodeForge', 'DevMasters', 'GitHub Games']);

        const emptyDb = await createTestDatabase();
        expect(await getAllCategories(emptyDb)).toEqual([]);
        expect(await getAllPublishers(emptyDb)).toEqual([]);
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('returns the catalog summary using only rated games for the average', async () => {
        const [category] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'cat' })
            .returning({ id: categories.id });
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Pub One', description: 'pub' })
            .returning({ id: publishers.id });

        await db.insert(games).values([
            {
                title: 'Rated Five',
                description: 'Five stars',
                starRating: 5,
                categoryId: category.id,
                publisherId: publisher.id,
            },
            {
                title: 'Unrated',
                description: 'No rating',
                starRating: null,
                categoryId: category.id,
                publisherId: publisher.id,
            },
            {
                title: 'Rated Zero',
                description: 'Zero stars',
                starRating: 0,
                categoryId: category.id,
                publisherId: publisher.id,
            },
            {
                title: 'Rated Three',
                description: 'Three stars',
                starRating: 3,
                categoryId: category.id,
                publisherId: publisher.id,
            },
        ]);

        expect(await getCatalogSummary(db)).toEqual({
            totalGames: 4,
            ratedGamesCount: 3,
            averageStarRating: 8 / 3,
        });
    });

    it('returns a zeroed summary when the catalog is empty', async () => {
        const summary = await getCatalogSummary(db);

        expect(summary).toEqual({
            totalGames: 0,
            ratedGamesCount: 0,
            averageStarRating: null,
        });
    });

    it('returns a null average when no games are rated', async () => {
        const [category] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'cat' })
            .returning({ id: categories.id });
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Pub One', description: 'pub' })
            .returning({ id: publishers.id });

        await db.insert(games).values([
            {
                title: 'First Unrated Game',
                description: 'No rating yet',
                starRating: null,
                categoryId: category.id,
                publisherId: publisher.id,
            },
            {
                title: 'Second Unrated Game',
                description: 'Still no rating',
                starRating: null,
                categoryId: category.id,
                publisherId: publisher.id,
            },
        ]);

        expect(await getCatalogSummary(db)).toEqual({
            totalGames: 2,
            ratedGamesCount: 0,
            averageStarRating: null,
        });
    });

    it('orders publisher IDs by name independent of insertion order, including an empty publisher', async () => {
        const [category] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'cat' })
            .returning({ id: categories.id });
        const [zenith] = await db
            .insert(publishers)
            .values({ name: 'Zenith Games', description: 'zenith pub' })
            .returning({ id: publishers.id });
        const [alpha] = await db
            .insert(publishers)
            .values({ name: 'Alpha Studio', description: 'alpha pub' })
            .returning({ id: publishers.id });
        const [charlie] = await db
            .insert(publishers)
            .values({ name: 'Charlie Games', description: '   ' })
            .returning({ id: publishers.id });

        await db.insert(games).values({
            title: 'Zeta Two',
            description: 'Zenith game two',
            starRating: 4.0,
            categoryId: category.id,
            publisherId: zenith.id,
        });
        await db.insert(games).values({
            title: 'Zeta One',
            description: 'Zenith game one',
            starRating: 4.1,
            categoryId: category.id,
            publisherId: zenith.id,
        });
        await db.insert(games).values({
            title: 'Alpha Two',
            description: 'Alpha game two',
            starRating: 3.9,
            categoryId: category.id,
            publisherId: alpha.id,
        });
        await db.insert(games).values({
            title: 'Alpha One',
            description: 'Alpha game one',
            starRating: 4.2,
            categoryId: category.id,
            publisherId: alpha.id,
        });

        const publisherIds = await getAllPublisherIds(db);
        expect(publisherIds).toEqual([alpha.id, charlie.id, zenith.id]);
    });

    it('returns only a publisher\'s own games, ordered by title', async () => {
        const [category] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'cat' })
            .returning({ id: categories.id });
        const [alpha] = await db
            .insert(publishers)
            .values({ name: 'Alpha Studio', description: 'alpha pub' })
            .returning({ id: publishers.id });
        const [zenith] = await db
            .insert(publishers)
            .values({ name: 'Zenith Games', description: 'zenith pub' })
            .returning({ id: publishers.id });

        await db.insert(games).values({
            title: 'Alpha Two',
            description: 'Alpha game two',
            starRating: 3.9,
            categoryId: category.id,
            publisherId: alpha.id,
        });
        await db.insert(games).values({
            title: 'Alpha One',
            description: 'Alpha game one',
            starRating: 4.2,
            categoryId: category.id,
            publisherId: alpha.id,
        });
        await db.insert(games).values({
            title: 'Zeta Two',
            description: 'Zenith game two',
            starRating: 4.0,
            categoryId: category.id,
            publisherId: zenith.id,
        });
        await db.insert(games).values({
            title: 'Zeta One',
            description: 'Zenith game one',
            starRating: 4.1,
            categoryId: category.id,
            publisherId: zenith.id,
        });

        const alphaGames = await getGamesByPublisherId(db, alpha.id);
        expect(alphaGames.map((game) => game.title)).toEqual(['Alpha One', 'Alpha Two']);
        expect(alphaGames.every((game) => game.publisher?.id === alpha.id)).toBe(true);

        const zenithGames = await getGamesByPublisherId(db, zenith.id);
        expect(zenithGames.map((game) => game.title)).toEqual(['Zeta One', 'Zeta Two']);
        expect(zenithGames.every((game) => game.publisher?.id === zenith.id)).toBe(true);
    });

    it('returns a publisher record with normalized description for a publisher with no games', async () => {
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Quiet Studio', description: '   ' })
            .returning({ id: publishers.id });

        expect(await getPublisherById(db, publisher.id)).toEqual({
            id: publisher.id,
            name: 'Quiet Studio',
            description: null,
        });
        expect(await getGamesByPublisherId(db, publisher.id)).toEqual([]);
    });

    it('returns null for a non-existent publisher', async () => {
        await seedGames(db, 2);
        expect(await getPublisherById(db, 99999)).toBeNull();
    });

    it('returns an empty list of games for a non-existent publisher', async () => {
        await seedGames(db, 2);
        expect(await getGamesByPublisherId(db, 99999)).toEqual([]);
    });

    // Empty filter arrays and duplicate IDs should behave like the unfiltered catalog instead of widening the result set.
    it('keeps the catalog intact when filters are omitted, empty, or duplicated', async () => {
        const { strategyId, puzzleId, codeforgeId } = await seedFilteredGames(db);

        expect(await getAllGames(db)).toHaveLength(4);
        expect(await getAllGames(db, { categoryIds: [], publisherIds: [] })).toHaveLength(4);
        expect(
            (await getAllGames(db, { categoryIds: [strategyId, puzzleId], publisherIds: [codeforgeId, codeforgeId] })).map(
                (game) => game.title,
            ),
        ).toEqual(['Alpha Strategy', 'Charlie Puzzle']);
        expect(
            (await getAllGames(db, { categoryIds: [puzzleId, puzzleId], publisherIds: [] })).map((game) => game.title),
        ).toEqual(['Charlie Puzzle', 'Delta Puzzle']);
    });

    it('filters games by category when a category id is supplied', async () => {
        const { strategyId } = await seedFilteredGames(db);
        const filtered = await getAllGames(db, { categoryIds: [strategyId] });

        expect(filtered.map((game) => game.title)).toEqual(['Alpha Strategy', 'Bravo Strategy']);
    });

    it('filters games by publisher when a publisher id is supplied', async () => {
        const { codeforgeId } = await seedFilteredGames(db);
        const filtered = await getAllGames(db, { publisherIds: [codeforgeId] });

        expect(filtered.map((game) => game.title)).toEqual(['Alpha Strategy', 'Charlie Puzzle']);
    });

    it('combines multiple categories with publisher filters using OR within categories and AND across groups', async () => {
        const { strategyId, puzzleId, codeforgeId } = await seedFilteredGames(db);
        const filtered = await getAllGames(db, {
            categoryIds: [strategyId, puzzleId],
            publisherIds: [codeforgeId],
        });

        expect(filtered.map((game) => game.title)).toEqual(['Alpha Strategy', 'Charlie Puzzle']);
    });

    it('returns an empty list when no game matches the selected filters', async () => {
        const { strategyId } = await seedFilteredGames(db);
        const filtered = await getAllGames(db, {
            categoryIds: [strategyId],
            publisherIds: [9999],
        });

        expect(filtered).toEqual([]);
    });

    it('rejects malformed filter values instead of silently broadening the catalog', async () => {
        const { strategyId } = await seedFilteredGames(db);

        await expect(
            getAllGames(db, {
                categoryIds: [0, strategyId, Number.NaN, -1],
                publisherIds: [Number.NaN],
            }),
        ).rejects.toThrow(TypeError);

        await expect(
            getAllGames(db, {
                categoryIds: [Number.POSITIVE_INFINITY],
                publisherIds: [1],
            }),
        ).rejects.toThrow(/positive integers/i);
    });

    it('keeps null related descriptions safe while leaving valid relations intact', async () => {
        const [category] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: null })
            .returning({ id: categories.id });
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Skyforge', description: '   ' })
            .returning({ id: publishers.id });

        await db.insert(games).values({
            title: 'Null-safe Puzzle',
            description: 'Handles missing relations cleanly',
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });

        const filtered = await getAllGames(db, {
            categoryIds: [category.id],
            publisherIds: [publisher.id],
        });

        expect(filtered.map((game) => game.title)).toEqual(['Null-safe Puzzle']);
        expect(filtered[0].category).toEqual({ id: category.id, name: 'Puzzle', description: null });
        expect(filtered[0].publisher).toEqual({ id: publisher.id, name: 'Skyforge', description: null });
    });
});
