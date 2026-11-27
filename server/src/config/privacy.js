// The Privacy Notice (RA 10173, the Data Privacy Act of 2012). Its text is on the web at /privacy
// (client/src/pages/PrivacyPage.tsx) and in the app (mobile/src/screens/PrivacyNotice.tsx). Change
// the version when the notice changes: everyone is then asked to agree again.
const env = require("./env");

const PRIVACY_NOTICE_VERSION = "2026-11";

/** What is stored as proof of consent: which notice, when, and from where. */
const consentRecord = (req) => ({ version: PRIVACY_NOTICE_VERSION, at: new Date(), ip: req.ip });

/** True when the user agreed to the current notice. */
const hasConsented = (user) => user?.privacyConsent?.version === PRIVACY_NOTICE_VERSION;

module.exports = { PRIVACY_NOTICE_VERSION, consentRecord, hasConsented, contactEmail: () => env.officeEmail };
