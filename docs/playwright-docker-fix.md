# Playwright in Docker Container Fix

## Issue

When running the Docker container with `npm run package:docker:test`, the following error was encountered:

```
ERROR   ❌ Error during browser automation: Failed to initialize browser: browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-1179/chrome-linux/headless_shell
```

This error occurs because the Playwright browser executable could not be found at the expected location within the Docker container.

## Root Cause

The issue was caused by the way Playwright browsers were being installed in the Docker container:

1. We were using the official Playwright Docker image (`mcr.microsoft.com/playwright:focal`) as the base image, which already includes the necessary dependencies for running browsers.

2. We were installing Playwright as a dependency with `npm install --production --ignore-scripts`, but the `--ignore-scripts` flag prevents the post-install scripts from running. These post-install scripts are responsible for downloading and installing the browser binaries.

3. As a result, our Playwright installation was looking for the browser in a location where it wasn't installed.

## Solution

The solution was to explicitly install the Chromium browser for Playwright after installing the dependencies:

```dockerfile
# Install Playwright browsers
RUN npx playwright install chromium
```

This command downloads and installs the Chromium browser in the location that our Playwright installation expects, resolving the error.

## Implementation Details

1. Modified the Dockerfile to add the explicit installation of Chromium:

```dockerfile
# Install production dependencies
RUN npm install --production --ignore-scripts

# Copy pre-compiled JavaScript files from dist directory
COPY dist/ ${FUNCTION_DIR}/dist/

# Install AWS Lambda Runtime Interface Client
RUN npm install aws-lambda-ric

# Install Playwright browsers
RUN npx playwright install chromium
```

2. No changes were needed to the browser.service.ts file, as it was already configured correctly for a containerized environment:

```typescript
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
```

## Recommendations for Future Maintenance

1. **Keep Playwright Version in Sync**: Ensure that the version of Playwright installed in the Docker container matches the version specified in package.json. If you update the Playwright version in package.json, you may need to rebuild the Docker image.

2. **Consider Using Playwright's Official Docker Images**: Playwright provides official Docker images that already have the browsers installed. Using these images can simplify the setup process. See the [Playwright Docker documentation](https://playwright.dev/docs/docker) for more information.

3. **Monitor Browser Updates**: Playwright regularly updates its browser versions. If you encounter issues with browser compatibility, you may need to update the Playwright version and rebuild the Docker image.

4. **Test Docker Container Locally**: Always test the Docker container locally before deploying to AWS Lambda to ensure that the browser automation works correctly.

5. **Optimize Docker Image Size**: Consider using multi-stage builds or other techniques to reduce the size of the Docker image, as browser binaries can be quite large.

## References

- [Playwright Docker Documentation](https://playwright.dev/docs/docker)
- [AWS Lambda Container Images](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)
- [Playwright Installation Guide](https://playwright.dev/docs/installation)