import { test, expect, type Response } from '@playwright/test';

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
      expect(await gameCards.count()).toBeGreaterThan(0);
    });

    await test.step('Verify game cards have titles with content', async () => {
      const gameCards = page.getByTestId('game-card');
      await expect(gameCards.first().getByTestId('game-title')).toBeVisible();
      await expect(gameCards.first().getByTestId('game-title')).not.toBeEmpty();
    });
  });

  test('should search by title and compose with category and publisher filters', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.getByTestId('game-search-input');
    const visibleTitles = page.locator('[data-testid="game-card"]:visible [data-testid="game-title"]');
    const allGameIds = await page.locator('[data-testid="game-card"]').evaluateAll((cards) =>
      cards.map((card) => Number(card.getAttribute('data-game-id'))),
    );
    const catalogTotal = await page.getByTestId('catalog-summary-total').textContent();
    const catalogAverage = await page.getByTestId('catalog-summary-average').textContent();
    const initialUrl = page.url();

    await test.step('Search first and submit with the keyboard without navigating', async () => {
      await searchInput.fill('  cOdE  ');
      await searchInput.press('Enter');
      await expect(page).toHaveURL(initialUrl);
      await expect(searchInput).toHaveValue('  cOdE  ');
      await expect(searchInput).toBeFocused();
      await expect(visibleTitles).toHaveCount(2);
      await expect(visibleTitles).toHaveText(['Code Puzzle Chronicles', 'Code Quest Odyssey']);
    });

    await test.step('Change publisher then categories while the query remains active', async () => {
      await page.getByLabel('Filter by publisher').selectOption({ label: 'CodeForge Studios' });
      await expect(visibleTitles).toHaveText(['Code Puzzle Chronicles', 'Code Quest Odyssey']);
      await page.getByRole('checkbox', { name: 'Puzzle' }).check();
      await page.getByRole('checkbox', { name: 'Strategy' }).check();
      await expect(visibleTitles).toHaveCount(1);
      await expect(visibleTitles).toHaveText('Code Puzzle Chronicles');
      await expect(page.getByTestId('results-summary')).toHaveText('1 game shown');
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
      await expect(searchInput).toHaveValue('');
      await expect(page.getByTestId('filter-empty-state')).toBeHidden();
      await expect(page.locator('input[name="category"][type="checkbox"]:checked')).toHaveCount(0);
      await expect(page.getByLabel('Filter by publisher')).toHaveValue('');
      await expect(visibleTitles).toHaveCount(allGameIds.length);
      const restoredGameIds = await page.locator('[data-testid="game-card"]:visible').evaluateAll((cards) =>
        cards.map((card) => Number(card.getAttribute('data-game-id'))),
      );
      expect(restoredGameIds).toEqual(allGameIds);
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
    let fullCatalogIds: number[] = [];

    await test.step('Navigate to homepage and apply combined filters', async () => {
      await page.goto('/');
      await expect(page.getByTestId('filter-empty-state')).toBeHidden();
      fullCatalogIds = await page.locator('[data-testid="game-card"]').evaluateAll((cards) =>
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
      await expect(page.getByTestId('results-summary')).toHaveText('2 games shown');
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

      const visibleIds = await page.locator('[data-testid="game-card"]:visible').evaluateAll((cards) =>
        cards.map((card) => Number(card.getAttribute('data-game-id'))),
      );
      await expect(page.locator('input[name="category"][type="checkbox"]:checked')).toHaveCount(0);
      await expect(page.getByLabel('Filter by publisher')).toHaveValue('');
      expect(visibleIds).toEqual(fullCatalogIds);
      await expect(page.getByTestId('filter-empty-state')).toBeHidden();
      await expect(page.getByTestId('results-summary')).toHaveText(`${fullCatalogIds.length} games shown`);
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
      await expect(page.getByTestId('results-summary')).toHaveText('4 games shown');
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
