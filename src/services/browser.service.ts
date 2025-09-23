import { Browser, BrowserContext, Page, chromium, Locator } from 'playwright';

/**
 * Information about a station item.
 */
export type StationItemInfo = {
  itemSelector: string;
  flexNoneText: string;
  textBasedSelector: string;
  returnStations?: StationItemInfo[];
  availableDates?: string[];
  processed?: boolean;
  error?: string;
};

/**
 * Service for browser automation using Playwright.
 * Handles website navigation, cookie consent, element detection, and location finding.
 */
export class BrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly screenshotsEnabled: boolean;

  /**
   * Creates a new instance of BrowserService.
   * @param options - Optional configuration options
   */
  constructor() {
    // Check if screenshots are enabled (default to true if env var is not set)
    this.screenshotsEnabled = process.env.PLAYWRIGHT_SCREENSHOTS_ENABLED !== 'false';
  }

  /**
   * Initializes the browser instance.
   * @throws Error if browser initialization fails
   */
  public async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
        ],
      });
      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();
    } catch (error) {
      await this.close();
      throw new Error(
        `Failed to initialize browser: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Navigates to the specified URL.
   * @param url - The URL to navigate to
   * @throws Error if navigation fails
   */
  public async navigateTo(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      await this.page.goto(url, { waitUntil: 'networkidle' });
    } catch (error) {
      throw new Error(
        `Failed to navigate to ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Accepts cookies on the German cookie consent banner.
   * @throws Error if cookie acceptance fails
   */
  public async acceptCookies(): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      // Wait for cookie banner to appear with a timeout
      const cookieSelector = 'button[data-testid="uc-accept-all-button"]';
      await this.page.waitForSelector(cookieSelector, { timeout: 5000 }).catch(() => {
        console.log('Cookie consent banner not found or already accepted.');
      });

      // Click the accept button if it exists
      const cookieButton = await this.page.$(cookieSelector);
      if (cookieButton) {
        await cookieButton.click();
        console.log('Cookies accepted successfully.');
      }
    } catch (error) {
      throw new Error(
        `Failed to accept cookies: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Finds and clicks on the "Choose your location" element.
   * @throws Error if the element cannot be found or clicked
   */
  public async clickChooseLocationElement(): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      console.log('🔍 Finding "Choose your location" element...');

      // Wait for page to stabilize
      await this.page.waitForTimeout(2000);

      // Try multiple selector strategies for resilience based on the HTML structure
      const selectors = [
        // English selectors
        'span.search-input--value:has-text("Choose your location")',
        '.search-input span:has-text("Choose your location")',
        '.search-inputs .search-input:has-text("Choose your location")',
        // German selectors
        'span.search-input--value:has-text("Wähle deine Station")',
        '.search-input span:has-text("Wähle deine Station")',
        '.search-inputs .search-input:has-text("Wähle deine Station")',
        'text="Wähle deine Station"',
        'div:has-text("Wähle deine Station")',
      ];

      let locationElement: Locator | null = null;

      // Try each selector until we find a visible element
      for (const selector of selectors) {
        try {
          const element = this.page.locator(selector).first();

          // Wait for element to be visible with timeout
          await this.page
            .waitForSelector(selector, { state: 'visible', timeout: 200 })
            .catch(() => console.log(`Selector not visible: ${selector}`));

          const isVisible = await element.isVisible().catch(() => false);

          if (isVisible) {
            locationElement = element;
            console.log(`Found location element using selector: ${selector}`);
            break;
          }
        } catch (err) {
          // Continue to the next selector
          continue;
        }
      }

      if (!locationElement) {
        throw new Error('Could not find "Choose your location" element with any selector');
      }

      // Wait a moment before clicking to ensure element is fully loaded and interactive
      await this.page.waitForTimeout(500);

      // Click the element with retry logic
      try {
        await locationElement.click({ timeout: 3000 });
        console.log('✅ Successfully clicked on "Choose your location" element');
      } catch (clickError) {
        console.log('First click attempt failed, trying again with force option...');
        // Try again with force option if first attempt fails
        await locationElement.click({ force: true, timeout: 3000 });
        console.log('✅ Successfully clicked on "Choose your location" element with force option');
      }

      // Wait after click to allow any animations or transitions to complete
      await this.page.waitForTimeout(1000);
    } catch (error) {
      // Take a screenshot for debugging if enabled
      if (this.page && this.screenshotsEnabled) {
        await this.page.screenshot({ path: 'error-location-element.png' });
      }
      throw new Error(
        `Failed to click on "Choose your location" element: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Waits for the location popup to appear.
   * @returns The popup element locator
   * @throws Error if the popup does not appear within the timeout
   */
  public async waitForLocationPopup(): Promise<Locator> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      console.log('⏳ Waiting for location popup to appear...');

      // Initial wait to allow for any animations or transitions after clicking
      await this.page.waitForTimeout(3000);

      // Try multiple selector strategies for the popup
      const popupSelectors = [
        // English selectors
        'h5:has-text("Select pick-up & drop-off location")',
        // German selectors
        'h5:has-text("Abhol- und Rückgabestation wählen")',
        'h5:has-text("Abholstation wählen")',
        // Generic selectors
        'div.modal__window.md',
        'main.modal__body',
      ];

      let popupElement: Locator | null = null;

      // Try each selector with a timeout
      for (const selector of popupSelectors) {
        try {
          console.log(`Trying to find popup with selector: ${selector}`);
          // Increase timeout to give more time for the popup to appear
          await this.page
            .waitForSelector(selector, { state: 'visible', timeout: 200 })
            .catch(() => console.log(`Popup selector not visible: ${selector}`));

          const element = this.page.locator(selector);
          const isVisible = await element.isVisible().catch(() => false);

          if (isVisible) {
            popupElement = element;
            console.log(`Found popup using selector: ${selector}`);
            break;
          }
        } catch (err) {
          // Continue to the next selector
          continue;
        }
      }

      if (!popupElement) {
        // Take a screenshot for debugging if enabled
        if (this.screenshotsEnabled) {
          await this.page.screenshot({ path: 'error-popup-not-found.png' });
        }
        throw new Error('Location popup did not appear within the timeout');
      }

      // Wait a moment to ensure the popup is fully loaded
      await this.page.waitForTimeout(500);

      console.log('✅ Location popup appeared successfully');
      return popupElement;
    } catch (error) {
      // Take a screenshot for debugging if enabled
      if (this.page && this.screenshotsEnabled) {
        await this.page.screenshot({ path: 'error-location-popup.png' });
      }
      throw new Error(
        `Failed to wait for location popup: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Extracts information about a station item.
   * @param item - The station item locator
   * @param successfulSelector - The selector used to find the station items
   * @param index - The index of the item in the list
   * @returns Information about the station item
   */
  private async extractStationItemInfo(
    item: Locator,
    successfulSelector: string,
    index: number
  ): Promise<StationItemInfo> {
    // Wait for each item to be visible before extracting text
    await item
      .waitFor({ state: 'visible', timeout: 200 })
      .catch(() => console.log(`Warning: Station item #${index + 1} not fully visible`));

    // Get the full text content
    const textContent =
      (await item.textContent().catch(() => '[Error reading content]')) || '[No text]';
    const trimmedText = textContent.trim();

    // Try to find span.flex-none element within the item
    let flexNoneText = '';
    try {
      const flexNoneElement = item.locator('span.flex-none').first();
      flexNoneText = (await flexNoneElement.textContent()) || '';
      flexNoneText = flexNoneText.trim();
    } catch (flexNoneError) {
      console.log(`Warning: Could not find span.flex-none in item #${index + 1}`);
      // If span.flex-none is not found, use the full text
      flexNoneText = trimmedText;
    }

    // Create a selector that would locate the element by its text
    const textBasedSelector = flexNoneText
      ? `${successfulSelector}:has-text("${flexNoneText}")`
      : `${successfulSelector}:nth-child(${index + 1})`;

    // Return the information
    return {
      itemSelector: `${successfulSelector}:nth-child(${index + 1})`,
      flexNoneText,
      textBasedSelector,
    };
  }

  /**
   * Clicks on an element using the provided selector.
   * @param selector - The selector to use for finding the element
   * @param description - A description of the element for logging
   * @throws Error if the element cannot be found or clicked
   */
  public async clickElementBySelector(selector: string, description: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      console.log(`🔍 Finding and clicking on ${description} with selector: ${selector}`);

      // Wait for element to be visible
      await this.page
        .waitForSelector(selector, { state: 'visible', timeout: 200 })
        .catch(() => console.log(`Warning: ${description} not visible with selector: ${selector}`));

      // Check if the element exists and is visible before clicking
      const element = this.page.locator(selector);
      const isVisible = await element.isVisible().catch(() => false);

      if (!isVisible) {
        throw new Error(
          `Element ${description} not found or not visible with selector: ${selector}`
        );
      }

      // Click the element
      await element.click();
      console.log(`✅ Successfully clicked on ${description}`);

      // Wait a moment after clicking
      await this.page.waitForTimeout(200);
    } catch (error) {
      // Take a screenshot for debugging if enabled
      if (this.page && this.screenshotsEnabled) {
        await this.page.screenshot({ path: `error-click-${description.replace(/\s+/g, '-')}.png` });
      }
      throw new Error(
        `Failed to click on ${description}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Finds all station items in the location popup and prints their details.
   * @returns A list of station item information
   * @throws Error if station items cannot be found or processed
   */
  public async findAndPrintStationItems(): Promise<StationItemInfo[]> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      console.log('🔍 Finding station items in the popup...');

      // Wait for popup content to fully load
      await this.page.waitForTimeout(1000);

      // Try multiple selector strategies for station items
      const stationItemSelectors = [
        'li.station-item',
        '[data-test-id="station-item"]',
        '.location-list li',
        'ul.stations-list > li',
        // Add more specific selectors based on the actual structure
        'div[role="dialog"] li',
        '.modal-content li',
        'div[role="dialog"] .list-item',
        'div[role="dialog"] [role="listitem"]',
      ];

      let stationItems: Locator | null = null;
      let stationItemsCount = 0;
      let successfulSelector = '';

      // Try each selector
      for (const selector of stationItemSelectors) {
        try {
          console.log(`Trying to find station items with selector: ${selector}`);

          // Wait for items to be visible with timeout
          await this.page
            .waitForSelector(selector, { state: 'visible', timeout: 200 })
            .catch(() => console.log(`Station items selector not visible: ${selector}`));

          const items = this.page.locator(selector);
          const count = await items.count();

          if (count > 0) {
            stationItems = items;
            stationItemsCount = count;
            successfulSelector = selector;
            console.log(`Found ${count} station items using selector: ${selector}`);
            break;
          }
        } catch (err) {
          // Continue to the next selector
          continue;
        }
      }

      if (!stationItems || stationItemsCount === 0) {
        // Take a screenshot for debugging if enabled
        if (this.screenshotsEnabled) {
          await this.page.screenshot({ path: 'error-no-station-items.png' });
        }
        throw new Error('No station items found in the popup');
      }

      // Wait a moment before processing items to ensure they're fully loaded
      await this.page.waitForTimeout(500);

      // Create a list to store information about each item
      const stationItemsInfo: StationItemInfo[] = [];

      // Print details of each station item
      console.log('\n📋 Station Items Found:');
      console.log('==========================');

      try {
        for (let i = 0; i < stationItemsCount; i++) {
          const item = stationItems.nth(i);

          // Extract information about the item
          const itemInfo = await this.extractStationItemInfo(item, successfulSelector, i);

          stationItemsInfo.push(itemInfo);

          // Print the item details
          console.log(`\nStation Item #${i + 1}:`);
          const textContent = (await item.textContent()) || '[No text]';
          console.log(`Full text: ${textContent.trim()}`);
          console.log(`span.flex-none text: ${itemInfo.flexNoneText || '[Not found]'}`);
          console.log(`Item selector: ${itemInfo.itemSelector}`);
          console.log(`Text-based selector: ${itemInfo.textBasedSelector}`);
        }

        // Print the stored list of objects
        console.log('\n📋 Stored Station Items Information:');
        console.log('==========================');
        console.log(JSON.stringify(stationItemsInfo, null, 2));
      } catch (itemError) {
        console.log(
          `Warning: Error while processing station items: ${itemError instanceof Error ? itemError.message : String(itemError)}`
        );
        // Continue execution even if some items fail
      }

      console.log('\n✅ Successfully processed all station items');

      return stationItemsInfo;
    } catch (error) {
      // Take a screenshot for debugging if enabled
      if (this.page && this.screenshotsEnabled) {
        await this.page.screenshot({ path: 'error-station-items.png' });
      }
      throw new Error(
        `Failed to find and print station items: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Processes a return station to find available dates.
   * @param returnStation - The return station to process
   * @returns The updated return station with available dates
   * @throws Error if processing fails
   */
  public async processReturnStation(returnStation: StationItemInfo): Promise<StationItemInfo> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      console.log(`🔍 Processing return station: ${returnStation.flexNoneText}`);

      // Click on the return station using its selector
      await this.clickElementBySelector(
        returnStation.textBasedSelector,
        `return station ${returnStation.flexNoneText}`
      );

      // Wait a moment after clicking
      await this.page.waitForTimeout(500);

      // Locate and click on the pickup date element
      const pickupDateSelector =
        'div.search-dates > div:nth-child(1) > span.search-input--label:has-text("Abholdatum")';
      await this.clickElementBySelector(pickupDateSelector, 'pickup date element');

      // Wait for the calendar popup
      console.log('Waiting for calendar popup...');
      await this.page
        .waitForSelector('div.modal__window.md', { state: 'visible', timeout: 2000 })
        .catch(() => console.log('Calendar popup not visible with selector: div.modal__window.md'));

      // Find all calendar month elements
      console.log('Finding calendar month elements...');
      const calendarMonthSelector = 'div.calendars-month';
      const monthElements = this.page.locator(calendarMonthSelector);
      const monthCount = await monthElements.count();

      console.log(`Found ${monthCount} calendar month elements`);

      // Store available dates
      const availableDates: string[] = [];

      // Process each month element
      for (let monthIndex = 0; monthIndex < monthCount; monthIndex++) {
        const monthElement = monthElements.nth(monthIndex);

        // Extract the month name from the element
        const headerSelector = 'div.calendar__header';
        const headerElement = monthElement.locator(headerSelector);
        const monthName = (await headerElement.textContent()) || '';
        const trimmedMonthName = monthName.trim();

        console.log(`Processing month: ${trimmedMonthName}`);

        // Find all available dates for this month
        console.log(`Finding available dates for ${trimmedMonthName}...`);
        const calendarDatesSelector = 'table div.calendar__date-container:not(.is-disabled)';
        const allDates = monthElement.locator(calendarDatesSelector);
        const count = await allDates.count();

        console.log(`Found ${count} available dates for ${trimmedMonthName}`);

        // Process each date
        for (let i = 0; i < count; i++) {
          const dateElement = allDates.nth(i);

          // Get the date text
          const dateText = (await dateElement.textContent()) || '';
          const trimmedDate = dateText.trim();

          if (trimmedDate) {
            // Append the month name to the date
            const dateWithMonth = `${trimmedDate} ${trimmedMonthName}`;
            availableDates.push(dateWithMonth);
          }
        }
      }

      // Print available dates
      console.log(`\n📅 Available Dates for ${returnStation.flexNoneText}:`);
      console.log('==========================');

      if (availableDates.length === 0) {
        console.log('No available dates found.');
      } else {
        console.log(`Found ${availableDates.length} available dates:`);
        availableDates.forEach((date, index) => {
          console.log(`${index + 1}. ${date}`);
        });
      }

      // Store available dates in the return station object
      const updatedReturnStation = {
        ...returnStation,
        availableDates,
        processed: true,
      };

      // Close the date picker
      await this.clickElementBySelector(
        'div.modal__window button.modal__close',
        'date picker close button'
      );

      // Wait a moment after closing
      await this.page.waitForTimeout(300);

      // Choose return station search
      await this.clickElementBySelector(
        'span.search-input--label:has-text("Rückgabeort")',
        'return station search'
      );

      // Wait for the location popup
      await this.waitForLocationPopup();

      return updatedReturnStation;
    } catch (error) {
      console.error(
        `Error processing return station ${returnStation.flexNoneText}:`,
        error instanceof Error ? error.message : String(error)
      );

      // Mark as processed with error
      return {
        ...returnStation,
        processed: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Closes the browser and all associated resources.
   */
  public async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    } catch (error) {
      console.error(
        `Error during browser cleanup: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
