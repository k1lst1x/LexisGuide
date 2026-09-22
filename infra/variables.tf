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
  # 5199 is the fallback port Vite picks when 5173 is taken, so local sign-in
  # works either way. CI and a local apply must list the same URLs or each
  # apply reverts the other's.
  default = [
    "http://localhost:5173/auth/callback",
    "http://localhost:5199/auth/callback",
    "https://k1lst1x.github.io/LexisGuide/auth/callback",
  ]
}

variable "logout_urls" {
  type = list(string)
  default = [
    "http://localhost:5173",
    "http://localhost:5199",
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

variable "agentcore_assistant_runtime_arn" {
  description = "Deployed LexisGuideAssistant AgentCore runtime ARN for /api/v1/chat. Empty disables live chat."
  type        = string
  default     = ""
}

variable "lawfirm_api_key_secret_arn" {
  description = "Optional Secrets Manager ARN holding the rotated lawfirm.dev key (raw string or JSON api_key field)."
  type        = string
  default     = ""
}

variable "chat_rate_limit_per_window" {
  description = "Assistant messages each user may send per 60-second window."
  type        = number
  default     = 20

  validation {
    condition     = var.chat_rate_limit_per_window >= 1 && var.chat_rate_limit_per_window <= 1000
    error_message = "chat_rate_limit_per_window must be between 1 and 1000."
  }
}

variable "statute_rate_limit_per_window" {
  description = "Maximum authenticated lawfirm.dev statute lookups per user per 60-second window."
  type        = number
  default     = 20

  validation {
    condition     = var.statute_rate_limit_per_window >= 1 && var.statute_rate_limit_per_window <= 1000
    error_message = "statute_rate_limit_per_window must be between 1 and 1000."
  }
}

variable "remote_operation_per_user_concurrency" {
  description = "Maximum concurrent AgentCore, Bedrock, or statute-provider operations per authenticated user."
  type        = number
  default     = 2

  validation {
    condition     = var.remote_operation_per_user_concurrency >= 1 && var.remote_operation_per_user_concurrency <= 8
    error_message = "remote_operation_per_user_concurrency must be between 1 and 8."
  }
}

variable "remote_operation_global_concurrency" {
  description = "Shared concurrent AgentCore, Bedrock, and statute-provider operations; keep below Lambda concurrency."
  type        = number
  default     = 8

  validation {
    condition     = var.remote_operation_global_concurrency >= 1 && var.remote_operation_global_concurrency <= 100
    error_message = "remote_operation_global_concurrency must be between 1 and 100."
  }
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

variable "review_rate_limit_per_window" {
  description = "Maximum expensive AI reviews one authenticated user can start per fixed window."
  type        = number
  default     = 10

  validation {
    condition     = var.review_rate_limit_per_window >= 1 && var.review_rate_limit_per_window <= 1000
    error_message = "review_rate_limit_per_window must be between 1 and 1000."
  }
}

variable "review_rate_limit_window_seconds" {
  description = "Length in seconds of the per-user AI review rate-limit window."
  type        = number
  default     = 60

  validation {
    condition     = var.review_rate_limit_window_seconds >= 1 && var.review_rate_limit_window_seconds <= 3600
    error_message = "review_rate_limit_window_seconds must be between 1 and 3600."
  }
}

variable "api_lambda_reserved_concurrency" {
  description = <<-EOT
    Hard cap on concurrent API Lambda executions to bound downstream AI spend.
    Use -1 for no reservation: AWS keeps 10 concurrent executions unreserved per
    account, so an account still on the default new-account limit of 10 cannot
    reserve any. There the account limit itself provides the same cap.
  EOT
  type        = number
  default     = 10

  validation {
    condition     = var.api_lambda_reserved_concurrency >= 1 || var.api_lambda_reserved_concurrency == -1
    error_message = "api_lambda_reserved_concurrency must be at least 1, or -1 for no reservation."
  }
}

variable "api_gateway_throttling_burst_limit" {
  description = "Maximum short API Gateway request burst across all routes."
  type        = number
  default     = 20

  validation {
    condition     = var.api_gateway_throttling_burst_limit >= 1
    error_message = "api_gateway_throttling_burst_limit must be at least 1."
  }
}

variable "api_gateway_throttling_rate_limit" {
  description = "Sustained API Gateway requests per second across all routes."
  type        = number
  default     = 10

  validation {
    condition     = var.api_gateway_throttling_rate_limit >= 1
    error_message = "api_gateway_throttling_rate_limit must be at least 1."
  }
}

variable "api_gateway_health_throttling_burst_limit" {
  description = "Maximum short burst allowed for the unauthenticated health-check route."
  type        = number
  default     = 5

  validation {
    condition     = var.api_gateway_health_throttling_burst_limit >= 1
    error_message = "api_gateway_health_throttling_burst_limit must be at least 1."
  }
}

variable "api_gateway_health_throttling_rate_limit" {
  description = "Sustained requests per second allowed for the unauthenticated health-check route."
  type        = number
  default     = 2

  validation {
    condition     = var.api_gateway_health_throttling_rate_limit >= 1
    error_message = "api_gateway_health_throttling_rate_limit must be at least 1."
  }
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
