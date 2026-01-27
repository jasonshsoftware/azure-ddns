import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import axios from "axios";
import { ClientSecretCredential } from "@azure/identity";
import { DnsManagementClient } from "@azure/arm-dns";

/* ---------- Config ---------- */

const {
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  AZURE_SUBSCRIPTION_ID,
  AZURE_RESOURCE_GROUP,
  RECORD_NAME,
  ZONE_NAME,
  TTL = "300",
  DELAY = "5000", //"90000",
} = process.env;

if (
  !AZURE_TENANT_ID ||
  !AZURE_CLIENT_ID ||
  !AZURE_CLIENT_SECRET ||
  !AZURE_SUBSCRIPTION_ID ||
  !AZURE_RESOURCE_GROUP ||
  !ZONE_NAME ||
  !RECORD_NAME
) {
  throw new Error("Missing required environment variables");
}

const ttl = Number(TTL);
const delay = Number(DELAY);

/* ---------- Azure ---------- */

const credential = new ClientSecretCredential(
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
);
const dnsClient = new DnsManagementClient(credential, AZURE_SUBSCRIPTION_ID);

/* ---------- State ---------- */

let cachedIp: string | null = null;
let lastUpdated: string | null = null;
let lastSync: string | null = null;

/* ---------- Functions ---------- */

async function getPublicIp(): Promise<string> {
  const response = await axios.get<string>("https://api.ipify.org");
  return response.data.trim();
}

async function updateDns(ip: string): Promise<void> {
  await dnsClient.recordSets.createOrUpdate(
    AZURE_RESOURCE_GROUP!,
    ZONE_NAME!,
    RECORD_NAME!,
    "A",
    {
      ttl,
      aRecords: [{ ipv4Address: ip }],
    },
  );
}

async function syncIp(): Promise<string> {
  const ip = await getPublicIp();

  if (ip !== cachedIp) {
    cachedIp = ip;
    await updateDns(ip);
    lastSync = lastUpdated = new Date().toISOString();

    console.log(`DNS updated → ${RECORD_NAME}.${ZONE_NAME} = ${ip}`);
  } else {
    lastSync = new Date().toISOString();
  }

  return ip;
}

function getStatus() {
  return {
    record: `${RECORD_NAME}.${ZONE_NAME}`,
    ip: cachedIp,
    lastUpdated,
    lastSync,
  };
}

/* ---------- HTTP API ---------- */

const app = express();
export default app;

app.post("/sync", async (_req: Request, res: Response) => {
  await syncIp();

  res.json(getStatus());
});

/* ---------- Startup ---------- */

syncIp().catch(console.error);

setInterval(() => {
  syncIp().catch(console.error);
}, delay);
