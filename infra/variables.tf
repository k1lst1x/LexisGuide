variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "lexisguide"
}

variable "cognito_domain_prefix" {
  type = string
}

variable "callback_urls" {
  type = list(string)
  default = [
    "http://localhost:5173/auth/callback",
    "https://k1lst1x.github.io/LexisGuide/auth/callback",
  ]
}

variable "logout_urls" {
  type = list(string)
  default = [
    "http://localhost:5173",
    "https://k1lst1x.github.io/LexisGuide",
  ]
}

variable "api_lambda_artifact_path" {
  description = "Path to the ZIP created by backend/scripts/build_lambda_package.sh."
  type        = string
}

variable "agentcore_runtime_arn" {
  description = "Deployed AgentCore runtime ARN. Leave empty only for a local/stub API."
  type        = string
  default     = ""
}

variable "api_allowed_origins" {
  description = "Exact browser origins permitted to call the API with credentials."
  type        = list(string)
  default = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://k1lst1x.github.io",
  ]
}

variable "google_client_id" {
  type    = string
  default = ""
}

variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "apple_client_id" {
  type    = string
  default = ""
}

variable "apple_team_id" {
  type    = string
  default = ""
}

variable "apple_key_id" {
  type    = string
  default = ""
}

variable "apple_private_key" {
  type      = string
  default   = ""
  sensitive = true
}
