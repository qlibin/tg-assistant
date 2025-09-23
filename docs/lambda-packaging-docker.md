# AWS Lambda Packaging Options

This document outlines two methods for packaging and deploying your AWS Lambda function:
1. Traditional ZIP file packaging (original method)
2. Docker container image packaging (recommended for browser automation)

## Method 1: ZIP File Packaging

To include **both your TypeScript compiled code and the necessary library dependencies** inside the `lambda.zip` deployment package for AWS Lambda, you need to package your project code **along with the `node_modules` folder** containing the installed dependencies. Here's how to do it properly:

### Step-by-step process to include dependencies in `lambda.zip`

1. **Compile your TypeScript code** into JavaScript (e.g., into `dist/`):
   ```bash
   npm run build
   ```
   This produces your compiled Lambda handler and related files in `dist/`.

2. **Install production dependencies inside the output directory** (or copy them there):

    - One common approach is to run `npm install --production` in the folder where your compiled code resides, so only runtime dependencies are included:
      ```bash
      cd dist
      npm install --production
      ```
    - Alternatively, you can copy your `package.json` and `package-lock.json` to `dist/` and run the above command there.

3. **Package the contents of the `dist/` folder including `node_modules`** into a zip file:

    - Make sure you zip the **contents** of `dist/`, not the folder itself:
      ```bash
      cd dist
      zip -r ../lambda.zip .
      ```
   This zip now contains:
    - Your compiled JavaScript files (e.g., `index.js`)
    - The `node_modules` folder with all necessary libraries

4. **Upload the `lambda.zip`** file to AWS Lambda via AWS Console, CLI, or infrastructure-as-code tools.

### Why this works

- AWS Lambda expects your deployment package to contain your code **and** all dependencies your code requires in `node_modules`, because the Lambda runtime does not install dependencies for you.
- By installing dependencies inside your deployment folder (`dist/`), you ensure the Lambda environment finds all required libraries at runtime.
- Zipping only the contents of the folder (not the folder itself) ensures the Lambda handler file is at the root level of the zip, which Lambda requires.

### Additional tips for ZIP packaging

| Action                           | Command/Notes                                                                                      |
|---------------------------------|--------------------------------------------------------------------------------------------------|
| Compile TypeScript               | `npm run build` (outputs to `dist/`)                                                             |
| Copy `package.json` to `dist/`  | `cp package.json dist/` and `cp package-lock.json dist/` (optional but recommended)               |
| Install production dependencies  | `cd dist && npm install --production`                                                            |
| Zip deployment package           | `cd dist && zip -r ../lambda.zip .`                                                              |
| Upload to Lambda                 | Via AWS Console or CLI: `aws lambda update-function-code --function-name YourFunction --zip-file fileb://lambda.zip` |

### Limitations of ZIP packaging

When using browser automation libraries like Playwright, the ZIP packaging method has significant limitations:
- Browser binaries are not included in the package
- The Lambda environment doesn't have the necessary browser executables
- This leads to errors like: `Failed to initialize browser: Executable doesn't exist at /home/sbx_user1051/.cache/ms-playwright/chromium_headless_shell-1179/chrome-linux/headless_shell`

## Method 2: Docker Container Image (Recommended for Browser Automation)

For browser automation with Playwright, using a Docker container image is the recommended approach. This method packages your code along with all necessary browser binaries and dependencies.

### Step-by-step process for Docker container image packaging

1. **Ensure Docker is installed** on your development machine.

2. **Compile TypeScript and prepare the dist directory**:
   ```bash
   npm run dist
   ```
   This command:
   - Compiles TypeScript code to JavaScript in the dist directory
   - Copies package.json and package-lock.json to the dist directory
   - Installs production dependencies in the dist directory

3. **Build the Docker image** using the provided Dockerfile:
   ```bash
   npm run package:docker
   ```
   This command automatically runs the `dist` script first and then builds a Docker image with:
   - The Playwright browser binaries
   - Your pre-compiled JavaScript files from the dist directory
   - All necessary dependencies
   - AWS Lambda Runtime Interface Client

4. **Test the Docker image locally** using the Lambda Runtime Interface Emulator:
   ```bash
   npm run package:docker:run
   ```
   This starts a local container that simulates the AWS Lambda environment.

5. **Test the function invocation** with a sample event:
   ```bash
   npm run package:docker:test
   ```
   This sends a test event to the local Lambda container.

6. **Push the Docker image** to Amazon ECR (Elastic Container Registry):
   ```bash
   # Set your AWS account ID and region
   export AWS_ACCOUNT_ID=12345678991311
   export AWS_REGION=eu-central-1
   export AWS_PROFILE=my-profile
   
   # Push the image
   npm run package:docker:push
   ```

7. **Create or update your Lambda function** to use the container image:
   - In the AWS Console, create a new Lambda function or update an existing one
   - Choose "Container image" as the deployment package type
   - Select the image from your ECR repository

### Why Docker container images work better for browser automation

- The container includes the complete browser binaries and all dependencies
- The Playwright base image already has the browser installed and configured
- The container environment is consistent between local development and AWS
- No need to worry about missing executables or compatibility issues

### Additional tips for Docker container images

| Action                           | Command/Notes                                                                                      |
|---------------------------------|--------------------------------------------------------------------------------------------------|
| Prepare dist directory           | `npm run dist` (automatically run by `package:docker`)                                           |
| Build Docker image               | `npm run package:docker` (runs `dist` script first, then builds Docker image)                    |
| Run locally                      | `npm run package:docker:run`                                                                     |
| Test function                    | `npm run package:docker:test`                                                                    |
| Push to ECR                      | `npm run package:docker:push`                                                                    |
| Create ECR repository            | `aws ecr create-repository --repository-name browser-lambda --region $AWS_REGION`                |

## Summary

For browser automation with Playwright in AWS Lambda:

- **Recommended approach**: Use Docker container images
  - Includes all browser binaries and dependencies
  - Provides a consistent environment
  - Eliminates browser executable errors
  - Supports larger deployment packages (up to 10GB)

- **Alternative approach**: Use ZIP packaging with Lambda Layers
  - More complex to set up
  - Requires separate management of browser binaries
  - Limited to 250MB total package size (including layers)

Choose the approach that best fits your project requirements and deployment workflow.

## References

[1] https://docs.aws.amazon.com/lambda/latest/dg/nodejs-package.html
[2] https://docs.aws.amazon.com/lambda/latest/dg/images-create.html
[3] https://docs.aws.amazon.com/lambda/latest/dg/nodejs-image.html
[4] https://docs.aws.amazon.com/lambda/latest/dg/images-test.html
[5] https://github.com/aws/aws-lambda-runtime-interface-emulator