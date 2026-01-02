import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { Client } from "pg";

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION,
});

const MODEL_ID = "amazon.titan-embed-text-v1";

async function getDbCredentials(secretArn: string) {
  const res = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  if (!res.SecretString) {
    throw new Error("SecretString is empty");
  }

  return JSON.parse(res.SecretString);
}

async function generateEmbedding(text: string): Promise<number[]> {
  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      inputText: text,
    }),
  });

  const response = await bedrock.send(command);
  const body = JSON.parse(new TextDecoder().decode(response.body));

  return body.embedding;
}

export const handler = async () => {
  const text = "PostgreSQL supports vector similarity search using pgvector.";

  console.log("Generating embedding...");
  const embedding = await generateEmbedding(text);

  console.log("Embedding length:", embedding.length);

  const secretArn = process.env.DB_SECRET_ARN!;
  const creds = await getDbCredentials(secretArn);

  console.log("Connecting to database...");

  const client = new Client({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: creds.username,
    password: creds.password,
    port: Number(process.env.DB_PORT),
    ssl: {
      rejectUnauthorized: false, // required for RDS
    },
  });

  await client.connect();
  console.log("Connected to database...");

  const vectorLiteral = `[${embedding.join(",")}]`;

  const query = `
  INSERT INTO documents (id, content, embedding)
  VALUES (DEFAULT, $1, $2::vector)
`;

  await client.query(query, [text, vectorLiteral]);

  await client.end();

  console.log("Document inserted successfully");

  return {
    statusCode: 200,
    body: "Embedding stored in database",
  };
};
