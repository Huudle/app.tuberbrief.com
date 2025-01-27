import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";

const username = "flowfusion_IahFh";
const password = process.env.OXYLABS_PASSWORD;

export const scrapeByOxyLabs = async (url: string): Promise<string | null> => {
  // Advanced proxy solutions - Web Unblocker
  // https://developers.oxylabs.io/advanced-proxy-solutions/web-unblocker/getting-started
  const agent = new HttpsProxyAgent(
    `https://${username}:${password}@unblock.oxylabs.io:60000`
  );
  // Ignore the certificate
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
  const headers = {
    "x-oxylabs-render": "html",
  };
  const response = await fetch(url, {
    agent: agent,
    headers: headers,
  });
  return response.text();
};
