const express = require("express");
const locations = require("../services/locations");
const { requireAuth } = require("../middleware/auth");

// Province, city or municipality, and barangay lists for the address dropdowns. Signed-in users only.
const router = express.Router();
router.use(requireAuth);

const code = (v) => (typeof v === "string" && /^[A-Z0-9]{1,12}$/.test(v) ? v : "");

router.get("/provinces", (_req, res) => res.json({ provinces: locations.provinces() }));
router.get("/towns", (req, res) => res.json({ towns: locations.towns(code(req.query.province)) }));
router.get("/barangays", (req, res) => res.json({ barangays: locations.barangays(code(req.query.town)) }));
router.get("/parse", (req, res) => {
  const address = typeof req.query.address === "string" ? req.query.address.slice(0, 300) : "";
  res.json({ address: locations.parse(address) });
});

module.exports = router;
