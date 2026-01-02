#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { InfraCdkStack } from "../lib/infra-stack";
import { AppCdkStack } from "../lib/app-stack";

const app = new cdk.App();

const infraStack = new InfraCdkStack(app, "InfraStack", {});
const appStack = new AppCdkStack(app, "AppStack", {});
appStack.addDependency(infraStack); // Ensures infra deploys first
