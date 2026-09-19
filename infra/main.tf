terraform {
  required_version = ">= 1.6.0"
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
  name         = "\${var.project_name}-user-data"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute { name = "PK" type = "S" }
  attribute { name = "SK" type = "S" }
  point_in_time_recovery { enabled = true }
  server_side_encryption { enabled = true }
}

resource "aws_cognito_user_pool" "main" {
  name                     = "\${var.project_name}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

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
  name                                 = "\${var.project_name}-web"
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

output "cognito_user_pool_id" { value = aws_cognito_user_pool.main.id }
output "cognito_user_pool_client_id" { value = aws_cognito_user_pool_client.web.id }
output "cognito_domain" { value = aws_cognito_user_pool_domain.main.domain }
output "user_data_table_name" { value = aws_dynamodb_table.user_data.name }
