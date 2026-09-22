terraform {
  required_version = ">= 1.6.0"

  # Deployment uses an S3 backend configured at `terraform init` time. Keeping
  # credentials and the bucket name out of source lets local validation use
  # `terraform init -backend=false`.
  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_dynamodb_table" "user_data" {
  name         = "${var.project_name}-user-data"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery { enabled = true }
  server_side_encryption { enabled = true }
}

resource "aws_cognito_user_pool" "main" {
  name                     = "${var.project_name}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Email the verification code at sign-up, and recover accounts by email.
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your LexisGuide verification code"
    email_message        = "Your LexisGuide verification code is {####}"
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  schema {
    attribute_data_type = "String"
    name                = "email"
    required            = true
    mutable             = true
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_identity_provider" "google" {
  count         = var.google_client_id == "" ? 0 : 1
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"
  provider_details = {
    authorize_scopes = "openid email profile"
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
  }
  attribute_mapping = { email = "email", username = "sub" }
}

resource "aws_cognito_identity_provider" "apple" {
  count         = var.apple_client_id == "" ? 0 : 1
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "SignInWithApple"
  provider_type = "SignInWithApple"
  provider_details = {
    authorize_scopes = "email name"
    client_id        = var.apple_client_id
    team_id          = var.apple_team_id
    key_id           = var.apple_key_id
    private_key      = var.apple_private_key
  }
  attribute_mapping = { email = "email", username = "sub" }
}

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${var.project_name}-web"
  user_pool_id                         = aws_cognito_user_pool.main.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = concat(["COGNITO"], var.google_client_id == "" ? [] : ["Google"], var.apple_client_id == "" ? [] : ["SignInWithApple"])
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]
  depends_on = [aws_cognito_identity_provider.google, aws_cognito_identity_provider.apple]
}

data "aws_iam_policy_document" "api_lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api_lambda" {
  name               = "${var.project_name}-api-lambda"
  assume_role_policy = data.aws_iam_policy_document.api_lambda_assume_role.json
}

resource "aws_cloudwatch_log_group" "api_lambda" {
  name              = "/aws/lambda/${var.project_name}-api"
  retention_in_days = 30
}

data "aws_iam_policy_document" "api_lambda" {
  statement {
    sid = "WriteApplicationLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.api_lambda.arn}:*"]
  }

  statement {
    sid = "AccessOwnUserRecords"
    actions = [
      "dynamodb:DeleteItem",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:UpdateItem",
    ]
    resources = [aws_dynamodb_table.user_data.arn]
  }

  dynamic "statement" {
    for_each = var.agentcore_runtime_arn == "" ? [] : [var.agentcore_runtime_arn]
    content {
      sid       = "InvokeLexisGuideAgent"
      actions   = ["bedrock-agentcore:InvokeAgentRuntime"]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = var.agentcore_assistant_runtime_arn == "" ? [] : [var.agentcore_assistant_runtime_arn]
    content {
      sid       = "InvokeLexisGuideAssistant"
      actions   = ["bedrock-agentcore:InvokeAgentRuntime"]
      resources = [statement.value, "${statement.value}/*"]
    }
  }
}

resource "aws_iam_role_policy" "api_lambda" {
  name   = "${var.project_name}-api-runtime"
  role   = aws_iam_role.api_lambda.id
  policy = data.aws_iam_policy_document.api_lambda.json
}

resource "aws_lambda_function" "api" {
  function_name                  = "${var.project_name}-api"
  role                           = aws_iam_role.api_lambda.arn
  runtime                        = "python3.12"
  handler                        = "app.lambda_handler.handler"
  filename                       = var.api_lambda_artifact_path
  source_code_hash               = filebase64sha256(var.api_lambda_artifact_path)
  architectures                  = ["x86_64"]
  memory_size                    = 1024
  timeout                        = 29
  reserved_concurrent_executions = var.api_lambda_reserved_concurrency

  environment {
    variables = {
      COGNITO_USER_POOL_ID             = aws_cognito_user_pool.main.id
      COGNITO_USER_POOL_CLIENT_ID      = aws_cognito_user_pool_client.web.id
      USER_DATA_TABLE                  = aws_dynamodb_table.user_data.name
      AGENTCORE_RUNTIME_ARN            = var.agentcore_runtime_arn
      AGENTCORE_ASSISTANT_RUNTIME_ARN  = var.agentcore_assistant_runtime_arn
      CHAT_RATE_LIMIT_PER_WINDOW       = var.chat_rate_limit_per_window
      CORS_ALLOW_ORIGINS               = join(",", var.api_allowed_origins)
      REVIEW_RATE_LIMIT_PER_WINDOW     = var.review_rate_limit_per_window
      REVIEW_RATE_LIMIT_WINDOW_SECONDS = var.review_rate_limit_window_seconds
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.api_lambda,
    aws_iam_role_policy.api_lambda,
  ]
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project_name}-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = true
    allow_headers     = ["Authorization", "Content-Type"]
    allow_methods     = ["GET", "POST", "PUT", "OPTIONS"]
    allow_origins     = var.api_allowed_origins
    max_age           = 86400
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.api.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.project_name}-cognito"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

resource "aws_apigatewayv2_route" "api" {
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "$default"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# Health remains public for uptime checks. All application routes pass through
# Cognito at the gateway, and FastAPI validates the ID token again in depth.
resource "aws_apigatewayv2_route" "health" {
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "GET /api/v1/health"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "NONE"
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-http-api"
  retention_in_days = 30
}

resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = var.api_gateway_throttling_burst_limit
    throttling_rate_limit  = var.api_gateway_throttling_rate_limit
  }

  # Keep public uptime probes from consuming the protected API's route budget.
  # This does not change the endpoint, integration, or Cognito protection on
  # application routes; it gives only the intentional public route its own cap.
  route_settings {
    route_key              = "GET /api/v1/health"
    throttling_burst_limit = var.api_gateway_health_throttling_burst_limit
    throttling_rate_limit  = var.api_gateway_health_throttling_rate_limit
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip        = "$context.identity.sourceIp"
      method    = "$context.httpMethod"
      path      = "$context.path"
      status    = "$context.status"
      latency   = "$context.responseLatency"
      userAgent = "$context.identity.userAgent"
    })
  }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

output "cognito_user_pool_id" { value = aws_cognito_user_pool.main.id }
output "cognito_user_pool_client_id" { value = aws_cognito_user_pool_client.web.id }
output "cognito_domain" {
  value = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}
output "user_data_table_name" { value = aws_dynamodb_table.user_data.name }
output "api_base_url" { value = aws_apigatewayv2_api.api.api_endpoint }
