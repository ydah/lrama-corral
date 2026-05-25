import { expect, test } from '@playwright/test';

const samplePresets = ['calc', 'simple', 'json', 'sql', 'lang', 'precedence', 'prologue'];

const loadCalcSample = async (page) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Parse grammar' })).toBeEnabled();
  await page.locator('#presetSelect').selectOption('calc');
  await expect(page.locator('#status')).toContainText('Sample loaded');
};

test('loads a sample grammar and renders parser analysis', async ({ page }) => {
  await loadCalcSample(page);

  await page.getByRole('button', { name: 'Parse grammar' }).click();

  await expect(page.locator('#status')).toContainText('Parse successful', { timeout: 90_000 });
  await expect(page.getByRole('heading', { name: 'Grammar Structure' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /State Transition Diagram/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Parse Table' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Syntax Diagrams/ })).toBeVisible();
  await expect(page.locator('#output svg script')).toHaveCount(0);

  const unsafeSvgAttributes = await page.locator('#output svg').evaluateAll((svgs) => {
    return svgs.flatMap(svg => {
      return Array.from(svg.querySelectorAll('*')).flatMap(element => {
        return Array.from(element.attributes)
          .filter(attribute => {
            const name = attribute.name.toLowerCase();
            const value = attribute.value.trim().toLowerCase();
            return name.startsWith('on') || value.startsWith('javascript:');
          })
          .map(attribute => `${element.tagName}:${attribute.name}`);
      });
    });
  });
  expect(unsafeSvgAttributes).toEqual([]);
});

test('parses every bundled sample grammar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Parse grammar' })).toBeEnabled();

  for (const preset of samplePresets) {
    await page.locator('#presetSelect').selectOption(preset);
    await expect(page.locator('#status')).toContainText('Sample loaded');

    await page.getByRole('button', { name: 'Parse grammar' }).click();
    await expect(page.locator('#status')).toContainText('Parse successful', { timeout: 90_000 });
    await expect(page.getByRole('heading', { name: 'Grammar Structure' })).toBeVisible();
  }
});

test('validates a sample grammar', async ({ page }) => {
  await loadCalcSample(page);

  await page.getByRole('button', { name: 'Validate grammar' }).click();

  await expect(page.locator('#status')).toContainText('Validation successful', { timeout: 90_000 });
  await expect(page.getByRole('heading', { name: 'Validation Result' })).toBeVisible();
});

test('exports report and grammar downloads', async ({ page }) => {
  await loadCalcSample(page);
  await page.getByRole('button', { name: 'Parse grammar' }).click();
  await expect(page.locator('#status')).toContainText('Parse successful', { timeout: 90_000 });

  const reportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export HTML report' }).click();
  await expect((await reportDownload).suggestedFilename()).toBe('calc-report.html');

  const grammarDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download grammar file' }).click();
  await expect((await grammarDownload).suggestedFilename()).toBe('calc.y');
});

test('uploads a grammar file and toggles theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Upload grammar file' })).toBeEnabled();

  await page.locator('#fileInput').setInputFiles({
    name: 'uploaded.y',
    mimeType: 'text/plain',
    buffer: Buffer.from('%token NUMBER\n%%\nexpr: NUMBER\n    ;\n'),
  });
  await expect(page.locator('#status')).toContainText('File "uploaded.y" loaded');

  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
