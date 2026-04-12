"use strict";

const router = require("express").Router();
const { NCBI_BASE, NCBI_API_KEY, fetchWithRetry, parsePubMedXML } = require("../services/pubmedService");
const logger = require("../utils/logger");

// Search PubMed for relevant abstracts
router.post("/pubmed-search", async (req, res) => {
  const { query, maxResults = 20 } = req.body;
  const clampedMax = Math.min(Math.max(1, parseInt(maxResults, 10) || 20), 50);

  if (!query?.trim()) {
    return res.status(400).json({ error: "No search query provided." });
  }

  try {
    const keyParam = NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : "";

    const searchUrl =
      `${NCBI_BASE}/esearch.fcgi?db=pubmed` +
      `&term=${encodeURIComponent(query.trim())}` +
      `&retmax=${clampedMax}&sort=relevance&retmode=json${keyParam}`;

    const searchResp = await fetchWithRetry(searchUrl);
    if (!searchResp.ok) throw new Error(`PubMed search HTTP ${searchResp.status}`);
    const searchData = await searchResp.json();
    const ids = searchData.esearchresult?.idlist || [];

    if (!ids.length) {
      return res.json({ articles: [], total: 0 });
    }

    const fetchUrl =
      `${NCBI_BASE}/efetch.fcgi?db=pubmed` +
      `&id=${ids.join(",")}&rettype=abstract&retmode=xml${keyParam}`;

    const fetchResp = await fetchWithRetry(fetchUrl);
    if (!fetchResp.ok) throw new Error(`PubMed fetch HTTP ${fetchResp.status}`);
    const xml = await fetchResp.text();

    const articles = parsePubMedXML(xml);
    const total = parseInt(searchData.esearchresult?.count || "0", 10);
    res.json({ articles, total });
  } catch (err) {
    logger.error({ msg: "PubMed search error", error: err.message });
    res.status(500).json({ error: "PubMed search failed: " + err.message });
  }
});

// Fetch PubMed articles by PMID list, with PMC OA full-text if available
router.post("/fetch-pmids", async (req, res) => {
  const { pmids } = req.body;

  if (!Array.isArray(pmids) || pmids.length === 0) {
    return res.status(400).json({ error: "pmids must be a non-empty array." });
  }

  const validPmids = [...new Set(pmids.filter((id) => /^\d+$/.test(String(id).trim())).map(String))].slice(0, 50);

  if (validPmids.length === 0) {
    return res.status(400).json({ error: "No valid numeric PMIDs provided." });
  }

  try {
    const keyParam = NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : "";

    const fetchUrl =
      `${NCBI_BASE}/efetch.fcgi?db=pubmed&id=${validPmids.join(",")}&rettype=abstract&retmode=xml${keyParam}`;
    const fetchResp = await fetchWithRetry(fetchUrl);
    if (!fetchResp.ok) throw new Error(`PubMed efetch HTTP ${fetchResp.status}`);
    const xml = await fetchResp.text();

    const foundArticles = parsePubMedXML(xml);
    const foundPmids = new Set(foundArticles.map((a) => a.pmid));
    const notFound = validPmids.filter((id) => !foundPmids.has(id));

    async function enrichArticle(article) {
      let pmcid = null;
      let isOA = false;
      let fullText = null;

      try {
        const elinkUrl =
          `${NCBI_BASE}/elink.fcgi?dbfrom=pubmed&db=pmc&id=${article.pmid}&retmode=json${keyParam}`;
        const elinkResp = await fetchWithRetry(elinkUrl);
        if (elinkResp.ok) {
          const elinkData = await elinkResp.json();
          const links = elinkData?.linksets?.[0]?.linksetdbs?.find((db) => db.dbto === "pmc")?.links || [];
          if (links.length > 0) pmcid = String(links[0]);
        }
      } catch (err) {
        logger.error({ msg: "elink error", pmid: article.pmid, error: err.message });
      }

      if (pmcid) {
        try {
          const oaUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi?id=PMC${pmcid}`;
          const oaResp = await fetchWithRetry(oaUrl);
          if (oaResp.ok) {
            const oaXml = await oaResp.text();
            if (/<link[^>]+format="tgz"[^>]+href="[^"]+"/i.test(oaXml) ||
                /<link[^>]+format="pdf"[^>]+href="[^"]+"/i.test(oaXml)) {
              isOA = true;
            }
          }
        } catch (err) {
          logger.error({ msg: "OA check error", pmcid: `PMC${pmcid}`, error: err.message });
        }

        if (isOA) {
          try {
            const biocUrl = `https://www.ncbi.nlm.nih.gov/research/biolinkml/api/text?pmcids=PMC${pmcid}&format=bioc`;
            const biocResp = await fetchWithRetry(biocUrl);
            if (biocResp.ok) {
              const biocData = await biocResp.json();
              const targetSections = new Set(["INTRO", "RESULTS", "DISCUSS", "CONCL", "ABSTRACT"]);
              const passages = [];
              for (const doc of (biocData?.documents || biocData?.PubTator3 || [])) {
                for (const passage of doc.passages || []) {
                  const st = (passage?.infons?.section_type || passage?.infons?.type || "").toUpperCase();
                  if (targetSections.has(st)) passages.push(passage.text || "");
                }
              }
              fullText = passages.join(" ").trim().slice(0, 6000) || null;
            }
          } catch (err) {
            logger.error({ msg: "BioC fetch error", pmcid: `PMC${pmcid}`, error: err.message });
          }
        }
      }

      return { ...article, pmcid: pmcid ? `PMC${pmcid}` : null, isOA, fullText };
    }

    const CONCURRENCY = 3;
    const articles = [];
    for (let i = 0; i < foundArticles.length; i += CONCURRENCY) {
      const batch = foundArticles.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(enrichArticle));
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "fulfilled") {
          articles.push(results[j].value);
        } else {
          articles.push({ ...foundArticles[i + j], pmcid: null, isOA: false, fullText: null });
        }
      }
      if (i + CONCURRENCY < foundArticles.length) await new Promise((r) => setTimeout(r, 400));
    }

    res.json({ found: articles, notFound });
  } catch (err) {
    logger.error({ msg: "fetch-pmids error", error: err.message });
    res.status(500).json({ error: "Failed to fetch PMIDs: " + err.message });
  }
});

module.exports = router;
