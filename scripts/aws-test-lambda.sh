#!/bin/bash

aws lambda invoke \
   --function-name browser-lambda \
   --cli-binary-format raw-in-base64-out \
   --payload '{"key1":"value1"}' \
   response.json
