const express = require("express");
const router = express.Router();
const { container } = require("../config/db");

function normalizePhone(value) {
  if (!value) return "";

  let s = String(value).trim();

  if (s.endsWith(".0")) {
    s = s.slice(0, -2);
  }

  s = s.replace(/[^\d+]/g, "");

  if (s.startsWith("+972")) {
    s = "0" + s.slice(4);
  } else if (s.startsWith("972")) {
    s = "0" + s.slice(3);
  }

  if (s.length === 9 && !s.startsWith("0")) {
    s = "0" + s;
  }

  return s;
}

router.post("/login", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        message: "phone is required"
      });
    }

    const normalizedPhone = normalizePhone(phone);

    // ניסיון ראשון - חיפוש ישיר
    const querySpec = {
      query: "SELECT * FROM c WHERE c.phone = @phone",
      parameters: [
        { name: "@phone", value: normalizedPhone }
      ]
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    let participant = resources[0];

    // fallback אם הפורמט שונה ב-DB
    if (!participant) {
      const allQuery = { query: "SELECT * FROM c" };
      const { resources: allParticipants } =
        await container.items.query(allQuery).fetchAll();

      participant = allParticipants.find(
        (p) => normalizePhone(p.phone) === normalizedPhone
      );
    }

    if (!participant) {
      return res.status(404).json({
        message: "Participant not found"
      });
    }

    return res.json(participant);
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
});

module.exports = router;