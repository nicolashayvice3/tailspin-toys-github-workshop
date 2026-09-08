import type { APIRoute } from 'astro';
import { getDatabase } from '../../lib/db';
import { getAllGames } from '../../lib/games';

export const prerender = true;

/**
 * Emits browser-safe catalog metadata for progressive enhancement without exposing Drizzle in the client bundle.
 * @returns Static JSON used by search, filter, sort, and enhanced pagination controls.
 */
export const GET: APIRoute = async () => {
    const games = await getAllGames(getDatabase());

    return new Response(
        JSON.stringify({
            games: games.map((game) => ({
                id: game.id,
                title: game.title,
                starRating: game.starRating,
                categoryId: game.category?.id ?? null,
                publisherId: game.publisher?.id ?? null,
            })),
        }),
        {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            },
        },
    );
};
