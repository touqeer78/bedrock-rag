import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";

export class BedrockRagCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC Creation
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

    // Postgres RDS,
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
      publiclyAccessible: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    new cdk.CfnOutput(this, "DbEndpoint", {
      value: db.instanceEndpoint.hostname,
    });

    const bastionSg = new ec2.SecurityGroup(this, "BastionSg", {
      vpc,
      description: "Security group for bastion host",
      allowAllOutbound: true,
    });

    // Allow SSH only from your IP
    bastionSg.addIngressRule(
      ec2.Peer.ipv4("115.129.76.74/32"),
      ec2.Port.tcp(22),
      "SSH access from my IP"
    );

    const bastion = new ec2.Instance(this, "BastionHost", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux(),
      securityGroup: bastionSg,
      keyName: "bastion-key", // must exist in EC2 Key Pairs
    });

    db.connections.allowFrom(
      bastion,
      ec2.Port.tcp(5432),
      "Bastion access to Postgres"
    );
  }
}
