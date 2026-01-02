import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";

export class AppCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromVpcAttributes(this, "Vpc", {
      vpcId: cdk.Fn.importValue("RagVpcId"),
      availabilityZones: cdk.Stack.of(this).availabilityZones,
      publicSubnetIds: [
        cdk.Fn.importValue("RagPublicSubnet1"),
        cdk.Fn.importValue("RagPublicSubnet2"),
      ],
      privateSubnetIds: [
        cdk.Fn.importValue("RagPrivateSubnet1"),
        cdk.Fn.importValue("RagPrivateSubnet2"),
      ],
    });

    const dbAccessSg = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "DbAccessSG",
      cdk.Fn.importValue("RagDbAccessSecurityGroup")
    );

    const dbEndpoint = cdk.Fn.importValue("RagDbEndpoint");
    const dbSecretArn = cdk.Fn.importValue("RagDbSecretArn");

    const lambdaSG = new ec2.SecurityGroup(this, "LambdaSG", {
      vpc,
      description: "Security group for Lambda accessing RDS",
      allowAllOutbound: true,
    });

    const ingestLambda = new lambda.Function(this, "IngestDocumentsLambda", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda/ingest")),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSG],
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: {
        DB_HOST: dbEndpoint,
        DB_NAME: "postgres",
        DB_USER: "raguser",
        DB_PORT: "5432",
        // password later via Secrets Manager
      },
    });

    ingestLambda.connections.addSecurityGroup(dbAccessSg);

    ingestLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );
  }
}
