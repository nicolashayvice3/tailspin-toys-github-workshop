import { eq, asc } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game } from '../types/game';

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    categoryDescription: categories.description,
    publisherId: publishers.id,
    publisherName: publishers.name,
    publisherDescription: publishers.description,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    categoryDescription: string | null;
    publisherId: number | null;
    publisherName: string | null;
    publisherDescription: string | null;
};

function normalizeDescription(description: string | null): string | null {
    const trimmedDescription = description?.trim();
    return trimmedDescription || null;
}

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? {
                      id: row.categoryId,
                      name: row.categoryName,
                      description: normalizeDescription(row.categoryDescription),
                  }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? {
                      id: row.publisherId,
                      name: row.publisherName,
                      description: normalizeDescription(row.publisherDescription),
                  }
                : null,
    };
}

function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

/**
 * Returns all games with their related category and publisher metadata sorted by title.
 * @param db - Database connection used for the query.
 * @returns Ordered game records with nullable related descriptions normalized to null.
 */
export async function getAllGames(db: Database): Promise<Game[]> {
    const rows = await baseGamesQuery(db).orderBy(asc(games.title));
    return rows.map(mapGame);
}

/**
 * Returns all game IDs sorted by title so static page generation is deterministic.
 * @param db - Database connection used for the query.
 * @returns Ordered list of game IDs.
 */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/**
 * Returns one game with its related category and publisher metadata.
 * @param db - Database connection used for the query.
 * @param id - Game ID to look up.
 * @returns The matching game, or null when no game exists for the ID.
 */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await baseGamesQuery(db).where(eq(games.id, id)).get();
    return row ? mapGame(row) : null;
}
