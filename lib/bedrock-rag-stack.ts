import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";

export class BedrockRagCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC (cheap: no NAT gateways)
    const vpc = new ec2.Vpc(this, "RagVpc", {
      maxAzs: 2,
      natGateways: 0,
    });

    // Security Group for DB
    const dbSg = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Security group for Postgres",
    });

    // Postgres RDS
    const db = new rds.DatabaseInstance(this, "RagPostgres", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      credentials: rds.Credentials.fromGeneratedSecret("raguser"),
      allocatedStorage: 20,
      maxAllocatedStorage: 30,
      securityGroups: [dbSg],
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    new cdk.CfnOutput(this, "DbEndpoint", {
      value: db.instanceEndpoint.hostname,
    });
  }
}
