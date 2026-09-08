import { asc, avg, count, eq } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game, Publisher } from '../types/game';

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

export interface CatalogSummary {
    totalGames: number;
    ratedGamesCount: number;
    averageStarRating: number | null;
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
 * Returns totals and the average rating for the whole catalog, excluding only unrated games.
 * @param db - Database connection used for the aggregate query.
 * @returns The catalog count, rated-game count, and unrounded average rating or null when none exist.
 */
export async function getCatalogSummary(db: Database): Promise<CatalogSummary> {
    const summary = await db
        .select({
            totalGames: count(games.id),
            ratedGamesCount: count(games.starRating),
            averageStarRating: avg(games.starRating),
        })
        .from(games)
        .get();

    return {
        totalGames: summary?.totalGames ?? 0,
        ratedGamesCount: summary?.ratedGamesCount ?? 0,
        averageStarRating:
            summary?.averageStarRating === null || summary?.averageStarRating === undefined
                ? null
                : Number(summary.averageStarRating),
    };
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
 * Returns all publisher IDs sorted by name so static publisher paths stay deterministic.
 * @param db - Database connection used for the query.
 * @returns Ordered list of publisher IDs.
 */
export async function getAllPublisherIds(db: Database): Promise<number[]> {
    const rows = await db
        .select({ id: publishers.id })
        .from(publishers)
        .orderBy(asc(publishers.name));
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

/**
 * Returns one publisher record by ID.
 * @param db - Database connection used for the query.
 * @param id - Publisher ID to look up.
 * @returns The matching publisher, or null when no publisher exists for the ID.
 */
export async function getPublisherById(db: Database, id: number): Promise<Publisher | null> {
    const row = await db
        .select({ id: publishers.id, name: publishers.name, description: publishers.description })
        .from(publishers)
        .where(eq(publishers.id, id))
        .get();

    return row
        ? {
              id: row.id,
              name: row.name,
              description: normalizeDescription(row.description),
          }
        : null;
}

/**
 * Returns all games for a publisher sorted by title.
 * @param db - Database connection used for the query.
 * @param publisherId - Publisher ID used to filter the results.
 * @returns Ordered list of games published by the requested publisher.
 */
export async function getGamesByPublisherId(db: Database, publisherId: number): Promise<Game[]> {
    const rows = await baseGamesQuery(db)
        .where(eq(games.publisherId, publisherId))
        .orderBy(asc(games.title));
    return rows.map(mapGame);
}
