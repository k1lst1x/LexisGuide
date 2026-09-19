# AWS authentication and user storage

LexisGuide uses Amazon Cognito for email/password, Google, and Apple sign-in. The API verifies Cognito ID tokens before accessing DynamoDB, where every record is partitioned by the Cognito user ID.

## Deploy the infrastructure

1. Copy infra/terraform.tfvars.example to infra/terraform.tfvars.
2. Choose a globally unique Cognito domain prefix.
3. Register the Cognito callback URL https://<cognito-domain>/oauth2/idpresponse with Google and Apple, along with your app callback such as https://your-domain.com/auth/callback.
4. Add Google OAuth and Apple developer values to terraform.tfvars. Never commit this file.
5. From infra/, run Terraform init, Terraform plan, and Terraform apply.

Terraform outputs the frontend environment values and backend environment values.

## Runtime configuration

Frontend needs the public VITE values from frontend/.env.example.

Backend needs AWS_REGION, COGNITO_USER_POOL_ID, COGNITO_USER_POOL_CLIENT_ID, and USER_DATA_TABLE.

Use an IAM role for the deployed API with access limited to this DynamoDB table. Never put AWS access keys in the frontend.
