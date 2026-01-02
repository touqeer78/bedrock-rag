import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";

export class InfraCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC Creation
    const vpc = new ec2.Vpc(this, "RagVpc", {
      maxAzs: 2,
      natGateways: 1,
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // Security Group for DB
    const dbSg = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Security group for Postgres Db",
    });

    const dbAccessSg = new ec2.SecurityGroup(this, "DbAccessSg", { vpc });
    dbSg.addIngressRule(
      dbAccessSg,
      ec2.Port.tcp(5432),
      "Allow Lambda to access Postgres"
    );

    // Postgres RDS,
    const db = new rds.DatabaseInstance(this, "RagPostgres", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
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

    //exporting what I need
    new cdk.CfnOutput(this, "VpcId", {
      value: vpc.vpcId,
      exportName: "RagVpcId",
    });

    // Export private subnet IDs
    vpc.privateSubnets.forEach((subnet, index) => {
      new cdk.CfnOutput(this, `PrivateSubnet${index + 1}`, {
        value: subnet.subnetId,
        exportName: `RagPrivateSubnet${index + 1}`,
      });
    });

    // Export public subnet IDs
    vpc.publicSubnets.forEach((subnet, index) => {
      new cdk.CfnOutput(this, `PublicSubnet${index + 1}`, {
        value: subnet.subnetId,
        exportName: `RagPublicSubnet${index + 1}`,
      });
    });

    new cdk.CfnOutput(this, "DbEndpoint", {
      value: db.instanceEndpoint.hostname,
      exportName: "RagDbEndpoint",
    });

    new cdk.CfnOutput(this, "DbSecretArn", {
      value: db.secret!.secretArn,
      exportName: "RagDbSecretArn",
    });

    new cdk.CfnOutput(this, "DbAccessSG", {
      value: dbAccessSg.securityGroupId,
      exportName: "RagDbAccessSecurityGroup",
    });
  }
}
