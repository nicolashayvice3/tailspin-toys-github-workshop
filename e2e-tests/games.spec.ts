import { test, expect, type Page, type Response } from '@playwright/test';

async function getVisibleGameIds(page: Page): Promise<string[]> {
  return page.locator('[data-testid="game-card"]').evaluateAll((cards) =>
    cards.map((card) => card.getAttribute('data-game-id') ?? ''),
  );
}

function naturalTitleSortKey(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/\d+/g, (chunk) => {
      const numericValue = chunk.replace(/^0+/, '') || '0';
      return `${String(numericValue.length).padStart(4, '0')}:${numericValue.padStart(24, '0')}`;
    });
}

test.describe('Game Listing and Navigation', () => {
  test('should display games with titles on index page', async ({ page }) => {
    await test.step('Navigate to homepage', async () => {
      await page.goto('/');
    });

    await test.step('Verify games grid is visible', async () => {
      const gamesGrid = page.getByTestId('games-grid');
      await expect(gamesGrid).toBeVisible();
    });

    await test.step('Verify game cards are displayed', async () => {
      const gameCards = page.getByTestId('game-card');
      await expect(gameCards.first()).toBeVisible();
      await expect(gameCards).toHaveCount(9);
    });

    await test.step('Verify game cards have titles with content', async () => {
      const gameCards = page.getByTestId('game-card');
      await expect(gameCards.first().getByTestId('game-title')).toBeVisible();
      await expect(gameCards.first().getByTestId('game-title')).not.toBeEmpty();
    });

    await test.step('Verify static pagination starts with a single current page', async () => {
      await expect(page.getByTestId('pagination')).toBeVisible();
      await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(page.getByTestId('pagination-page-current-1')).toBeVisible();
      await expect(page.getByTestId('results-summary')).toHaveText('Showing 1-9 of 21 games');
    });
  });

  test('should serve real static paginated pages without fetching the interactive catalog', async ({ page }) => {
    const catalogRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/games/catalog.json')) {
        catalogRequests.push(request.url());
      }
    });

    await test.step('Open the first static page with only one page of cards rendered', async () => {
      await page.goto('/');
      await expect(page.getByTestId('game-card')).toHaveCount(9);
      await expect.poll(() => getVisibleGameIds(page)).toEqual([
        '14', '7', '21', '5', '13', '10', '12', '1', '15',
      ]);
      expect(catalogRequests).toEqual([]);
    });

    await test.step('Navigate to page 2 through a real static link', async () => {
      await page.getByTestId('pagination-next').click();
      await expect(page).toHaveURL(/\/games\/page\/2\/$/);
      await expect(page.getByTestId('game-card')).toHaveCount(9);
      await expect.poll(() => getVisibleGameIds(page)).toEqual([
        '11', '6', '2', '16', '19', '4', '17', '3', '8',
      ]);
      await expect(page.getByTestId('results-summary')).toHaveText('Showing 10-18 of 21 games');
      await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(page.getByTestId('pagination-page-current-2')).toBeVisible();
      expect(catalogRequests).toEqual([]);
    });

    await test.step('Navigate directly to the last static page and back to page 1', async () => {
      await page.getByTestId('pagination-page-3').click();
      await expect(page).toHaveURL(/\/games\/page\/3\/$/);
      await expect(page.getByTestId('game-card')).toHaveCount(3);
      await expect.poll(() => getVisibleGameIds(page)).toEqual(['20', '18', '9']);
      await expect(page.getByTestId('results-summary')).toHaveText('Showing 19-21 of 21 games');
      await expect(page.getByTestId('pagination-next')).toHaveAttribute('aria-disabled', 'true');

      await page.getByTestId('pagination-page-1').click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByTestId('game-card')).toHaveCount(9);
      await expect.poll(() => getVisibleGameIds(page)).toEqual([
        '14', '7', '21', '5', '13', '10', '12', '1', '15',
      ]);
      expect(catalogRequests).toEqual([]);
    });
  });

  test('should return a 404 for pagination paths outside the prerendered range', async ({ page }) => {
    const response = await page.goto('/games/page/999/');

    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('not-found')).toBeVisible();
  });

  test('should canonicalize default query page values without creating impossible static paths', async ({ page }) => {
    await page.goto('/?page=999');
    await expect(page).toHaveURL(/\/games\/page\/3\/$/);
    await expect.poll(() => getVisibleGameIds(page)).toEqual(['20', '18', '9']);

    await page.goto('/?page=2.9');
    await expect(page).toHaveURL(/\/games\/page\/2\/$/);
    await expect.poll(() => getVisibleGameIds(page)).toEqual([
      '11', '6', '2', '16', '19', '4', '17', '3', '8',
    ]);

    await page.goto('/?page=-7');
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => getVisibleGameIds(page)).toEqual([
      '14', '7', '21', '5', '13', '10', '12', '1', '15',
    ]);

    await page.goto('/?page=Infinity');
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/games/page/2/?page=999');
    await expect(page).toHaveURL(/\/games\/page\/3\/$/);
  });

  test('should hydrate interactive pagination from direct reload and browser history', async ({ page }) => {
    await test.step('Open a filtered URL whose result is outside the first static page', async () => {
      await page.goto('/games/page/2/?page=2&query=Virtual');
      await expect(page).toHaveURL(/\/\?page=1&query=Virtual$/);
      await expect(page.getByTestId('game-card')).toHaveCount(1);
      await expect(page.getByTestId('game-title')).toHaveText('Virtual Server Simulator');
      await expect(page.getByTestId('results-summary')).toHaveText('Showing 1-1 of 1 game');
      await expect(page.getByTestId('pagination')).toBeHidden();
    });

    await test.step('Move through enhanced history without losing state', async () => {
      await page.getByTestId('game-search-input').fill('');
      await page.getByTestId('game-sort').selectOption('title-desc');
      await page.getByTestId('pagination-page-2').click();
      await expect(page).toHaveURL(/\/games\/page\/2\/\?page=2&sort=title-desc$/);
      await expect(page.getByTestId('pagination-page-current-2')).toBeVisible();

      await page.goBack();
      await expect(page).toHaveURL(/\/\?page=1&sort=title-desc$/);
      await expect(page.getByTestId('pagination-page-current-1')).toBeVisible();
      await page.goForward();
      await expect(page).toHaveURL(/\/games\/page\/2\/\?page=2&sort=title-desc$/);
      await expect(page.getByTestId('pagination-page-current-2')).toBeVisible();
    });
  });

  test('should preserve forward history when returning from enhanced state to the default baseline', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => getVisibleGameIds(page)).toEqual([
      '14', '7', '21', '5', '13', '10', '12', '1', '15',
    ]);

    await page.getByTestId('game-sort').selectOption('title-desc');
    await expect(page).toHaveURL(/\/\?page=1&sort=title-desc$/);
    await expect.poll(() => getVisibleGameIds(page)).toEqual([
      '9', '18', '20', '8', '3', '17', '4', '19', '16',
    ]);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => getVisibleGameIds(page)).toEqual([
      '14', '7', '21', '5', '13', '10', '12', '1', '15',
    ]);
    await expect(page.getByTestId('results-summary')).toHaveText('Showing 1-9 of 21 games');
    await expect(page.getByTestId('game-sort')).toHaveValue('title-asc');
    await expect(page.getByTestId('pagination-page-current-1')).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/\?page=1&sort=title-desc$/);
    await expect.poll(() => getVisibleGameIds(page)).toEqual([
      '9', '18', '20', '8', '3', '17', '4', '19', '16',
    ]);
    await expect(page.getByTestId('game-sort')).toHaveValue('title-desc');
    await expect(page.getByTestId('pagination-page-current-1')).toBeVisible();
  });

  test('should not let a delayed enhanced render overwrite a baseline restored via Back navigation', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => getVisibleGameIds(page)).toEqual([
      '14', '7', '21', '5', '13', '10', '12', '1', '15',
    ]);

    // Complete a normal enhanced navigation first so the URL, history entry, and catalog cache
    // are all in place before we simulate a slow *second* render.
    await page.getByTestId('game-sort').selectOption('title-desc');
    await expect(page).toHaveURL(/\/\?page=1&sort=title-desc$/);
    await expect.poll(() => getVisibleGameIds(page)).toEqual([
      '9', '18', '20', '8', '3', '17', '4', '19', '16',
    ]);

    // Delay the card-fragment requests for the *next* render only. The catalog metadata is
    // already cached from the sort-desc render above, so this reproduces a render that has
    // determined its page contents but is still awaiting the fragment HTML needed to paint it.
    let resolveDelayedFragments: (() => void) | undefined;
    const delayedFragments = new Promise<void>((resolve) => {
      resolveDelayedFragments = resolve;
    });

    await page.route('**/games/cards/*/', async (route) => {
      await delayedFragments;
      await route.fallback();
    });

    await page.getByTestId('game-sort').selectOption('rating-desc');

    // Before the slow rating-desc render can finish, navigate back to the default baseline.
    // This must invalidate the in-flight render and restore the original static state exactly.
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => getVisibleGameIds(page)).toEqual([
      '14', '7', '21', '5', '13', '10', '12', '1', '15',
    ]);
    await expect(page.getByTestId('results-summary')).toHaveText('Showing 1-9 of 21 games');
    await expect(page.getByTestId('game-sort')).toHaveValue('title-asc');

    // Let the delayed fragment requests resolve now; their completion belongs to a render that
    // was invalidated by the restored baseline and must not be allowed to overwrite it.
    resolveDelayedFragments?.();
    await page.waitForTimeout(200);
    await expect.poll(() => getVisibleGameIds(page)).toEqual([
      '14', '7', '21', '5', '13', '10', '12', '1', '15',
    ]);
    await expect(page.getByTestId('results-summary')).toHaveText('Showing 1-9 of 21 games');
    await expect(page.getByTestId('game-sort')).toHaveValue('title-asc');
  });

  test('should keep modified pagination clicks as normal link interactions and focus heading after enhanced page changes', async ({ page }) => {
    await page.goto('/?sort=title-desc');
    await expect(page.getByTestId('pagination-page-2')).toBeVisible();

    const modifiedClickWasNotCanceled = await page.getByTestId('pagination-page-2').evaluate((link) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
      return link.dispatchEvent(event);
    });
    expect(modifiedClickWasNotCanceled).toBe(true);
    await expect(page).toHaveURL(/\/\?page=1&sort=title-desc$/);

    await page.getByTestId('pagination-page-2').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/games\/page\/2\/\?page=2&sort=title-desc$/);
    await expect(page.getByTestId('catalog-heading')).toBeFocused();
  });

  test('should preserve repeated category, publisher, sort, query, and page state in enhanced links', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: 'Strategy' }).check();
    await page.getByRole('checkbox', { name: 'Puzzle' }).check();
    await page.getByLabel('Filter by publisher').selectOption({ label: 'CodeForge Studios' });
    await page.getByTestId('game-search-input').fill('e');
    await page.getByTestId('game-sort').selectOption('title-desc');

    const url = new URL(page.url());
    expect(url.searchParams.getAll('category')).toHaveLength(2);
    expect(url.searchParams.get('publisher')).toBeTruthy();
    expect(url.searchParams.get('sort')).toBe('title-desc');
    expect(url.searchParams.get('query')).toBe('e');
    expect(url.searchParams.get('page')).toBe('1');
    await expect(page.getByTestId('pagination')).toBeHidden();
    await expect(page.getByTestId('game-title')).toHaveText(['DevOps Dominion', 'Code Puzzle Chronicles']);
  });

  test('should keep the current static page visible and surface an error when lazy catalog loading fails', async ({ page }) => {
    await page.route('**/games/catalog.json', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
    await page.goto('/');
    await page.getByTestId('game-search-input').fill('Virtual');

    await expect(page.getByTestId('catalog-load-error')).toBeVisible();
    await expect(page.getByTestId('results-summary')).toHaveText('Could not update catalog. Try again.');
    await expect(page.getByTestId('game-card')).toHaveCount(9);
  });

  test('should retry catalog loading successfully after an initial failure', async ({ page }) => {
    let catalogAttempts = 0;
    await page.route('**/games/catalog.json', async (route) => {
      catalogAttempts += 1;
      if (catalogAttempts === 1) {
        await route.fulfill({ status: 503, body: 'unavailable' });
        return;
      }

      await route.fallback();
    });

    await page.goto('/');
    await page.getByTestId('game-search-input').fill('Virtual');
    await expect(page.getByTestId('catalog-load-error')).toBeVisible();

    await page.getByTestId('catalog-retry-button').click();
    await expect(page.getByTestId('catalog-load-error')).toBeHidden();
    await expect(page.locator('[data-testid="game-title"]')).toHaveText(['Virtual Server Simulator']);
    await expect(page.getByTestId('results-summary')).toHaveText('Showing 1-1 of 1 game');
  });

  test('should reject malformed catalog payloads instead of trusting array shape', async ({ page }) => {
    await page.route('**/games/catalog.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ games: [{ id: 'bad', title: 'Bad payload' }] }),
      }),
    );

    await page.goto('/');
    await page.getByTestId('game-search-input').fill('Virtual');
    await expect(page.getByTestId('catalog-load-error')).toBeVisible();
    await expect(page.getByTestId('results-summary')).toHaveText('Could not update catalog. Try again.');
    await expect(page.getByTestId('game-card')).toHaveCount(9);
  });

  test('should render only the latest requested state when catalog loading is delayed', async ({ page }) => {
    await page.route('**/games/catalog.json', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fallback();
    });

    await page.goto('/');
    const searchInput = page.getByTestId('game-search-input');
    await searchInput.fill('Virtual');
    await searchInput.fill('Code');

    await expect(page.getByTestId('game-title')).toHaveText(['Code Puzzle Chronicles', 'Code Quest Odyssey']);
    await expect(page.getByTestId('results-summary')).toHaveText('Showing 1-2 of 2 games');
  });

  test('should surface unavailable URL filters without broadening the displayed control state', async ({ page }) => {
    await page.goto('/?category=9999&publisher=9999');

    await expect(page.getByTestId('catalog-invalid-state')).toBeVisible();
    await expect(page.getByTestId('filter-empty-state')).toBeVisible();
    await expect(page.getByTestId('results-summary')).toHaveText('0 games shown');
    await expect(page.locator('input[name="category"][type="checkbox"]:checked')).toHaveCount(0);
    await expect(page.getByLabel('Filter by publisher')).toHaveValue('');

    await page.getByTestId('game-sort').selectOption('rating-desc');
    await expect(page.getByTestId('catalog-invalid-state')).toBeVisible();
    await expect(page.getByTestId('filter-empty-state')).toBeVisible();

    await page.getByTestId('clear-filters-button').click();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('catalog-invalid-state')).toBeHidden();
  });

  test('should reorder visible cards for every sort mode while filters remain active', async ({ page }) => {
    await page.goto('/');
    const sortSelect = page.getByTestId('game-sort');
    const visibleCards = page.locator('[data-testid="game-card"]');

    const readVisibleGames = async () => page.locator('[data-testid="game-card"]').evaluateAll((cards) =>
      cards
        .map((card) => ({
          id: Number(card.getAttribute('data-game-id')),
          title: card.getAttribute('data-game-title') ?? '',
          rating: card.getAttribute('data-game-rating') === '' ? null : Number(card.getAttribute('data-game-rating')),
        })),
    );

    const compareTitles = (
      a: Awaited<ReturnType<typeof readVisibleGames>>[number],
      b: Awaited<ReturnType<typeof readVisibleGames>>[number],
      direction: 'asc' | 'desc',
    ) => {
      const titleA = naturalTitleSortKey(a.title);
      const titleB = naturalTitleSortKey(b.title);
      const comparison = titleA < titleB ? -1 : titleA > titleB ? 1 : 0;
      return comparison === 0 ? a.id - b.id : direction === 'asc' ? comparison : -comparison;
    };
    const expectedTitleOrder = (games: Awaited<ReturnType<typeof readVisibleGames>>, direction: 'asc' | 'desc') =>
      [...games].sort((a, b) => compareTitles(a, b, direction));

    await expect(visibleCards).toHaveCount(9);

    await sortSelect.selectOption('title-desc');
    await expect(visibleCards).toHaveCount(9);
    await expect(page.locator('[data-testid="game-card"]').first()).toHaveAttribute('data-game-id', '9');
    const titleDescGames = await readVisibleGames();
    expect(titleDescGames.map((game) => game.title)).toEqual([
      'Virtual Server Simulator',
      'Terminal Turbulence',
      'Syntax Smashdown',
      'Stack Trace Secrets',
      'Server Siege',
      'Script Strike',
      'Repo Rulers',
      'Repo Rampart',
      'Refactor Realms',
    ]);
    expect(titleDescGames).toEqual(expectedTitleOrder(titleDescGames, 'desc'));

    await sortSelect.selectOption('rating-desc');
    await expect(page.locator('[data-testid="game-card"]').first()).toHaveAttribute('data-game-id', '12');
    const ratingSorted = await readVisibleGames();
    expect(ratingSorted).toEqual(
      [...ratingSorted].sort((a, b) => {
        if ((a.rating === null) !== (b.rating === null)) return a.rating === null ? 1 : -1;
        if (a.rating !== b.rating) return (b.rating ?? 0) - (a.rating ?? 0);
        return compareTitles(a, b, 'asc');
      }),
    );

    await page.getByRole('checkbox', { name: 'Strategy' }).check();
    await page.getByRole('checkbox', { name: 'Puzzle' }).check();
    await page.getByLabel('Filter by publisher').selectOption({ label: 'CodeForge Studios' });
    await page.getByTestId('game-search-input').fill('e');
    const filteredGames = await readVisibleGames();
    const filteredRatingOrder = [...filteredGames];
    expect(filteredGames.length).toBeGreaterThan(1);
    expect(filteredGames).toEqual(
      filteredRatingOrder.sort((a, b) => {
        if ((a.rating === null) !== (b.rating === null)) return a.rating === null ? 1 : -1;
        if (a.rating !== b.rating) return (b.rating ?? 0) - (a.rating ?? 0);
        return compareTitles(a, b, 'asc');
      }),
    );

    await sortSelect.selectOption('title-asc');
    const filteredTitleOrder = await readVisibleGames();
    expect(filteredTitleOrder).toEqual(expectedTitleOrder(filteredGames, 'asc'));
  });

  test('should search by title and compose with category and publisher filters', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.getByTestId('game-search-input');
    const visibleTitles = page.locator('[data-testid="game-card"]:visible [data-testid="game-title"]');
    const firstPageGameIds = await page.locator('[data-testid="game-card"]').evaluateAll((cards) =>
      cards.map((card) => Number(card.getAttribute('data-game-id'))),
    );
    const catalogTotal = await page.getByTestId('catalog-summary-total').textContent();
    const catalogAverage = await page.getByTestId('catalog-summary-average').textContent();

    await test.step('Search first and submit with the keyboard without a second navigation', async () => {
      await searchInput.fill('  cOdE  ');
      await expect(visibleTitles).toHaveCount(2);
      const urlAfterTyping = page.url();
      await searchInput.press('Enter');
      await expect(page).toHaveURL(urlAfterTyping);
      await expect(searchInput).toHaveValue('  cOdE  ');
      await expect(searchInput).toBeFocused();
      await expect(visibleTitles).toHaveText(['Code Puzzle Chronicles', 'Code Quest Odyssey']);
    });

    await test.step('Change publisher then categories while the query remains active', async () => {
      await page.getByLabel('Filter by publisher').selectOption({ label: 'CodeForge Studios' });
      await expect(visibleTitles).toHaveText(['Code Puzzle Chronicles', 'Code Quest Odyssey']);
      await page.getByRole('checkbox', { name: 'Puzzle' }).check();
      await page.getByRole('checkbox', { name: 'Strategy' }).check();
      await expect(visibleTitles).toHaveCount(1);
      await expect(visibleTitles).toHaveText('Code Puzzle Chronicles');
      await expect(page.getByTestId('results-summary')).toHaveText('Showing 1-1 of 1 game');
    });

    await test.step('Submit through the button and show a single coherent no-match state', async () => {
      await searchInput.fill('zzz-no-matches');
      await page.getByTestId('game-search-submit').click();
      await expect(visibleTitles).toHaveCount(0);
      await expect(page.getByTestId('filter-empty-state')).toBeVisible();
      await expect(page.getByTestId('results-summary')).toHaveText('0 games shown');
      await expect(searchInput).toBeFocused();
    });

    await test.step('Clear the query while preserving both selected filter groups', async () => {
      await searchInput.fill('');
      await expect(visibleTitles).toHaveCount(2);
      await expect(visibleTitles).toHaveText(['Code Puzzle Chronicles', 'DevOps Dominion']);
      await expect(page.getByRole('checkbox', { name: 'Puzzle' })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Strategy' })).toBeChecked();
      await expect(page.getByLabel('Filter by publisher')).toHaveValue(/./);
    });

    await test.step('Clear all controls from a nonempty query and restore the exact catalog', async () => {
      await searchInput.fill('code');
      await expect(visibleTitles).toHaveCount(1);
      await expect(visibleTitles).toHaveText('Code Puzzle Chronicles');
      await page.getByTestId('clear-filters-button').click();
      await expect(page).toHaveURL('/');
      await expect(searchInput).toHaveValue('');
      await expect(page.getByTestId('filter-empty-state')).toBeHidden();
      await expect(page.locator('input[name="category"][type="checkbox"]:checked')).toHaveCount(0);
      await expect(page.getByLabel('Filter by publisher')).toHaveValue('');
      await expect(visibleTitles).toHaveCount(firstPageGameIds.length);
      const restoredGameIds = await page.locator('[data-testid="game-card"]').evaluateAll((cards) =>
        cards.map((card) => Number(card.getAttribute('data-game-id'))),
      );
      expect(restoredGameIds).toEqual(firstPageGameIds);
      await expect(page.getByTestId('catalog-summary-total')).toHaveText(catalogTotal!);
      await expect(page.getByTestId('catalog-summary-average')).toHaveText(catalogAverage!);
    });
  });

  test('should navigate to a publisher page from the game details view', async ({ page }) => {
    let publisherName: string | null = null;

    await test.step('Navigate to a game details page and locate the publisher link', async () => {
      await page.goto('/game/1');
      const publisherLink = page.getByTestId('game-details-publisher').first();
      await expect(publisherLink).toBeVisible();
      await expect(publisherLink).toHaveAttribute('href', /\/publisher\/\d+/);
      publisherName = (await publisherLink.textContent())?.trim() ?? null;
      expect(publisherName).toBeTruthy();
      const linkHref = await publisherLink.getAttribute('href');
      expect(linkHref).not.toBeNull();
      await publisherLink.click();
      await expect(page).toHaveURL(linkHref!);
    });

    await test.step('Verify the publisher page heading and description match the selected publisher', async () => {
      await expect(page.getByTestId('publisher-page')).toBeVisible();
      await expect(page.getByTestId('page-hero-title')).toHaveText(publisherName!);
      await expect(page.getByTestId('publisher-description')).toContainText(
        'CodeForge Studios is a game publisher seeking funding for exciting new titles',
      );
    });

    await test.step('Verify every rendered game card belongs to the selected publisher', async () => {
      const gamesGrid = page.getByTestId('publisher-games-grid');
      await expect(gamesGrid).toBeVisible();
      const gameCards = gamesGrid.getByTestId('game-card');
      const cardCount = await gameCards.count();
      expect(cardCount).toBeGreaterThan(1);
      for (let i = 0; i < cardCount; i++) {
        await expect(gameCards.nth(i).getByTestId('game-publisher')).toHaveText(publisherName!);
      }
    });
  });

  test('should show a branded 404 for a missing publisher route', async ({ page }) => {
    let response: Response | null;

    await test.step('Navigate to a non-existent publisher route', async () => {
      response = await page.goto('/publisher/99999');
    });

    await test.step('Verify the missing publisher route returns HTTP 404 and renders the branded page', async () => {
      expect(response?.status()).toBe(404);
      await expect(page).toHaveTitle(/Page Not Found - Tailspin Toys/);
      await expect(page.getByTestId('not-found')).toBeVisible();
      await expect(page.getByTestId('not-found-heading')).toHaveText('Page not found');
    });
  });

  test('should navigate to correct game details page when clicking on a game', async ({ page }) => {
    let gameId: string | null;
    let gameTitle: string | null;

    await test.step('Navigate to homepage and wait for games to load', async () => {
      await page.goto('/');
      const gamesGrid = page.getByTestId('games-grid');
      await expect(gamesGrid).toBeVisible();
    });

    await test.step('Get first game information and click it', async () => {
      const firstGameCard = page.getByTestId('game-card').first();
      gameId = await firstGameCard.getAttribute('data-game-id');
      gameTitle = await firstGameCard.getAttribute('data-game-title');
      await firstGameCard.click();
    });

    await test.step('Verify navigation to game details page', async () => {
      await expect(page).toHaveURL(`/game/${gameId}`);
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Verify game title matches clicked game', async () => {
      if (gameTitle) {
        await expect(page.getByTestId('game-details-title')).toHaveText(gameTitle);
      }
    });
  });

  test('should display game details with all required information', async ({ page }) => {
    await test.step('Navigate to specific game details page', async () => {
      await page.goto('/game/1');
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Verify game title is displayed', async () => {
      const gameTitle = page.getByTestId('game-details-title');
      await expect(gameTitle).toBeVisible();
      await expect(gameTitle).not.toBeEmpty();
    });

    await test.step('Verify game description is displayed', async () => {
      const gameDescription = page.getByTestId('game-details-description');
      await expect(gameDescription).toBeVisible();
      await expect(gameDescription).not.toBeEmpty();
    });

    await test.step('Verify category and publisher descriptions render when available', async () => {
      const categoryDescription = page.getByTestId('game-details-category-description');
      const publisherDescription = page.getByTestId('game-details-publisher-description');
      const categoryTag = page.getByTestId('game-details-category');
      const publisherTag = page.getByTestId('game-details-publisher');

      const hasCategoryDescription = await categoryDescription.count();
      const hasPublisherDescription = await publisherDescription.count();

      expect(hasCategoryDescription).toBe(1);
      expect(hasPublisherDescription).toBe(1);
      await expect(categoryDescription).toContainText('Collection of Strategy games available for crowdfunding');
      await expect(publisherDescription).toContainText(
        'CodeForge Studios is a game publisher seeking funding for exciting new titles',
      );
      await expect(categoryTag).toBeVisible();
      await expect(publisherTag).toBeVisible();
    });

    await test.step('Verify publisher or category information is present', async () => {
      const publisherExists = await page.getByTestId('game-details-publisher').isVisible();
      const categoryExists = await page.getByTestId('game-details-category').isVisible();
      expect(publisherExists || categoryExists).toBeTruthy();

      if (publisherExists) {
        await expect(page.getByTestId('game-details-publisher')).not.toBeEmpty();
      }

      if (categoryExists) {
        await expect(page.getByTestId('game-details-category')).not.toBeEmpty();
      }
    });
  });

  test('should allow filtering by multiple categories and a publisher together', async ({ page }) => {
    let firstPageCatalogIds: number[] = [];

    await test.step('Navigate to homepage and apply combined filters', async () => {
      await page.goto('/');
      await expect(page.getByTestId('filter-empty-state')).toBeHidden();
      firstPageCatalogIds = await page.locator('[data-testid="game-card"]').evaluateAll((cards) =>
        cards.map((card) => Number(card.getAttribute('data-game-id'))),
      );
      await page.getByRole('checkbox', { name: 'Strategy' }).check();
      await page.getByRole('checkbox', { name: 'Puzzle' }).check();
      await page.getByLabel('Filter by publisher').selectOption({ label: 'CodeForge Studios' });
    });

    await test.step('Verify only the category+publisher matches remain visible', async () => {
      const visibleCards = page.locator('[data-testid="game-card"]:visible [data-testid="game-title"]');
      await expect(visibleCards).toHaveCount(2);
      const visibleTitles = await visibleCards.allTextContents();
      expect([...visibleTitles].sort()).toEqual(['Code Puzzle Chronicles', 'DevOps Dominion']);
      await expect(page.getByTestId('results-summary')).toHaveText('Showing 1-2 of 2 games');
      await expect(page.getByTestId('filter-empty-state')).toBeHidden();
    });

    await test.step('Simulate a synthetic invalid publisher value to force a no-match state', async () => {
      await page.getByRole('checkbox', { name: 'Strategy' }).uncheck();
      await page.getByRole('checkbox', { name: 'Puzzle' }).uncheck();
      await page.getByRole('checkbox', { name: 'Simulation' }).check();
      await page.getByRole('checkbox', { name: 'Adventure' }).check();

      await page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>('[data-testid="publisher-filter"]');
        if (!select) {
          throw new Error('Publisher filter not found');
        }
        const invalidOption = document.createElement('option');
        invalidOption.value = '9999';
        invalidOption.textContent = 'No Match Publisher';
        select.append(invalidOption);
        select.value = '9999';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const visibleCards = page.locator('[data-testid="game-card"]:visible');
      await expect(visibleCards).toHaveCount(0);
      await expect(page.getByTestId('filter-empty-state')).toBeVisible();
      await expect(page.getByTestId('results-summary')).toHaveText('0 games shown');
    });

    await test.step('Reset filters and confirm the original catalog returns exactly', async () => {
      await page.getByTestId('clear-filters-button').click();
      await expect(page).toHaveURL('/');

      const visibleIds = await page.locator('[data-testid="game-card"]').evaluateAll((cards) =>
        cards.map((card) => Number(card.getAttribute('data-game-id'))),
      );
      await expect(page.locator('input[name="category"][type="checkbox"]:checked')).toHaveCount(0);
      await expect(page.getByLabel('Filter by publisher')).toHaveValue('');
      expect(visibleIds).toEqual(firstPageCatalogIds);
      await expect(page.getByTestId('filter-empty-state')).toBeHidden();
      await expect(page.getByTestId('results-summary')).toHaveText('Showing 1-9 of 21 games');
    });
  });

  test('should support keyboard interactions for category filters', async ({ page }) => {
    await test.step('Navigate to the homepage and toggle a category with the keyboard', async () => {
      await page.goto('/');
      const strategyCheckbox = page.getByRole('checkbox', { name: 'Strategy' });

      await strategyCheckbox.focus();
      await expect(strategyCheckbox).toBeFocused();
      await page.keyboard.press('Space');
      await expect(strategyCheckbox).toBeChecked();
      await expect(page.getByTestId('results-summary')).toHaveText('Showing 1-4 of 4 games');
      await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(4);
    });
  });

  test('should display a button to back the game', async ({ page }) => {
    await test.step('Navigate to game details page', async () => {
      await page.goto('/game/1');
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Verify back game button is visible and enabled', async () => {
      const backButton = page.getByTestId('back-game-button');
      await expect(backButton).toBeVisible();
      await expect(backButton).toContainText('Support This Game');
      await expect(backButton).toBeEnabled();
    });
  });

  test('should be able to navigate back to home from game details', async ({ page }) => {
    await test.step('Navigate to game details page', async () => {
      await page.goto('/game/1');
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Click back to all games link', async () => {
      const backLink = page.getByRole('link', { name: /back to all games/i });
      await expect(backLink).toBeVisible();
      await backLink.click();
    });

    await test.step('Verify navigation back to homepage', async () => {
      await expect(page).toHaveURL('/');
      await expect(page.getByTestId('games-grid')).toBeVisible();
    });
  });

  test('should return a 404 page for a non-existent game', async ({ page }) => {
    let response: Response | null;

    await test.step('Navigate to non-existent game', async () => {
      response = await page.goto('/game/99999');
    });

    await test.step('Verify a branded 404 page is served', async () => {
      expect(response?.status()).toBe(404);
      await expect(page).toHaveTitle(/Page Not Found - Tailspin Toys/);
      await expect(page.getByTestId('not-found')).toBeVisible();
      await expect(page.getByTestId('not-found-heading')).not.toBeEmpty();
      await expect(page.getByTestId('not-found-home-link')).toBeVisible();
    });
  });
});

test.describe('Game Listing without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('should keep static pagination usable and render only the requested page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('catalog-noscript-note')).toBeVisible();
    await expect(page.getByTestId('game-card')).toHaveCount(9);
    await page.getByTestId('pagination-next').click();
    await expect(page).toHaveURL(/\/games\/page\/2\/$/);
    await expect(page.getByTestId('game-card')).toHaveCount(9);
    await expect(page.getByTestId('pagination-page-current-2')).toBeVisible();
  });
});
