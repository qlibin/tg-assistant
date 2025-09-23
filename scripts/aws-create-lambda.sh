#!/bin/bash

set -eu

aws iam create-role \
  --role-name lambda-container-role \
  --assume-role-policy-document file://lambda_role_policy.json

aws iam attach-role-policy \
  --role-name lambda-container-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam put-role-policy \
  --role-name lambda-container-role \
  --policy-name lambda-container-policy \
  --policy-document file://resource_policy.json

aws lambda create-function \
  --function-name browser-lambda \
  --package-type Image \
  --code ImageUri=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/qlibin/browser-lambda:latest \
  --role arn:aws:iam::$AWS_ACCOUNT_ID:role/lambda-container-role \
  --memory-size 1024 \
  --timeout 300 \
  --environment "Variables={NODE_ENV=production}" \
  --architectures arm64
