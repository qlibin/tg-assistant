To include **both your TypeScript compiled code and the necessary library dependencies** inside the `lambda.zip` deployment package for AWS Lambda, you need to package your project code **along with the `node_modules` folder** containing the installed dependencies. Here’s how to do it properly:

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

### Additional tips

| Action                           | Command/Notes                                                                                      |
|---------------------------------|--------------------------------------------------------------------------------------------------|
| Compile TypeScript               | `npm run build` (outputs to `dist/`)                                                             |
| Copy `package.json` to `dist/`  | `cp package.json dist/` and `cp package-lock.json dist/` (optional but recommended)               |
| Install production dependencies  | `cd dist && npm install --production`                                                            |
| Zip deployment package           | `cd dist && zip -r ../lambda.zip .`                                                              |
| Upload to Lambda                 | Via AWS Console or CLI: `aws lambda update-function-code --function-name YourFunction --zip-file fileb://lambda.zip` |

### Alternative: Use Lambda Layers for Dependencies

If your dependencies are large or shared across multiple Lambdas, consider packaging dependencies into a **Lambda Layer** and attaching it to your function. This keeps your deployment package smaller and allows sharing dependencies.

### Summary

To include dependencies in your Lambda deployment package:

- Compile your TypeScript to JavaScript.
- Install production dependencies inside the compiled output folder.
- Zip the contents of that folder including `node_modules`.
- Upload the zip to AWS Lambda.

This approach ensures your Lambda function has all code and libraries it needs to run successfully[1][2][3].

[1] https://stackoverflow.com/questions/34437900/how-to-load-npm-modules-in-aws-lambda
[2] https://docs.aws.amazon.com/lambda/latest/dg/nodejs-package.html
[3] https://github.com/aws-samples/aws-cdk-examples/issues/110
[4] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_79a4083f-8517-4a1f-aad0-39a28e5b525c/1bef9e44-ced7-4cec-bcc0-327ea8b4489f/tsconfig.json
[5] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_79a4083f-8517-4a1f-aad0-39a28e5b525c/a51a88f6-2971-4db4-b699-027baebe96ae/tsconfig.eslint.json
[6] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_79a4083f-8517-4a1f-aad0-39a28e5b525c/0e10efe3-26dc-4446-a31f-625c4fabfab5/README.md
[7] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_79a4083f-8517-4a1f-aad0-39a28e5b525c/5d484551-31f9-4006-a6a7-280db14de672/package.json
[8] https://www.reddit.com/r/aws/comments/11zjqd3/using_node_modules_in_lambda_layer/
[9] https://blog.mikaeels.com/how-to-use-npm-modules-in-aws-lambda
[10] https://www.youtube.com/watch?v=j4iyfbwARkk
[11] https://stackoverflow.com/questions/67410874/how-to-bundle-python-lambdas-with-shared-files-and-different-dependencies
[12] https://blog.thewiz.net/cleanup-the-nodemodules-for-a-lighter-lambda-function
[13] https://docs.aws.amazon.com/lambda/latest/dg/python-package.html
[14] https://dev.to/aws-builders/installing-python-dependencies-in-aws-lambda-easy-pip-guide-31o6
[15] https://www.youtube.com/watch?v=XydK2g4zQ9E
[16] https://www.serverless.com/blog/handling-aws-lambda-python-dependencies
[17] https://www.codejam.info/2021/04/bundle-lambda-function-with-private-dependencies-using-cdk.html
[18] https://github.com/serverless/serverless/issues/2086
[19] https://docs.aws.amazon.com/lambda/latest/dg/configuration-function-zip.html
[20] https://docs.aws.amazon.com/lambda/latest/dg/nodejs-layers.html
[21] https://www.reddit.com/r/aws/comments/93jhgi/how_can_i_add_third_party_python_dependencies_to/
[22] https://docs.aws.amazon.com/lambda/latest/dg/chapter-layers.html
[23] https://repost.aws/questions/QUQtbL0Id2S1iQqTdz0XjR1A/how-to-deploy-dependencies-package-for-lambda-function-using-cdk