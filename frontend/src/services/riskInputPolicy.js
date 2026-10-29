// Include this policy in both page and request cache identities to retire old imputed labels.
export const RISK_INPUT_POLICY = 'complete-records-v1';
export const RISK_PREVIEW_CACHE = `risk:preview:${RISK_INPUT_POLICY}`;
export const SECTION_DETAILS_CACHE = `section-details:${RISK_INPUT_POLICY}`;
