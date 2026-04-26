"use strict";

function getSectionContext(topic, sectionId, sectionTitle, articleType = "review") {
  const t = topic || "the given medical topic";
  const baseMap = {
    // Current standard sections (Sprint 2+)
    abstract:      `a structured abstract (Background, Key Findings, Conclusions) for a review article on ${t}`,
    introduction:  `an Introduction covering disease background, global burden, and rationale for reviewing ${t}`,
    main_body:     `the Main Body of a review article on ${t}, covering the key thematic areas with appropriate subheadings`,
    discussion:    `a Discussion section synthesising the evidence, addressing clinical implications, limitations, and how findings compare with existing literature on ${t}`,
    conclusions:   `a Conclusions section summarising major advances, remaining challenges, and clinical implications for ${t}`,
    references:    `a References section listing 30–40 key landmark references on ${t} in Vancouver format (numbered, Author et al., Journal, Year;Vol:Pages)`,
    // Legacy section IDs — retained for backward compatibility with articles created before Sprint 2
    epidemiology:      `an Epidemiology & Risk Factors section covering incidence, prevalence, demographic trends, and established risk factors for ${t}`,
    pathophysiology:   `a Pathophysiology & Molecular Biology section covering underlying disease mechanisms, key molecular alterations, and disease progression in ${t}`,
    diagnosis:         `a Clinical Presentation & Diagnosis section covering presenting features, diagnostic criteria, workup, imaging, and differential diagnosis for ${t}`,
    staging:           `a Staging & Risk Stratification section covering classification systems, prognostic factors, and risk categories for ${t}`,
    treatment_nd:      `a Treatment of Newly Diagnosed Disease section covering standard first-line strategies, guidelines, and landmark trials for ${t}`,
    treatment_rr:      `a Treatment of Relapsed/Refractory Disease section covering salvage regimens, drug classes, and key clinical trials for ${t}`,
    novel_therapies:   `a Novel Therapies & Emerging Treatments section covering recently approved agents, pipeline therapies, and recent clinical trial data for ${t}`,
    supportive_care:   `a Supportive Care & Management of Complications section covering disease- and treatment-related complications and their management in ${t}`,
    future_directions: `a Future Directions section covering ongoing trials, emerging targets, and unresolved research questions for ${t}`,
    conclusion:        `a Conclusions section summarising major advances, remaining challenges, and clinical implications for ${t}`,
  };
  const overrides = {
    original_research: {
      abstract:     `a structured abstract (Background, Methods, Results, Conclusions) for an original research article on ${t}`,
      introduction: `an Introduction identifying the gap in knowledge, study rationale, and primary aims for original research on ${t}`,
      methods:      `a Methods section covering study design, participants, interventions, outcomes, and statistical analysis for ${t}`,
      results:      `a Results section presenting primary and secondary outcomes with data, tables, and statistical results for ${t}`,
    },
    perspective: {
      abstract:          `a brief abstract summarising the perspective argument on ${t}`,
      introduction:      `an Introduction contextualising the clinical debate and author's viewpoint on ${t}`,
      perspective_body:  `a Perspective body presenting the author's argument with supporting evidence and counter-arguments on ${t}`,
    },
  };
  return overrides[articleType]?.[sectionId] || baseMap[sectionId]
    || `the "${sectionTitle}" section of a medical article on ${t}`;
}

/**
 * Build a style instruction string from a calibrated writingStyle object.
 * Returns empty string if no valid profile is present.
 */
function getStyleInstruction(writingStyle) {
  if (!writingStyle?.styleProfile) return "";
  const p = writingStyle.styleProfile;
  const parts = [];
  if (p.toneDescriptor)         parts.push(`tone is ${p.toneDescriptor}`);
  if (p.formalityScore !== null && p.formalityScore !== undefined) parts.push(`formality ${p.formalityScore}/100`);
  if (p.avgSentenceLength)      parts.push(`avg sentence length ~${p.avgSentenceLength} words`);
  if (p.hedgingFrequency)       parts.push(`hedging ${p.hedgingFrequency}`);
  if (!parts.length) return "";
  return `Writing style guidance: ${parts.join(", ")}. Match this style.`;
}

// Universal rules applied to every section except where overridden.
const UNIVERSAL_RULES = [
  "Spell out numbers one through nine; use numerals for 10 and above, and always for measurements with units",
  "Define every abbreviation at first use; never use abbreviations in headings",
  "Format p-values as P=0.03 (capital P, exact value — never P<0.05 alone)",
  "Use generic drug names first; add trade name in parentheses at first mention only",
  "Prefer active voice unless passive is conventionally required (e.g. Methods)",
  "Never write 'data not shown' — either include the data or omit the claim",
];

// Returns { requirements: string[], suppressPubmed: boolean, maxTokens: number }
function getSectionRequirements(sectionId, journalHint, styleText) {
  const style  = styleText ? [`${styleText}`] : [];
  const base   = `Formal academic writing style suitable for a high-impact journal (e.g. ${journalHint})`;
  const retOnly = "Return ONLY the section content — no section heading, no preamble, no explanations";

  const sections = {

    abstract: {
      suppressPubmed: false,
      noCitations: true,
      suppressExistingSections: true,
      maxTokens: 600,
      requirements: [
        base,
        "Structured format with these headings on separate lines: Background: | Objective: | Key Findings: | Conclusions:",
        "150–250 words total — strict limit",
        "Drug names (generic and brand) and clinical trial names (e.g. KEYNOTE-522, IMROZ) are permitted",
        "Past tense for findings and methods; present tense for conclusions and established facts",
        "Self-contained — readable and complete without access to the rest of the article",
        "Return ONLY the abstract text — no heading, no preamble, no word count",
        ...style,
        "CRITICAL: DO NOT include author citations, people's names, or reference markers of any kind (e.g. [Smith et al., 2023], (Jones 2021), [1], [2]) — abstracts never cite authors or papers",
      ],
    },

    introduction: {
      suppressPubmed: false,
      maxTokens: 1200,
      requirements: [
        base,
        "Exactly 3–4 paragraphs structured as: (1) disease background and global burden, (2) current standard of care and unmet need, (3) knowledge gap and rationale for this review, (4) explicit statement of scope — what this article covers",
        "400–600 words",
        "Cite 5–15 seminal references only using [Author et al., Year] placeholders",
        "Present tense for established facts; past tense for prior studies",
        "No results, conclusions, or treatment recommendations",
        retOnly,
        ...UNIVERSAL_RULES,
        ...style,
      ],
    },

    discussion: {
      suppressPubmed: false,
      maxTokens: 1800,
      requirements: [
        base,
        "Open with a single sentence summarising the most important finding of this review",
        "Structure: (1) key finding in context, (2) comparison with published literature using [Author et al., Year], (3) explanation of any discrepancies, (4) explicit Limitations paragraph — be specific, not vague, (5) clinical implications, (6) future directions",
        "600–900 words",
        "Do NOT restate results verbatim — interpret and contextualise them",
        "Limitations paragraph is mandatory — name specific limitations, do not hedge with generalities",
        "Citations as [Author et al., Year] placeholders where comparing with literature",
        retOnly,
        ...UNIVERSAL_RULES,
        ...style,
      ],
    },

    conclusions: {
      suppressPubmed: true,
      maxTokens: 500,
      requirements: [
        base,
        "100–150 words maximum",
        "No citations or references",
        "No new data or findings not already presented in the article body",
        "Do not use 'further research is needed' alone — name the specific gap or question",
        "Present tense throughout",
        "No subheadings",
        retOnly,
        ...UNIVERSAL_RULES,
        ...style,
      ],
    },

    // original_research sections
    methods: {
      suppressPubmed: false,
      maxTokens: 1800,
      requirements: [
        base,
        "Past tense throughout",
        "Subsections: Study Design, Participants (inclusion/exclusion criteria), Interventions, Outcomes (primary and secondary explicitly defined), Statistical Analysis",
        "Name every statistical test used — do not write 'statistical analysis was performed'",
        "Include ethics/IRB approval statement and informed consent",
        "Reference applicable reporting guideline (CONSORT for RCTs, PRISMA for systematic reviews, STROBE for observational studies)",
        "No results in this section",
        retOnly,
        ...UNIVERSAL_RULES,
        ...style,
      ],
    },

    results: {
      suppressPubmed: false,
      maxTokens: 1800,
      requirements: [
        base,
        "Past tense throughout",
        "Report data only — no interpretation, no comparison with other studies (that belongs in Discussion)",
        "Report exact P-values (P=0.03), effect sizes, and 95% CI for all primary and secondary outcomes",
        "Round means to 1 decimal place; proportions to 1 decimal place; P-values to 2–3 significant figures",
        "Reference tables and figures parenthetically (e.g. Table 1, Figure 2) but do not duplicate data already shown in them",
        retOnly,
        ...UNIVERSAL_RULES,
        ...style,
      ],
    },

    // review body sections — shared rules
    main_body:        null,
    epidemiology:     null,
    pathophysiology:  null,
    diagnosis:        null,
    staging:          null,
    treatment_nd:     null,
    treatment_rr:     null,
    novel_therapies:  null,
    supportive_care:  null,
    future_directions: null,
    conclusion:       null,   // legacy alias for conclusions
  };

  // Sections explicitly mapped to null use the standard body rules below
  const entry = sections[sectionId];
  if (entry && entry !== null) return entry;

  // Standard body section (review article sections, legacy sections)
  return {
    suppressPubmed: false,
    maxTokens: 1800,
    requirements: [
      base,
      "Evidence-based with citations as [Author et al., Year] placeholders",
      "300–600 words with subheadings where appropriate",
      "Include landmark trial names, key statistics, approved agents, and current guideline recommendations",
      "Past tense for completed studies; present tense for current standards and established facts",
      retOnly,
      ...UNIVERSAL_RULES,
      ...style,
    ],
  };
}

module.exports = { getSectionContext, getStyleInstruction, getSectionRequirements };
