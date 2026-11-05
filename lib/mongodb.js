import "server-only";
import { MongoClient } from "mongodb";

const globalForMongo = globalThis;

function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB_NAME;

  if (!uri) {
    throw new Error("MONGODB_URI is required before database access can start.");
  }

  if (!databaseName) {
    throw new Error("MONGODB_DB_NAME is required before database access can start.");
  }

  return { uri, databaseName };
}

export async function getMongoClient() {
  const { uri } = getMongoConfig();

  if (!globalForMongo.__rushlessMongoClientPromise) {
    const client = new MongoClient(uri);
    globalForMongo.__rushlessMongoClientPromise = client.connect().catch((error) => {
      globalForMongo.__rushlessMongoClientPromise = undefined;
      throw error;
    });
  }

  return globalForMongo.__rushlessMongoClientPromise;
}

export async function getMongoDb() {
  const [{ databaseName }, client] = await Promise.all([
    Promise.resolve(getMongoConfig()),
    getMongoClient(),
  ]);

  return client.db(databaseName);
}
