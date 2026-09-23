# AWS authentication, API deployment, and user storage

LexisGuide uses Amazon Cognito for email/password and Google sign-in. API
Gateway and the API both verify Cognito ID tokens before accessing DynamoDB, where
every record is partitioned by the Cognito user ID. GitHub Pages is static: the
production API runs as FastAPI on AWS Lambda behind API Gateway.

## Deploy the infrastructure

1. Copy infra/terraform.tfvars.example to infra/terraform.tfvars.
2. Choose a globally unique Cognito domain prefix.
3. Register the Cognito callback URL `https://<cognito-domain>/oauth2/idpresponse`
   with Google. The application callback is
   `https://k1lst1x.github.io/LexisGuide/auth/callback`.
4. Add the Google OAuth values to terraform.tfvars. Never commit this file.
   The deploy workflow holds them as `GOOGLE_CLIENT_ID` and the
   `GOOGLE_CLIENT_SECRET` secret. Applying locally without them plans to destroy
   the deployed Google provider, so either copy the values in or let the
   workflow apply.
5. If enabling statute lookup, rotate the lawfirm.dev key first, then store the replacement
   in Secrets Manager. Use the resulting ARN—not the key—in terraform.tfvars:

   ```bash
   aws secretsmanager create-secret \
     --name lexisguide/lawfirm-api-key \
     --secret-string 'REPLACEMENT_KEY'
   ```

   ```hcl
   lawfirm_api_key_secret_arn = "arn:aws:secretsmanager:REGION:ACCOUNT:secret:lexisguide/lawfirm-api-key-..."
   ```

   The API Lambda receives permission to read that secret at runtime. Do not add the
   provider key to GitHub variables, frontend `.env` files, or Terraform variables.
6. Build the Lambda ZIP, then initialize, plan, and apply Terraform:

   ```bash
   backend/scripts/build_lambda_package.sh "$PWD/.build/lexisguide-api.zip"
   cd infra
   terraform init
   terraform plan -var="api_lambda_artifact_path=../.build/lexisguide-api.zip"
   terraform apply -var="api_lambda_artifact_path=../.build/lexisguide-api.zip"
   ```

The Terraform outputs include the API Gateway URL and all public frontend Cognito
values. After each apply, the production deployment workflow hands them to the
Pages workflow as dispatch inputs, so a freshly applied stack publishes with its
own values. Keep the same values in GitHub
**Settings → Secrets and variables → Actions → Variables**, which is what a Pages
run started on its own uses:

- `VITE_API_BASE_URL`
- `VITE_AWS_REGION`
- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_USER_POOL_CLIENT_ID`
- `VITE_COGNITO_DOMAIN`

The Pages workflow deliberately fails if these values are missing; it must never
silently publish a frontend that sends authenticated requests to GitHub Pages.

The deployment workflow cannot write those variables itself: `GITHUB_TOKEN` has
no access to the Actions variables API, and that is not worth storing a
long-lived admin PAT for. Update them by hand when the stack is recreated.

## Automated deployment from GitHub Actions

`Deploy production API` packages the backend as a Lambda ZIP and applies Terraform.
Before its first run, create an encrypted S3 bucket for Terraform state and set these
GitHub Actions variables:

- `TF_STATE_BUCKET` — the state bucket name;
- `COGNITO_DOMAIN_PREFIX` — globally unique Cognito hosted-UI prefix;
- `AWS_REGION` — normally `us-east-1`;
- `AGENTCORE_RUNTIME_ARN` — the ARN produced by the AgentCore deployment;
- `AGENTCORE_ASSISTANT_RUNTIME_ARN` — the ARN of the assistant runtime behind `/api/v1/chat`;
- `API_LAMBDA_RESERVED_CONCURRENCY` — only on an account that cannot reserve
  concurrency, set to `-1`. AWS keeps 10 concurrent executions unreserved per
  account, so an account still on the default limit of 10 has nothing left to
  reserve and every apply fails until this is set. Leave it unset otherwise.

Create an AWS IAM role trusted by GitHub Actions OIDC for repository
`k1lst1x/LexisGuide` on the `main` branch. Store its ARN as the
`AWS_DEPLOY_ROLE_ARN` Actions secret. Grant that role only the Terraform-managed
resources required to deploy Cognito, DynamoDB, Lambda, API Gateway, CloudWatch,
and the state bucket; do not use long-lived AWS access keys.

The deployed role is `lexisguide-github-deploy`. Its trust policy admits only
`repo:k1lst1x/LexisGuide:ref:refs/heads/main` with audience `sts.amazonaws.com`,
so no other repository, branch, or fork can assume it. Its permissions cover the
state bucket, the five project services, and IAM only on roles named
`lexisguide-*`. That IAM scope is deliberately narrow but not a privilege
boundary: anything able to edit the deploy workflow on `main` can write an inline
policy onto a `lexisguide-*` role. Treat push access to `main` as equivalent to
that role's access, and add a permissions boundary before this account holds
anything sensitive.

After a successful API deployment, the workflow triggers **Deploy landing page**
with the new values. Later backend and infrastructure changes deploy automatically
on `main`.

## Runtime configuration

Frontend needs the public VITE values from frontend/.env.example. The production
values are repository variables, not secrets: a browser must receive them.

Backend needs AWS_REGION, COGNITO_USER_POOL_ID, COGNITO_USER_POOL_CLIENT_ID, and USER_DATA_TABLE.

Use the Terraform-created IAM role for the deployed API. It is limited to the
DynamoDB table and the configured AgentCore runtime. Never put AWS access keys in
the frontend.

## Sign-up without a verification code

Sign-up takes an email and a password and goes straight into the workspace. No
code is emailed.

Two pieces make that work, and both are required. `auto_verified_attributes` is
empty, which stops Cognito sending a code; on its own that leaves every new
account UNCONFIRMED and unable to sign in. The `lexisguide-pre-signup` Lambda,
wired to the pool's pre-sign-up trigger, is what confirms the account and marks
the email verified so password reset still works.

The trade-off: nobody proves they own the address they sign up with. Someone can
register with another person's email, which both denies that person the address
and sends later reset mail to an inbox the account holder may not control. To
require proof again, restore `auto_verified_attributes = ["email"]` with the
verification message template and remove the trigger.

Accounts created before the trigger existed are still UNCONFIRMED and cannot be
fixed from the browser, because no code can be sent. Confirm them with
`aws cognito-idp admin-confirm-sign-up`.
