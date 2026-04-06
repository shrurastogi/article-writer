"use strict";

const https = require("https");
const net = require("net");
const tls = require("tls");
const dnsPromises = require("dns").promises;

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const NCBI_API_KEY = process.env.NCBI_API_KEY || "";

// WSL2 and some environments resolve NCBI to IPv6 first, which causes TLS timeouts.
// We pre-resolve to IPv4 and use a custom createConnection to bypass the OS resolver.
let ncbiIpv4Cache = null;

async function resolveNcbiIpv4() {
  if (ncbiIpv4Cache) return ncbiIpv4Cache;
  try {
    const addrs = await dnsPromises.resolve4("eutils.ncbi.nlm.nih.gov");
    ncbiIpv4Cache = addrs[0];
  } catch { /* use hostname fallback */ }
  return ncbiIpv4Cache;
}

async function ncbiFetch(url) {
  const parsed = new URL(url);
  const ip = await resolveNcbiIpv4();
  const connectHost = ip || parsed.hostname;

  return new Promise((resolve, reject) => {
    // Establish the TLS connection manually to the IPv4 address,
    // then hand the established socket to http (not https) to avoid double-TLS.
    const tlsSocket = tls.connect(
      { host: connectHost, port: 443, servername: parsed.hostname, rejectUnauthorized: true },
      () => {
        const http = require("http");
        const req = http.request(
          {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: "GET",
            headers: { "User-Agent": "ArticleWriter/1.0", Connection: "close" },
            // Pass the already-established TLS socket — http will use it as-is
            createConnection: () => tlsSocket,
          },
          (res) => {
            const chunks = [];
            res.on("data", c => chunks.push(c));
            res.on("end", () => {
              const body = Buffer.concat(chunks).toString("utf8");
              resolve({
                ok: res.statusCode >= 200 && res.statusCode < 300,
                status: res.statusCode,
                json: () => Promise.resolve(JSON.parse(body)),
                text: () => Promise.resolve(body),
              });
            });
            res.on("error", reject);
          }
        );
        req.on("error", reject);
        req.end();
      }
    );

    tlsSocket.setTimeout(15000, () => { tlsSocket.destroy(); reject(new Error("NCBI request timed out")); });
    tlsSocket.on("error", reject);
  });
}

async function fetchWithRetry(url, maxRetries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ncbiFetch(url);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw lastErr;
}

function parsePubMedXML(xml) {
  const decode = (s) =>
    s.replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

  const articles = [];
  const blocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

  for (const block of blocks) {
    const pmid = (block.match(/<PMID[^>]*>(\d+)<\/PMID>/) || [])[1] || "";
    const title = decode((block.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/) || [])[1] || "");

    const abstractParts = [...block.matchAll(/<AbstractText[^>]*Label="([^"]*)"[^>]*>([\s\S]*?)<\/AbstractText>/g)];
    let abstract = "";
    if (abstractParts.length) {
      abstract = abstractParts.map((m) => `${m[1]}: ${decode(m[2])}`).join(" ");
    } else {
      abstract = decode((block.match(/<AbstractText>([\s\S]*?)<\/AbstractText>/) || [])[1] || "");
    }

    const lastNames = [...block.matchAll(/<LastName>([^<]+)<\/LastName>/g)].map((m) => m[1]);
    const authors =
      lastNames.length === 0 ? "Unknown"
      : lastNames.length > 3 ? `${lastNames[0]} et al.`
      : lastNames.join(", ");

    const year =
      (block.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>[\s\S]*?<\/PubDate>/) || [])[1] ||
      (block.match(/<MedlineDate>(\d{4})/) || [])[1] ||
      "";

    const journal = decode((block.match(/<ISOAbbreviation>([^<]+)<\/ISOAbbreviation>/) || [])[1] || "");

    if (title) {
      articles.push({ pmid, title, abstract, authors, year, journal });
    }
  }

  return articles;
}

module.exports = { NCBI_BASE, NCBI_API_KEY, fetchWithRetry, parsePubMedXML };
