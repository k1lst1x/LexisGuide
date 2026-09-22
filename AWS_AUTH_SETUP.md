# AWS authentication, API deployment, and user storage

LexisGuide uses Amazon Cognito for email/password, Google, and Apple sign-in. API
Gateway and the API both verify Cognito ID tokens before accessing DynamoDB, where
every record is partitioned by the Cognito user ID. GitHub Pages is static: the
production API runs as FastAPI on AWS Lambda behind API Gateway.

## Deploy the infrastructure

1. Copy infra/terraform.tfvars.example to infra/terraform.tfvars.
2. Choose a globally unique Cognito domain prefix.
3. Register the Cognito callback URL `https://<cognito-domain>/oauth2/idpresponse`
   with Google and Apple. The application callback is
   `https://k1lst1x.github.io/LexisGuide/auth/callback`.
4. Add Google OAuth and Apple developer values to terraform.tfvars. Never commit this file.
5. Build the Lambda ZIP, then initialize, plan, and apply Terraform:

   ```bash
   backend/scripts/build_lambda_package.sh "$PWD/.build/lexisguide-api.zip"
   cd infra
   terraform init
   terraform plan -var="api_lambda_artifact_path=../.build/lexisguide-api.zip"
   terraform apply -var="api_lambda_artifact_path=../.build/lexisguide-api.zip"
   ```

The Terraform outputs include the API Gateway URL and all public frontend Cognito
values. The production deployment workflow writes them to GitHub
**Settings → Secrets and variables → Actions → Variables** automatically:

- `VITE_API_BASE_URL`
- `VITE_AWS_REGION`
- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_USER_POOL_CLIENT_ID`
- `VITE_COGNITO_DOMAIN`

The Pages workflow deliberately fails if these values are missing; it must never
silently publish a frontend that sends authenticated requests to GitHub Pages.

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
