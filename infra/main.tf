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
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

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
  name                = "${var.project_name}-users"
  username_attributes = ["email"]
  # Do not require an email confirmation code during sign-up. Social sign-in
  # providers still establish a verified email through Cognito federation.
  # Password-reset codes remain enabled by the recovery configuration below.
  auto_verified_attributes = []

  # Clearing the list above only stops the email being sent. Without this
  # trigger a new account stays UNCONFIRMED and can never sign in.
  lambda_config {
    pre_sign_up = aws_lambda_function.pre_signup.arn
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

  lifecycle {
    # Cognito fixes a pool's schema at creation: standard attributes cannot be
    # added or changed later, and an update attempt is rejected as an unsupported
    # required custom attribute. Apply the schema on create, then leave it alone.
    ignore_changes = [schema]
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

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${var.project_name}-web"
  user_pool_id                         = aws_cognito_user_pool.main.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = concat(["COGNITO"], var.google_client_id == "" ? [] : ["Google"])
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]
  depends_on = [aws_cognito_identity_provider.google]
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

  # The system inference profile is account-scoped, while it may route to
  # supported AWS foundation models. Keep both resource classes explicit.
  dynamic "statement" {
    for_each = var.bedrock_model_id == "" ? [] : [var.bedrock_model_id]
    content {
      sid = "InvokeLexisGuideBedrockModel"
      actions = [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
      ]
      resources = [
        "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/${statement.value}",
        "arn:aws:bedrock:${var.aws_region}::foundation-model/*",
      ]
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

  dynamic "statement" {
    for_each = var.lawfirm_api_key_secret_arn == "" ? [] : [var.lawfirm_api_key_secret_arn]
    content {
      sid       = "ReadLawFirmApiKey"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [statement.value]
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
      COGNITO_USER_POOL_ID                  = aws_cognito_user_pool.main.id
      COGNITO_USER_POOL_CLIENT_ID           = aws_cognito_user_pool_client.web.id
      USER_DATA_TABLE                       = aws_dynamodb_table.user_data.name
      AGENTCORE_RUNTIME_ARN                 = var.agentcore_runtime_arn
      AGENTCORE_ASSISTANT_RUNTIME_ARN       = var.agentcore_assistant_runtime_arn
      BEDROCK_MODEL_ID                      = var.bedrock_model_id
      ASSISTANT_MODEL_ID                    = var.bedrock_model_id
      CHAT_RATE_LIMIT_PER_WINDOW            = var.chat_rate_limit_per_window
      STATUTE_RATE_LIMIT_PER_WINDOW         = var.statute_rate_limit_per_window
      REMOTE_OPERATION_PER_USER_CONCURRENCY = var.remote_operation_per_user_concurrency
      REMOTE_OPERATION_GLOBAL_CONCURRENCY   = var.remote_operation_global_concurrency
      CORS_ALLOW_ORIGINS                    = join(",", var.api_allowed_origins)
      REVIEW_RATE_LIMIT_PER_WINDOW          = var.review_rate_limit_per_window
      REVIEW_RATE_LIMIT_WINDOW_SECONDS      = var.review_rate_limit_window_seconds
      LAWFIRM_API_KEY_SECRET_ARN            = var.lawfirm_api_key_secret_arn
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.api_lambda,
    aws_iam_role_policy.api_lambda,
  ]

  lifecycle {
    precondition {
      condition     = var.api_lambda_reserved_concurrency == -1 || var.remote_operation_global_concurrency < var.api_lambda_reserved_concurrency
      error_message = "remote_operation_global_concurrency must stay below api_lambda_reserved_concurrency so ordinary API requests retain capacity."
    }
  }
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

  # route_settings names a route by key, which Terraform cannot see as a
  # dependency, so the stage must wait for the routes to exist.
  depends_on = [
    aws_apigatewayv2_route.api,
    aws_apigatewayv2_route.health,
  ]
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

# ── Sign-up confirmation trigger ─────────────────────────────────────────────
data "archive_file" "pre_signup" {
  type        = "zip"
  source_file = "${path.module}/lambda/pre_signup.py"
  output_path = "${path.module}/.build/pre_signup.zip"
}

data "aws_iam_policy_document" "pre_signup_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "pre_signup" {
  name               = "${var.project_name}-pre-signup"
  assume_role_policy = data.aws_iam_policy_document.pre_signup_assume_role.json
}

resource "aws_cloudwatch_log_group" "pre_signup" {
  name              = "/aws/lambda/${var.project_name}-pre-signup"
  retention_in_days = 30
}

data "aws_iam_policy_document" "pre_signup" {
  statement {
    sid       = "WriteTriggerLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.pre_signup.arn}:*"]
  }
}

resource "aws_iam_role_policy" "pre_signup" {
  name   = "${var.project_name}-pre-signup"
  role   = aws_iam_role.pre_signup.id
  policy = data.aws_iam_policy_document.pre_signup.json
}

resource "aws_lambda_function" "pre_signup" {
  function_name    = "${var.project_name}-pre-signup"
  role             = aws_iam_role.pre_signup.arn
  runtime          = "python3.12"
  handler          = "pre_signup.handler"
  filename         = data.archive_file.pre_signup.output_path
  source_code_hash = data.archive_file.pre_signup.output_base64sha256
  architectures    = ["x86_64"]
  memory_size      = 128
  timeout          = 5

  depends_on = [
    aws_cloudwatch_log_group.pre_signup,
    aws_iam_role_policy.pre_signup,
  ]
}

resource "aws_lambda_permission" "pre_signup" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_signup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
