import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getAllPublisherIds,
    getCatalogSummary,
    getGameById,
    getGamesByPublisherId,
    getPublisherById,
} from './games';

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

    it('ignores invalid filter ids while keeping null-related metadata safe', async () => {
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
            categoryIds: [0, category.id, Number.NaN, -1],
            publisherIds: [0, publisher.id, 999],
        });

        expect(filtered.map((game) => game.title)).toEqual(['Null-safe Puzzle']);
        expect(filtered[0].category).toEqual({ id: category.id, name: 'Puzzle', description: null });
        expect(filtered[0].publisher).toEqual({ id: publisher.id, name: 'Skyforge', description: null });
    });
});
