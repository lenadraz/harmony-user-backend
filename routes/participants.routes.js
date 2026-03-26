const express = require("express");
const router = express.Router();
const { container } = require("../config/db");
function cleanText(text) {
  if (text === null || text === undefined) return ''
  return String(text).trim().replace(/\s+/g, ' ')
}

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

function mapParticipant(participant) {
  if (!participant) return null;

  return {
    id: participant.id,
    event_id: participant.event_id || null,
    name: participant.name || "",
    phone: normalizePhone(participant.phone),
    job: participant.job || "",
    academic: participant.academic || "",
    professional: participant.professional || "",
    personal: participant.personal || "",
    image: participant.image || participant.thumbnail_url || "",
    hidden: Boolean(participant.hidden),
    saved: participant.saved || [],
    met: participant.met || [],
  };
}
// helper: מביא משתתף לפי id
async function getParticipantById(id) {
  const querySpec = {
    query: "SELECT * FROM c WHERE c.id = @id",
    parameters: [{ name: "@id", value: id }],
  };
  function cleanText(value) {
  return String(value || "").trim();
}

  const { resources } = await container.items.query(querySpec).fetchAll();
  return resources[0] || null;
}

// helper: מביא משתתף לפי טלפון
async function getParticipantByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);

  const querySpec = {
    query: "SELECT * FROM c WHERE c.phone = @phone",
    parameters: [{ name: "@phone", value: normalizedPhone }],
  };

  const { resources } = await container.items.query(querySpec).fetchAll();

  if (resources.length) {
    return resources[0];
  }

  // fallback - אם ב-DB נשמר בפורמט אחר
  const allQuery = {
    query: "SELECT * FROM c"
  };

  const { resources: allParticipants } = await container.items.query(allQuery).fetchAll();
  return (
    allParticipants.find(
      (participant) => normalizePhone(participant.phone) === normalizedPhone
    ) || null
  );
}

// helper: מביא רשימת משתתפים לפי ids
async function getParticipantsByIds(ids) {
  if (!ids || !ids.length) return [];

  const querySpec = {
    query: "SELECT * FROM c WHERE ARRAY_CONTAINS(@ids, c.id)",
    parameters: [{ name: "@ids", value: ids }],
  };

  const { resources } = await container.items.query(querySpec).fetchAll();
  return resources;
}

// Get all participants
router.get("/", async (req, res) => {
  try {
    const querySpec = {
      query: "SELECT * FROM c"
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    const participants = resources.map(mapParticipant);

    return res.json(participants);
  } catch (error) {
    console.error("Get all participants error:", error.message);
    return res.status(500).json({
      message: "Failed to get participants",
      error: error.message,
    });
  }
});


// Get participant by phone
router.get("/phone/:phone", async (req, res) => {
  try {
    const participant = await getParticipantByPhone(req.params.phone);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json(mapParticipant(participant));
  } catch (error) {
    console.error("Get participant by phone error:", error.message);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

// Get participant by participant number
// תומך גם אם שולחים 1 ואז מחפש p1
router.get("/number/:num", async (req, res) => {
  try {
    const rawNum = req.params.num;
    const num = parseInt(rawNum, 10);

    if (isNaN(num)) {
      return res.status(400).json({ message: "Invalid participant number" });
    }

    const participantId = `p${num}`;
    const participant = await getParticipantById(participantId);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json(mapParticipant(participant));
  } catch (error) {
    console.error("Get participant by number error:", error.message);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});
// UPDATE participant profile
router.put("/:id", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const allowedFields = [
      "name",
      "job",
      "academic",
      "professional",
      "personal",
      "image",
    ];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        participant[field] = cleanText(req.body[field]);
      }
    }

    // phone stays unchanged on purpose
const partitionKey = participant.id;

if (!partitionKey) {
  throw new Error("Missing partition key (event_id)");
}

const { resource: updated } = await container
  .item(participant.id, partitionKey)
  .replace(participant);
    return res.json({
      message: "Profile updated successfully",
      participant: mapParticipant(updated),
      refreshMatches: true,
    });
  } catch (error) {
    console.error("Update profile error:", error.message);
    return res.status(500).json({
      message: "Update profile failed",
      error: error.message,
    });
  }
});
// HIDE / UNHIDE participant profile
router.patch("/:id/privacy", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    participant.hidden = Boolean(req.body.hidden);

    const { resource: updated } = await container
      .item(participant.id, participant.event_id)
      .replace(participant);

    return res.json({
      message: participant.hidden
        ? "Profile hidden successfully"
        : "Profile is visible again",
      participant: mapParticipant(updated),
    });
  } catch (error) {
    console.error("Privacy update error:", error.message);
    return res.status(500).json({
      message: "Privacy update failed",
      error: error.message,
    });
  }
});
// DELETE participant personal data
router.delete("/:id", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    participant.name = "";
    participant.job = "";
    participant.academic = "";
    participant.professional = "";
    participant.personal = "";
    participant.image = "";
    participant.hidden = true;

    const { resource: updated } = await container
      .item(participant.id, participant.event_id)
      .replace(participant);

    return res.json({
      message: "Participant data removed successfully",
      participant: mapParticipant(updated),
    });
  } catch (error) {
    console.error("Delete participant data error:", error.message);
    return res.status(500).json({
      message: "Delete participant data failed",
      error: error.message,
    });
  }
});

// GET saved list ids
router.get("/:id/saved", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json({
      saved: participant.saved || [],
    });
  } catch (error) {
    console.error("Get saved error:", error.message);
    return res.status(500).json({
      message: "Get saved failed",
      error: error.message,
    });
  }
});

// GET saved full data
router.get("/:id/saved/full", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const savedIds = participant.saved || [];
    const savedParticipants = await getParticipantsByIds(savedIds);

    return res.json(savedParticipants.map(mapParticipant));
  } catch (error) {
    console.error("Get saved full error:", error.message);
    return res.status(500).json({
      message: "Get saved full failed",
      error: error.message,
    });
  }
});

// GET met list ids
router.get("/:id/met", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json({
      met: participant.met || [],
    });
  } catch (error) {
    console.error("Get met error:", error.message);
    return res.status(500).json({
      message: "Get met failed",
      error: error.message,
    });
  }
});

// GET met full data
router.get("/:id/met/full", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const metIds = participant.met || [];
    const metParticipants = await getParticipantsByIds(metIds);

    return res.json(metParticipants.map(mapParticipant));
  } catch (error) {
    console.error("Get met full error:", error.message);
    return res.status(500).json({
      message: "Get met full failed",
      error: error.message,
    });
  }
});

// SAVE - add targetId to saved[]
router.post("/:id/save/:targetId", async (req, res) => {
  try {
    const { id, targetId } = req.params;

    if (id === targetId) {
      return res.status(400).json({ message: "Cannot save yourself" });
    }

    const participant = await getParticipantById(id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const targetParticipant = await getParticipantById(targetId);
    if (!targetParticipant) {
      return res.status(404).json({ message: "Target participant not found" });
    }

    participant.saved = participant.saved || [];

    if (!participant.saved.includes(targetId)) {
      participant.saved.push(targetId);
    }

    const { resource: updated } = await container
      .item(participant.id, participant.event_id)
      .replace(participant);

    return res.json({
      message: "Saved successfully",
      saved: updated.saved,
    });
  } catch (error) {
    console.error("Save error:", error.message);
    return res.status(500).json({
      message: "Save failed",
      error: error.message,
    });
  }
});

// UNSAVE - remove targetId from saved[]
router.delete("/:id/save/:targetId", async (req, res) => {
  try {
    const { id, targetId } = req.params;

    const participant = await getParticipantById(id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    participant.saved = (participant.saved || []).filter(
      (item) => item !== targetId
    );

   const partitionKey = participant.id;

if (!partitionKey) {
  throw new Error("Missing partition key (event_id)");
}

const { resource: updated } = await container
  .item(participant.id, partitionKey)
  .replace(participant);
    return res.json({
      message: "Removed from saved successfully",
      saved: updated.saved,
    });
  } catch (error) {
    console.error("Unsave error:", error.message);
    return res.status(500).json({
      message: "Unsave failed",
      error: error.message,
    });
  }
});

// MET - add targetId to met[]
router.post("/:id/met/:targetId", async (req, res) => {
  try {
    const { id, targetId } = req.params;

    if (id === targetId) {
      return res.status(400).json({ message: "Cannot mark yourself as met" });
    }

    const participant = await getParticipantById(id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const targetParticipant = await getParticipantById(targetId);
    if (!targetParticipant) {
      return res.status(404).json({ message: "Target participant not found" });
    }

    participant.met = participant.met || [];

    if (!participant.met.includes(targetId)) {
      participant.met.push(targetId);
    }
const partitionKey = participant.id;

if (!partitionKey) {
  throw new Error("Missing partition key (event_id)");
}

const { resource: updated } = await container
  .item(participant.id, partitionKey)
  .replace(participant);replace(participant)

    return res.json({
      message: "Met saved successfully",
      met: updated.met,
    });
  } catch (error) {
    console.error("Met error:", error.message);
    return res.status(500).json({
      message: "Met failed",
      error: error.message,
    });
  }
});

// UNMET - remove targetId from met[]
router.delete("/:id/met/:targetId", async (req, res) => {
  try {
    const { id, targetId } = req.params;

    const participant = await getParticipantById(id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    participant.met = (participant.met || []).filter(
      (item) => item !== targetId
    );

    const { resource: updated } = await container
      .item(participant.id, participant.event_id)
      .replace(participant);

    return res.json({
      message: "Removed from met successfully",
      met: updated.met,
    });
  } catch (error) {
    console.error("Unmet error:", error.message);
    return res.status(500).json({
      message: "Unmet failed",
      error: error.message,
    });
  }
});

// Get participant by id
router.get("/:id", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json(mapParticipant(participant));
  } catch (error) {
    console.error("Get participant by id error:", error.message);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

module.exports = router;
