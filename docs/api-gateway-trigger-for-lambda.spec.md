# Add API Gateway Trigger to Existing Lambda (CDK Infrastructure)

Goal
- Extend the project’s infrastructure by adding a new trigger so that an existing Lambda is invoked by API Gateway.
- API Gateway itself is provisioned and managed externally; this project must not create or manage API Gateway resources, routes, or stages.
- All work is limited to the /infrastructure directory (AWS CDK v2 TypeScript stack).

Scope
- In-Scope:
    - CDK changes to allow an existing Lambda function to be invoked by an external API Gateway via Lambda proxy integration.
    - Permissions and configurations required on the Lambda side (e.g., resource policies) to accept invocation from the specific external API Gateway.
    - Necessary outputs/exports from the CDK stack to inform external teams of Lambda details (ARN, function name, invoke permission logical IDs).
- Out-of-Scope:
    - Creating API Gateway, methods, integrations, routes, stages, or deployments.
    - Application code changes outside /infrastructure.
    - Any IAM modifications outside the least privileges for allowing API Gateway to invoke Lambda.
    - SAM templates or Serverless Framework artifacts.

Inputs and Assumptions
- The Lambda function is already defined within the CDK app in /infrastructure.
- External API Gateway details will be provided by another system/team after deployment:
    - RestApi or HttpApi type
    - API Gateway account ID (same AWS account) and region
    - API ID and stage (for Http API), or Rest API ID and stage (for REST)
- CDK version: aws-cdk-lib v2.x, constructs v10.
- Node runtime as currently configured in the project (do not change runtime).
- The example SAM snippet is illustrative only; replicate equivalent behavior using CDK with external API Gateway integration.

Deliverables
- CDK code in /infrastructure that:
    - Adds a Lambda permission allowing invoke from API Gateway.
    - Exports stack outputs (Lambda ARN, name, and permission reference/context needed for external binding).
    - Documents how external API Gateway should be configured to integrate with this Lambda (operational notes/readme).
- No creation of API Gateway resources in this CDK app.

Technical Requirements

1) Lambda Invocation Permission
- Add aws_lambda.CfnPermission (or lambda.Function.addPermission) to allow apigateway.amazonaws.com to invoke the target Lambda.
- Use least-privilege scoping:
    - Principal: apigateway.amazonaws.com
    - Action: lambda:InvokeFunction
    - FunctionName: Lambda ARN
    - SourceArn: one of:
        - REST API: arn:aws:execute-api:{region}:{account}:{apiId}/{stage}/{method}/{resourcePath}
        - HTTP API: arn:aws:execute-api:{region}:{account}:{apiId}/{stage}/*
    - If API identifiers are not known at synth time, allow parameterization via CDK context or Stack parameters (e.g., ApiId, StageName, OptionalResourcePath, OptionalMethod). Default to blocking (no permission) when not provided.

2) Parameterization
- Provide CDK context keys and/or CloudFormation Parameters to pass:
    - apiId (string, required to enable permission)
    - stage (string)
    - method (string, default ANY)
    - resourcePath (string, default *)
    - apiType (enum: REST|HTTP; default REST)
- Construct SourceArn accordingly. If any required parameter is missing, skip adding the permission and emit a warning during synth.

3) Outputs
- Export (CfnOutput) at minimum:
    - LambdaFunctionName
    - LambdaFunctionArn
    - LambdaRegion
    - LambdaQualifier if using aliases/versions (if applicable)
- If permission is created, also output the constructed SourceArn used, to help external teams validate.

4) No API Gateway Resources
- Do not instantiate aws_apigateway.RestApi, aws_apigatewayv2.HttpApi, integrations, routes, or deployments in this stack.
- Do not add CDK constructs that implicitly create API Gateway resources.

5) IAM and Policies
- Do not broaden Lambda execution role. Invocation permission is set via Lambda resource policy (Permission).
- Ensure no wildcard principals other than apigateway.amazonaws.com and no overly broad SourceArn unless explicitly requested via parameters.

6) Environment Parity
- Use the existing Lambda runtime and architecture.
- Do not change environment variables or memory/timeouts as part of this task.

7) Validation
- cdK synth must succeed without API parameters (permission skipped with clear notice) and with parameters (permission included).
- cdk deploy succeeds and produces expected outputs.
- Confirm that generated policy includes the precise SourceArn.

Acceptance Criteria
- CDK stack in /infrastructure adds a conditional Lambda invoke permission for API Gateway based on provided parameters.
- No API Gateway resources are created by this project.
- Stack outputs include Lambda identifiers necessary for external configuration.
- Least-privilege SourceArn pattern is used and adjustable via parameters.
- Linting, formatting, build, and tests (if present for infra) pass.

Operational Notes (for external integrators)
- REST API integration ARN: arn:aws:execute-api:{region}:{account}:{apiId}/{stage}/{method}/{resourcePath}
- HTTP API integration ARN: arn:aws:execute-api:{region}:{account}:{apiId}/{stage}/*
- Configure API Gateway to use Lambda Proxy Integration pointing to the exported Lambda ARN.
- Ensure method, path, and stage used in API Gateway match the SourceArn granted in the permission; otherwise, API Gateway will receive 403.

Agent Plan

- Discover infra entry points in /infrastructure (bin/, lib/).
- Locate the Lambda construct. If alias/version is used, target the qualified ARN accordingly.
- Add a conditional block to create lambda.CfnPermission (or function.addPermission) when parameters are supplied.
- Add stack parameters or use node context to receive apiType, apiId, stage, method, resourcePath.
- Render SourceArn string per apiType and inputs.
- Add CfnOutputs for LambdaFunctionArn, LambdaFunctionName, Region, and SourceArn (if permission created).
- Update /infrastructure README with instructions:
    - How to pass parameters: cdk deploy -c apiType=REST -c apiId=abc123 -c stage=prod -c method=POST -c resourcePath=qlibin-assistant-listener
    - Or via Parameters if implemented that way.
    - How external API Gateway team should map method/path and set Lambda proxy.

Non-Goals
- Changing Lambda code or behavior.
- Adding VPC or networking changes.
- Managing secrets or environment variables beyond existing configuration.

Risks and Mitigations
- Unknown API identifiers at deploy time: make permission conditional and parameterized.
- Overly broad permissions: default to not creating permission; when created, use least-privilege SourceArn derived from inputs.
- Cross-account API Gateway: if required in future, extend parameters to accept external account ID and set SourceAccount/Principal accordingly.

Testing Strategy
- Unit (if infra tests exist): verify synthesis with and without parameters, snapshot test the generated Permission resource and SourceArn.
- Manual: deploy to a sandbox with known API ID and validate invocation via API Gateway test-invoke.

Illustrative example of AWS SAM Template snippet:
```yaml
# This AWS SAM template has been generated from your function's configuration. If
# your function has one or more triggers, note that the AWS resources associated
# with these triggers aren't fully specified in this template and include
# placeholder values. Open this template in AWS Infrastructure Composer or your
# favorite IDE and modify it to specify a serverless application with other AWS
# resources.
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: An AWS Serverless Application Model template describing your function.
Resources:
  prodQlibinAssistantBotListener:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: .
      Description: ''
      MemorySize: 128
      Timeout: 3
      Handler: index.handler
      Runtime: nodejs22.x
      Architectures:
        - arm64
      EphemeralStorage:
        Size: 512
      Environment:
        Variables:
          TELEGRAM_BOT_TOKEN: "***"
      EventInvokeConfig:
        MaximumEventAgeInSeconds: 21600
        MaximumRetryAttempts: 2
      PackageType: Zip
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - logs:CreateLogGroup
              Resource: arn:aws:logs:eu-central-1:182399716679:*
            - Effect: Allow
              Action:
                - logs:CreateLogStream
                - logs:PutLogEvents
              Resource:
                - >-
                  arn:aws:logs:eu-central-1:182399716679:log-group:/aws/lambda/prodQlibinAssistantBotListener:*
      RecursiveLoop: Terminate
      SnapStart:
        ApplyOn: None
      Events:
        Api1:
          Type: Api
          Properties:
            Path: /MyResource
            Method: ANY
        Api2:
          Type: Api
          Properties:
            Path: /qlibin-assistant-listener
            Method: POST
      RuntimeManagementConfig:
        UpdateRuntimeOn: Auto

```