import { asc, avg, count, eq, inArray, and } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game, Publisher } from '../types/game';
export { sortGames, type GameSortOption } from './game-sort';

/**
 * Filters applied to the home catalog before rendering the visible game list.
 */
export interface GameFilters {
    categoryIds?: number[];
    publisherIds?: number[];
}

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

/**
 * Normalizes and validates positive integer filter IDs so empty selections do not silently broaden results.
 * @param ids - Raw category or publisher IDs supplied by the caller.
 * @returns Unique positive integers in insertion order.
 * @throws TypeError when any supplied filter contains a malformed or non-positive value.
 */
function normalizeFilterIds(ids: number[] | null | undefined): number[] {
    if (!ids || ids.length === 0) {
        return [];
    }

    const uniqueIds = new Set<number>();
    for (const id of ids) {
        const normalized = Number(id);
        if (!Number.isInteger(normalized) || normalized <= 0) {
            throw new TypeError('Filter IDs must be positive integers.');
        }
        uniqueIds.add(normalized);
    }

    return [...uniqueIds];
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
 * Returns every category in alphabetical order so the homepage filter controls stay deterministic.
 * @param db - Database connection used for the query.
 * @returns The ordered category rows, or an empty array when no categories exist.
 */
export async function getAllCategories(db: Database): Promise<Array<{ id: number; name: string }>> {
    return db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .orderBy(asc(categories.name));
}

/**
 * Returns every publisher in alphabetical order so the homepage filter controls stay deterministic.
 * @param db - Database connection used for the query.
 * @returns The ordered publisher rows, or an empty array when no publishers exist.
 */
export async function getAllPublishers(db: Database): Promise<Array<{ id: number; name: string }>> {
    return db
        .select({ id: publishers.id, name: publishers.name })
        .from(publishers)
        .orderBy(asc(publishers.name));
}

/**
 * Returns all games sorted by title, with optional category and publisher filters.
 * Categories are combined with OR semantics and the final category/publisher filter set is ANDed together.
 * Malformed positive-integer filters throw a TypeError instead of silently broadening the result set.
 * @param db - Database connection used for the query.
 * @param filters - Optional category and publisher IDs used for narrowing the catalog.
 * @returns Games matching the requested filters, ordered alphabetically by title.
 */
export async function getAllGames(db: Database, filters: GameFilters = {}): Promise<Game[]> {
    const categoryIds = normalizeFilterIds(filters.categoryIds);
    const publisherIds = normalizeFilterIds(filters.publisherIds);
    const baseQuery = baseGamesQuery(db);

    if (categoryIds.length > 0 && publisherIds.length > 0) {
        const rows = await baseQuery
            .where(and(inArray(games.categoryId, categoryIds), inArray(games.publisherId, publisherIds)))
            .orderBy(asc(games.title));
        return rows.map(mapGame);
    }

    if (categoryIds.length > 0) {
        const rows = await baseQuery.where(inArray(games.categoryId, categoryIds)).orderBy(asc(games.title));
        return rows.map(mapGame);
    }

    if (publisherIds.length > 0) {
        const rows = await baseQuery.where(inArray(games.publisherId, publisherIds)).orderBy(asc(games.title));
        return rows.map(mapGame);
    }

    const rows = await baseQuery.orderBy(asc(games.title));
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
