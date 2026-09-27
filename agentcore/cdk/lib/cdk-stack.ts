import {
  AgentCoreApplication,
  AgentCoreMcp,
  AgentCorePayments,
  type AgentCoreMcpProps,
  type AgentCoreMcpSpec,
  type AgentCoreProjectSpec,
  type HarnessDeploymentConfig,
} from '@aws/agentcore-cdk';
import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/** Configuration collected by the generated CDK entrypoint for one harness. */
export type HarnessConfig = HarnessDeploymentConfig;

type CredentialState = Record<string, { credentialProviderArn: string; clientSecretArn?: string }>;

export interface AgentCoreStackProps extends StackProps {
  readonly spec: AgentCoreProjectSpec;
  readonly mcpSpec?: AgentCoreMcpSpec;
  readonly credentials?: CredentialState;
  readonly connectorParametersByFile?: Record<string, Record<string, unknown>>;
  readonly harnesses?: HarnessConfig[];
  /**
   * The CLI passes a normalized payment view. The canonical project spec stays
   * the source of truth because AgentCorePayments reads it directly.
   */
  readonly paymentSpec?: unknown;
}

/**
 * Compose the public AgentCore L3 constructs into the stack consumed by the
 * AgentCore CLI. Keeping this wrapper local makes `npm run build` a meaningful
 * deployment preflight rather than relying on a missing generated file.
 */
export class AgentCoreStack extends Stack {
  constructor(scope: Construct, id: string, props: AgentCoreStackProps) {
    super(scope, id, props);

    const application = new AgentCoreApplication(this, 'Application', {
      spec: props.spec,
      harnesses: props.harnesses,
      connectorParametersByFile: props.connectorParametersByFile,
      credentials: props.credentials,
    });

    if (props.mcpSpec) {
      new AgentCoreMcp(this, 'Mcp', {
        projectName: props.spec.name,
        mcpSpec: props.mcpSpec,
        agentCoreApplication: application,
        credentials: props.credentials as AgentCoreMcpProps['credentials'],
        projectTags: props.tags,
      });
    }

    if (props.spec.payments?.length) {
      new AgentCorePayments(this, 'Payments', {
        spec: props.spec,
        credentials: props.credentials,
        agentCoreApplication: application,
      });
    }

    new CfnOutput(this, 'StackNameOutput', {
      value: this.stackName,
      description: 'Name of the CloudFormation Stack',
    });
  }
}
