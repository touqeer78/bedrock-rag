import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";

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

    const ingestLambda = new lambdaNodejs.NodejsFunction(
      this,
      "IngestDocumentsLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambda/ingest/index.ts"),
        handler: "handler",
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [dbAccessSg],
        timeout: cdk.Duration.seconds(30),
        memorySize: 1024,
        environment: {
          DB_HOST: dbEndpoint,
          DB_NAME: "postgres",
          DB_PORT: "5432",
          DB_SECRET_ARN: dbSecretArn,
        },
      }
    );

    ingestLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    ingestLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [dbSecretArn],
      })
    );
  }
}
