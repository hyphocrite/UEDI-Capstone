const express = require("express");
const Member = require("../models/Member");
const ledger = require("../services/ledger");
const { signalsFor } = require("../services/memberSignals");
const { scoreOf, memberView } = require("../services/memberScore");
const { historyOf } = require("../services/memberHistory");
const { requireAuth } = require("../middleware/auth");

// The signed-in member's own things. Web accounts (cookie) and the mobile app (Bearer) alike.
// Nothing here takes a member ID from the request: it is always the caller's own.
const router = express.Router();
router.use(requireAuth);

// Same fallback as the co-maker portal: phone sign-ups may only have the number they typed.
const myMemberId = (user) => user.memberId || user.memberNo || null;

// The member score (savings, attendance, bills, co-maker record, repayment), never the ML credit
// score of an application. Computed exactly as staff see it on GET /api/members/:memberId.
router.get("/score", async (req, res, next) => {
  try {
    const memberId = myMemberId(req.user);
    const member = memberId ? await Member.findOne({ memberId }) : null;
    // A new account's own ID (N-…) is a placeholder record until the office links it: not linked yet.
    if (!member || member.provisional) return res.json({ linked: false, score: null });
    const [history, signals] = await Promise.all([historyOf(member), signalsFor([member.memberId])]);
    res.json({
      linked: true,
      memberId: member.memberId,
      score: memberView(scoreOf(signals.get(member.memberId), history)),
      asOf: ledger.todayInManila().toISOString().slice(0, 10),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
