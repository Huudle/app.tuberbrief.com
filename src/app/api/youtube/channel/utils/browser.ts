import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export const getBrowser = async () => {
  // For development
  if (process.env.NODE_ENV === "development") {
    return puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath:
        process.platform === "win32"
          ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
          : process.platform === "darwin"
          ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
          : "/usr/bin/google-chrome",
    });
  }

  // For Netlify deployment
  return puppeteer.launch({
    args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(
      "/var/task/node_modules/@sparticuz/chromium/bin"
    ),
    headless: true,
  });
};
