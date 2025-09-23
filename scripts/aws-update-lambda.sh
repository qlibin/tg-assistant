#!/bin/bash

aws lambda update-function-code \
  --function-name browser-lambda \
  --image-uri $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/qlibin/browser-lambda:latest
