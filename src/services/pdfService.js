"use strict";

const puppeteer = require("puppeteer-core");

async function generatePdf(html) {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
  });
  await browser.close();
  return pdf;
}

module.exports = { generatePdf };
