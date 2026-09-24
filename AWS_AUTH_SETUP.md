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
   The Cognito domain includes the prefix and region, so a new stack (another
   account, region, or `COGNITO_DOMAIN_PREFIX`) has a new callback URL. Add it
   to the Google client's **Authorized redirect URIs** before switching the
   site over, or Google rejects every sign-in with `redirect_uri_mismatch`.
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

## Password sign-up email verification

Password sign-up sends a Cognito verification code. The browser asks for that
code before it signs the person in, so an account's verified email claim means
the account holder proved control of the mailbox.

`auto_verified_attributes = ["email"]` is the enforcement point. Do not add a
pre-sign-up Lambda that sets `autoConfirmUser` or `autoVerifyEmail`: it would
let an attacker register another person's address and block the real owner.
Federated sign-in continues to use the identity provider's verified-email claim.

## Admin portal

Admins manage accounts, shared workspaces, and bar verifications at `/admin`
(https://k1lst1x.github.io/LexisGuide/admin in production). It has its own
sign-in screen and uses the same Cognito accounts as the app.

An admin is any account in the Cognito `admins` group, which Terraform creates.
The API reads the group from the ID token and then confirms it with Cognito on
every admin request, so removing someone from the group or disabling them takes
effect immediately rather than when their token expires. Every change made in
the portal is written to an audit log (kept for a year) with the admin who made
it. An admin cannot disable, delete, or demote their own account; another admin
must.

### Adding the first admin

Nobody is in the group after the first apply. Add yourself with the AWS CLI;
after that, admins can grant access to others from the portal.

For an existing email-and-password account, the email works as the username:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <cognito_user_pool_id> \
  --username you@example.com \
  --group-name admins
```

A Google account's username is `Google_<id>`, not the email. Look it up first:

```bash
aws cognito-idp list-users --user-pool-id <cognito_user_pool_id> \
  --filter 'email = "you@gmail.com"' --query 'Users[].Username'
```

To create a new admin account instead, issue a temporary password; the portal
asks for a new one on first sign-in:

```bash
aws cognito-idp admin-create-user --user-pool-id <cognito_user_pool_id> \
  --username admin@example.com --temporary-password '<Temp-Passw0rd!>' \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
aws cognito-idp admin-add-user-to-group --user-pool-id <cognito_user_pool_id> \
  --username admin@example.com --group-name admins
```

Someone already signed in when they were added only gets the group claim with a
fresh token; the portal refreshes it once automatically, and signing out and in
again always works.

### What admins can do

- **Accounts:** search by email; enable or disable; sign out everywhere; grant or
  remove admin access; delete an account together with its documents,
  conversations, bar verification, and any workspace it hosts.
- **Bar verification:** reset a locked verification so the person gets their
  attempts back, or record a bar membership checked by hand, with a note for the
  audit log.
- **Workspaces:** list every workspace with its host and members, remove a
  member, or delete the workspace.
- **Overview and audit log:** account and data totals, and every admin action.

The totals and workspace list come from a DynamoDB Scan. That is fine at this
project's scale; at many thousands of rows it would call for a GSI or
maintained counters instead.
