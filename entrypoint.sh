#!/bin/bash
if [ -z "${AWS_LAMBDA_RUNTIME_API}" ]; then
    # If running locally, use the Lambda Runtime Interface Emulator
    exec /usr/bin/aws-lambda-rie /usr/bin/npx aws-lambda-ric $1
else
    # If running in AWS Lambda, use the Lambda Runtime Interface Client directly
    export PLAYWRIGHT_SCREENSHOTS_ENABLED=false
    exec /usr/bin/npx aws-lambda-ric $1
fi