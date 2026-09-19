variable "aws_region" { type = string }
variable "project_name" { type = string default = "lexisguide" }
variable "cognito_domain_prefix" { type = string }
variable "callback_urls" { type = list(string) }
variable "logout_urls" { type = list(string) }
variable "google_client_id" { type = string default = "" }
variable "google_client_secret" { type = string default = "" sensitive = true }
variable "apple_client_id" { type = string default = "" }
variable "apple_team_id" { type = string default = "" }
variable "apple_key_id" { type = string default = "" }
variable "apple_private_key" { type = string default = "" sensitive = true }
