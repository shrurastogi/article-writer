"use strict";

function getSectionContext(topic, sectionId, sectionTitle) {
  const t = topic || "the given medical topic";
  const map = {
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
  return map[sectionId] || `the "${sectionTitle}" section of a review article on ${t}`;
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

module.exports = { getSectionContext, getStyleInstruction };
