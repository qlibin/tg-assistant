import { BrowserService } from './services/browser.service';

/**
 * Main function to run the browser automation script.
 * Navigates to the specified URL, handles cookie consent, identifies clickable elements,
 * and performs location finding operations.
 */
async function runBrowserAutomation(): Promise<void> {
  const browserService = new BrowserService();

  try {
    console.log('🚀 Initializing browser...');
    await browserService.initialize();

    const targetUrl = 'https://booking.roadsurfer.com/en-us/rally/?currency=EUR';
    console.log(`🌐 Navigating to ${targetUrl}...`);
    await browserService.navigateTo(targetUrl);

    console.log('🍪 Handling cookie consent...');
    await browserService.acceptCookies();

    console.log('\n📍 LOCATION FINDER AUTOMATION');
    console.log('============================');

    // Step 1: Find and click on the "Choose your location" element
    await browserService.clickElementBySelector(
      'span.search-input--label:has-text("Abhol- und Rückgabestation")',
      'Find pickup station element'
    );

    // Step 2: Wait for the location popup to appear
    await browserService.waitForLocationPopup();

    // Step 3 & 4: Find all station items and print their details
    const pickupStations = await browserService.findAndPrintStationItems();
    console.log(`\n📍 Found ${pickupStations.length} pickup stations`);

    // Step 5: Process each pickup station to find return stations
    console.log('\n📍 RETURN STATIONS FINDER');
    console.log('============================');

    // Enhance pickup stations with return stations information
    for (let i = 0; i < pickupStations.length; i++) {
      const pickupStation = pickupStations[i];
      console.log(`\n🔍 Processing pickup station #${i + 1}: ${pickupStation.flexNoneText}`);

      try {
        // Click on the pickup station using its selector
        await browserService.clickElementBySelector(
          pickupStation.textBasedSelector,
          `pickup station ${pickupStation.flexNoneText}`
        );

        // Wait a moment after clicking
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Locate and click on div.search-return
        const searchReturnSelector = 'div.search-return';
        try {
          await browserService.clickElementBySelector(
            searchReturnSelector,
            'div.search-return element'
          );
        } catch (searchReturnError) {
          console.log('Failed to click on div.search-return, trying alternative selector...');

          // Locate and click on "Rückgabeort" text in span.search-input--label as fallback
          const differentReturnSelector = 'span.search-input--label:has-text("Rückgabeort")';
          await browserService.clickElementBySelector(
            differentReturnSelector,
            '"Rückgabeort" element'
          );
        }

        // Wait for the location popup
        await browserService.waitForLocationPopup();

        // Find and collect return stations
        console.log('Finding return stations...');
        const returnStations = await browserService.findAndPrintStationItems();
        console.log(
          `Found ${returnStations.length} return stations for pickup station ${pickupStation.flexNoneText}`
        );

        // Store return stations in the pickup station object
        pickupStation.returnStations = returnStations;

        // Process each return station to find available dates
        console.log('\n📅 AVAILABLE DATES FINDER');
        console.log('============================');

        for (let j = 0; j < returnStations.length; j++) {
          console.log(
            `\n🔍 Processing return station #${j + 1}: ${returnStations[j].flexNoneText}`
          );

          try {
            // Process the return station to find available dates
            const updatedReturnStation = await browserService.processReturnStation(
              returnStations[j]
            );

            // Update the return station in the array
            returnStations[j] = updatedReturnStation;
          } catch (returnStationError) {
            console.error(
              `Error processing return station ${returnStations[j].flexNoneText}:`,
              /* istanbul ignore next */
              returnStationError instanceof Error
                ? returnStationError.message
                : String(returnStationError)
            );

            // Mark as processed with error
            returnStations[j].processed = true;
            returnStations[j].error =
              /* istanbul ignore next */
              returnStationError instanceof Error
                ? returnStationError.message
                : String(returnStationError);
          }
        }

        // Close the popup window
        console.log('Closing the popup window...');
        await browserService.clickElementBySelector(
          'div.modal__window button.modal__close',
          'modal close button'
        );

        // Wait 300ms before continuing
        await new Promise(resolve => setTimeout(resolve, 300));

        // go to the next pickup station
        await browserService.clickElementBySelector(
          'span.search-input--label:has-text("Abholort")',
          `Open pickup station element after processing ${pickupStation.flexNoneText}`
        );
        await browserService.waitForLocationPopup();
      } catch (error) {
        console.error(
          `Error processing pickup station ${pickupStation.flexNoneText}:`,
          /* istanbul ignore next */
          error instanceof Error ? error.message : String(error)
        );
        // Continue with the next pickup station
        pickupStation.returnStations = [];
        pickupStation.error =
          /* istanbul ignore next */ error instanceof Error ? error.message : String(error);
      }
    }

    // Print the enhanced pickup stations with return stations
    console.log('\n📋 Pickup Stations with Return Stations:');
    console.log('==========================');
    console.log(JSON.stringify(pickupStations, null, 2));

    console.log('\n✅ Browser automation completed successfully!');
  } catch (error) {
    console.error(
      '❌ Error during browser automation:',
      /* istanbul ignore next */
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  } finally {
    console.log('🧹 Cleaning up browser resources...');
    await browserService.close();
  }
}

// Function to handle errors when running directly
export function handleDirectExecutionError(error: unknown): void {
  console.error('💥 Fatal error:', error);
  process.exit(1);
}

// Function to check if this file is being run directly
export function isRunningDirectly(): boolean {
  return require.main === module;
}

// Run the browser automation if this file is executed directly
/* istanbul ignore next */
if (isRunningDirectly()) {
  runBrowserAutomation().catch(handleDirectExecutionError);
}

export { runBrowserAutomation };
