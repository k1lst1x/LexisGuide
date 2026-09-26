# LexisGuide assistant

The multi-agent assistant behind the chat popup and the AI Assistant page. It
runs as the `LexisGuideAssistant` AgentCore runtime, and the API can also run
the same code directly against Bedrock (this is what production does until the
runtime's ARN is set).

## How a turn works

1. **Router.** A small Bedrock call picks the specialists the message needs. If
   it fails, rules based on the wording pick them instead.
2. **Specialists, in parallel.** Each is its own Bedrock agent with its own
   instructions and tools, and returns an internal note:
   - `support`: every page and feature of the website, and troubleshooting
     (`site_guide`, `support_help`).
   - `law`: US law in general, by topic, with state variation and where to get
     help (`us_law`, `explain_term`, `check_clause`).
   - `inbox`: summarises and prioritises the person's recent workspace
     messages (gathered by the API, only from channels they have joined) and
     proposes tasks (`propose_tasks`).
   - `operator`: decides which app actions to take (`plan_actions`): re-check,
     negotiate, rewrite, apply a fix, resolve, create a task.
   - `review`, `research`, `drafting`: fast deterministic notes about the open
     document, official-source receipts, and scoped drafting.
   A specialist that fails or misses the 9-second deadline is replaced by its
   fallback note, so the answer always comes.
3. **Lead agent.** `ConversationAgent` writes one natural-language answer from
   the notes.

The reply carries `workspace_actions`, `tasks`, and `auto_apply`. The app, not
the model, performs actions. `auto_apply` is true only when the person's own
latest message told the assistant to act ("fix it", "add these as tasks", or
"yes" to its offer); a model saying so is never enough. Otherwise the actions
and tasks are offered as buttons.

## Files

- `models.py`: the chat request/response contract, validated on both sides.
- `knowledge.py`: the site guide, support playbook, and US law primer.
- `tools.py`: the tools the agents call.
- `specialists.py`: the specialist agents and their fallbacks.
- `orchestrator.py`: the router and the `SupervisorAgent` that runs a turn.
- `agent.py`: the lead agent's Bedrock Converse tool-use loop.

The client sends recent turns with each request, so the agents are stateless
and safe to scale.

## Deploying to Bedrock AgentCore

Production already runs this code inside the API against Bedrock, so nothing
below is needed for the assistant to work. Deploying the runtime moves the
agents onto AgentCore.

1. Get the latest code. If you had merged an older copy of the history, reset
   rather than merge:

       git fetch origin && git reset --hard origin/main

2. Sign in to AWS with an identity that can deploy AgentCore, in the account
   and region the runtime should live in:

       aws login
       aws sts get-caller-identity

   The API runs in account `576884310211`, region `us-west-2`. Deploy the
   runtime into that same account (the API calls the runtime in whatever
   region its ARN names). `agentcore/aws-targets.json` currently points at
   account `465083445156`, region `us-east-1`: change it to the production
   account and region before deploying. A runtime in a different account cannot
   be called by the API without extra cross-account setup.

3. In the Bedrock console for that region, make sure model access is enabled
   for the model in `agentcore/agentcore.json` (`ASSISTANT_MODEL_ID`). Production
   uses `us.amazon.nova-2-lite-v1:0`.

4. Build the shared packages into the runtimes' `vendor/` folders and deploy:

       bash agentcore/scripts/build-shared-wheels.sh
       cd agentcore
       agentcore deploy --diff
       agentcore deploy -y

5. Copy the `LexisGuideAssistant` runtime ARN from the output and set it as a
   GitHub Actions variable, then redeploy the API:

       gh variable set AGENTCORE_ASSISTANT_RUNTIME_ARN --body "arn:aws:bedrock-agentcore:..."
       gh workflow run deploy-api.yml

6. Check: ask the assistant "Summarize my messages" in Messages, and "Can my
   landlord keep my deposit?" anywhere. To go back to the in-API agents, delete
   the variable and redeploy the API.
