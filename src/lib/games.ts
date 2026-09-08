import { asc, avg, count, eq, inArray, and, sql, type SQL } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game, Publisher } from '../types/game';
export { sortGames, type GameSortOption } from './game-sort';
import {
    DEFAULT_PAGE_SIZE,
    getTotalPages,
    normalizePage,
    normalizePageSize,
    type PaginatedResult,
} from './pagination';

/**
 * Filters applied to the home catalog before rendering the visible game list.
 */
export interface GameFilters {
    categoryIds?: number[];
    publisherIds?: number[];
}

export type PaginatedGamesResult = PaginatedResult<Game>;

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

function normalizeFilters(filters: GameFilters): Required<GameFilters> {
    return {
        categoryIds: normalizeFilterIds(filters.categoryIds),
        publisherIds: normalizeFilterIds(filters.publisherIds),
    };
}

function getGamesFilterCondition(filters: GameFilters): SQL | undefined {
    const { categoryIds, publisherIds } = normalizeFilters(filters);

    if (categoryIds.length > 0 && publisherIds.length > 0) {
        return and(inArray(games.categoryId, categoryIds), inArray(games.publisherId, publisherIds));
    }

    if (categoryIds.length > 0) {
        return inArray(games.categoryId, categoryIds);
    }

    if (publisherIds.length > 0) {
        return inArray(games.publisherId, publisherIds);
    }

    return undefined;
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
    const condition = getGamesFilterCondition(filters);

    if (condition) {
        const rows = await baseGamesQuery(db)
            .where(condition)
            .orderBy(sql`tailspin_title_sort_key(${games.title})`, asc(games.id));
        return rows.map(mapGame);
    }

    const rows = await baseGamesQuery(db).orderBy(sql`tailspin_title_sort_key(${games.title})`, asc(games.id));
    return rows.map(mapGame);
}

/**
 * Counts games after applying the same category and publisher filters as the catalog query.
 * @param db - Database connection used for the aggregate query.
 * @param filters - Optional category and publisher IDs used for narrowing the catalog.
 * @returns The number of matching games.
 */
export async function getTotalGamesCount(db: Database, filters: GameFilters = {}): Promise<number> {
    const condition = getGamesFilterCondition(filters);
    const baseQuery = db.select({ count: count(games.id) }).from(games);

    if (condition) {
        const result = await baseQuery.where(condition).get();
        return Number(result?.count ?? 0);
    }

    const result = await baseQuery.get();
    return Number(result?.count ?? 0);
}

/**
 * Returns one SQL-sliced page of games in the default title order, with filtered total metadata.
 * The helper intentionally covers the static/no-JavaScript catalog order; browser enhancement applies
 * search and alternate sort modes through shared pure helpers before slicing.
 * @param db - Database connection used for the query.
 * @param options - Optional filters, page, and page size.
 * @returns One page of matching games and pagination metadata.
 */
export async function getPaginatedGames(
    db: Database,
    options: {
        filters?: GameFilters;
        page?: number | string | null;
        pageSize?: number | string;
    } = {},
): Promise<PaginatedGamesResult> {
    const filters = options.filters ?? {};
    const pageSize = normalizePageSize(options.pageSize ?? DEFAULT_PAGE_SIZE);
    const totalCount = await getTotalGamesCount(db, filters);
    const totalPages = getTotalPages(totalCount, pageSize);
    const page = Math.min(normalizePage(options.page ?? 1), totalPages);
    const offset = (page - 1) * pageSize;
    const condition = getGamesFilterCondition(filters);
    const rows = condition
        ? await baseGamesQuery(db)
              .where(condition)
              .orderBy(sql`tailspin_title_sort_key(${games.title})`, asc(games.id))
              .limit(pageSize)
              .offset(offset)
        : await baseGamesQuery(db)
              .orderBy(sql`tailspin_title_sort_key(${games.title})`, asc(games.id))
              .limit(pageSize)
              .offset(offset);

    return {
        items: rows.map(mapGame),
        page,
        pageSize,
        totalCount,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
    };
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
    const rows = await db.select({ id: games.id }).from(games).orderBy(sql`tailspin_title_sort_key(${games.title})`, asc(games.id));
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
        .orderBy(sql`tailspin_title_sort_key(${games.title})`, asc(games.id));
    return rows.map(mapGame);
}
