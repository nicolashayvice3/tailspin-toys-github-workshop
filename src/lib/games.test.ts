import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getAllPublisherIds,
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

    it('returns all publishers and their games in deterministic order', async () => {
        await seedGames(db, 3);
        const publisherIds = await getAllPublisherIds(db);
        const publisher = await getPublisherById(db, publisherIds[0]);
        const publisherGames = await getGamesByPublisherId(db, publisherIds[0]);

        expect(publisherIds).toEqual([publisherIds[0]]);
        expect(publisher).toEqual({
            id: publisherIds[0],
            name: 'Pub One',
            description: 'pub',
        });
        expect(publisherGames.map((game) => game.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
    });

    it('returns null for a non-existent publisher', async () => {
        await seedGames(db, 2);
        expect(await getPublisherById(db, 99999)).toBeNull();
    });

    it('returns empty collections for publishers with no games or descriptions', async () => {
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Quiet Studio', description: '   ' })
            .returning({ id: publishers.id });

        const publisherId = publisher.id;
        const fetchedPublisher = await getPublisherById(db, publisherId);
        const publisherGames = await getGamesByPublisherId(db, publisherId);

        expect(fetchedPublisher).toEqual({ id: publisherId, name: 'Quiet Studio', description: null });
        expect(publisherGames).toEqual([]);
    });
});
