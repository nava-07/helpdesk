const express = require("express");
const Ticket = require("../models/Ticket");
const Team = require("../models/Team");
const { protect, admin, support } = require("../middleware/authMiddleware");

const router = express.Router();

// Helper: check if a Support user is on the team assigned to this ticket
async function isOnAssignedTeam(userId, ticket) {
  if (!ticket.assignedTeam) return false;
  const team = await Team.findById(ticket.assignedTeam);
  if (!team) return false;
  return team.members.some(m => m.toString() === userId.toString());
}

// ===============================
// CREATE a new ticket
// POST /api/tickets
// ===============================
router.post("/", protect, async (req, res) => {
  try {
    const {
      title,
      category,
      priority,
      description
    } = req.body;

    // Profile validation check before ticket creation
    if (typeof req.user.hasCompleteProfile === "function" && !req.user.hasCompleteProfile()) {
      return res.status(403).json({
        message: "Profile incomplete. Please update your full profile before creating a ticket."
      });
    }

    if (!title || !category || !description) {
      return res.status(400).json({
        message: "Title, category and description are required"
      });
    }

    // Auto-routing logic (find a team that focuses on this category)
    const team = await Team.findOne({ categoryFocus: category });
    const assignedTeam = team ? team._id : null;

    const ticket = await Ticket.create({
      title,
      category,
      priority,
      description,
      status: "Open",
      createdBy: req.user.name,
      employeeId: req.user._id,
      employeeName: req.user.name,
      employeeEmpId: req.user.employee_id,
      contact: req.user.mobile_number,
      assignedTeam,
      history: [{
        action: "Created",
        user: req.user._id,
        userName: req.user.name,
        details: "Ticket has been created"
      }]
    });

    // Emit event when created
    const io = req.app.get("io");
    if (io) {
      io.emit("ticketCreated", ticket);
    }

    res.status(201).json(ticket);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create ticket",
      error: error.message
    });
  }
});

// ===============================
// GET all tickets (Admin sees all, Staff sees own)
// GET /api/tickets
// ===============================
router.get("/", protect, async (req, res) => {
  try {
    let tickets;
    if (req.user.role === "Admin" || req.user.role === "Support") {
      tickets = await Ticket.find()
        .populate("assignedTeam", "name")
        .sort({ createdAt: -1 });
    } else {
      tickets = await Ticket.find({ employeeId: req.user._id })
        .populate("assignedTeam", "name")
        .sort({ createdAt: -1 });
    }
    
    res.json(tickets);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch tickets",
      error: error.message
    });
  }
});

// ===============================
// GET analytics (Admin Only)
// GET /api/tickets/analytics
// ===============================
router.get("/analytics", protect, support, async (req, res) => {
  try {
    const totalTickets = await Ticket.countDocuments();
    const stats = await Ticket.aggregate([
      {
        $facet: {
          "statusCounts": [
            { $group: { _id: "$status", count: { $sum: 1 } } }
          ],
          "priorityCounts": [
            { $group: { _id: "$priority", count: { $sum: 1 } } }
          ],
          "categoryCounts": [
            { $group: { _id: "$category", count: { $sum: 1 } } }
          ],
          "dailyTrend": [
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
            { $limit: 30 }
          ],
          "teamCounts": [
            { $group: { _id: "$assignedTeam", count: { $sum: 1 } } }
          ]
        }
      }
    ]);
    res.json({ totalTickets, ...stats[0] });
  } catch (error) {
    res.status(500).json({ message: "Analytics failed", error: error.message });
  }
});

// ===============================
// GET team-specific analytics (Support/Admin)
// GET /api/tickets/team-analytics/:teamId
// ===============================
router.get("/team-analytics/:teamId", protect, support, async (req, res) => {
  try {
    const { teamId } = req.params;
    const stats = await Ticket.aggregate([
      { $match: { assignedTeam: require("mongoose").Types.ObjectId.createFromHexString(teamId) } },
      {
        $facet: {
          "statusCounts": [
            { $group: { _id: "$status", count: { $sum: 1 } } }
          ],
          "priorityCounts": [
            { $group: { _id: "$priority", count: { $sum: 1 } } }
          ],
          "total": [
            { $count: "count" }
          ]
        }
      }
    ]);
    res.json(stats[0]);
  } catch (error) {
    res.status(500).json({ message: "Team analytics failed", error: error.message });
  }
});

// ===============================
// GET ticket by ID
// GET /api/tickets/:id
// ===============================
router.get("/:id", protect, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate("assignedTeam", "name")
      .populate("assignedMembers", "name role")
      .populate("history.user", "name role");

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Access control: admin, creator, or support on assigned team can view
    if (req.user.role !== "Admin" && req.user.role !== "Support" && ticket.employeeId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Access denied" });
    }
    // If support, verify they are on the assigned team
    if (req.user.role === "Support" && ticket.employeeId.toString() !== req.user._id.toString()) {
      const onTeam = await isOnAssignedTeam(req.user._id, ticket);
      if (!onTeam) return res.status(403).json({ message: "Access denied — not on assigned team" });
    }

    res.json(ticket);
  } catch (error) {
    res.status(500).json({
      message: "Invalid ticket ID",
      error: error.message
    });
  }
});

// ===============================
// UPDATE ticket status
// PUT /api/tickets/:id
// ===============================
router.put("/:id", protect, async (req, res) => {
  try {
    const { status } = req.body;

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Admin can update any. Support can update only their team's tickets
    if (req.user.role === "Support") {
      const onTeam = await isOnAssignedTeam(req.user._id, ticket);
      if (!onTeam) return res.status(403).json({ message: "You can only update tickets assigned to your team" });
    }

    ticket.status = status;
    ticket.history.push({
      action: "Status Changed",
      user: req.user._id,
      userName: req.user.name,
      details: `Status updated to ${status}`
    });

    const updatedTicket = await ticket.save();
    
    // Emit event
    const io = req.app.get("io");
    if (io) {
      io.emit("ticketUpdated", updatedTicket);
    }

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===============================
// ASSIGN TEAMS (Admin Only)
// PUT /api/tickets/:id/assign
// ===============================
router.put("/:id/assign", protect, async (req, res) => {
  try {
    const { teamId } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    ticket.assignedTeam = teamId;
    ticket.history.push({
      action: "Assigned",
      user: req.user._id,
      userName: req.user.name,
      details: `Ticket assigned to Team: ${team.name}`
    });

    const updatedTicket = await ticket.save();

    // Emit event
    const io = req.app.get("io");
    if (io) {
      io.emit("ticketAssigned", updatedTicket);
      // Can also trigger general update for clients just watching all updates
      io.emit("ticketUpdated", updatedTicket);
    }

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===============================
// ASSIGN MEMBERS TO TICKET (Admin Only)
// PUT /api/tickets/:id/assign-members
// ===============================
router.put("/:id/assign-members", protect, admin, async (req, res) => {
  try {
    const { memberIds } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    ticket.assignedMembers = memberIds;
    ticket.history.push({
      action: "Members Assigned",
      user: req.user._id,
      userName: req.user.name,
      details: `${memberIds.length} member(s) assigned to this ticket`
    });

    const updatedTicket = await ticket.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("ticketUpdated", updatedTicket);
    }

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===============================
// DELETE ticket
// DELETE /api/tickets/:id
// ===============================
router.delete("/:id", protect, admin, async (req, res) => {
  try {
    const deleted = await Ticket.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.json({ message: "Ticket deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// ===============================
// POST ticket history/update
// POST /api/tickets/:id/history
// ===============================
router.post("/:id/history", protect, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: "Update message is required" });

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    ticket.history.push({
      action: "Update Posted",
      user: req.user._id,
      userName: req.user.name,
      details: message
    });

    const updatedTicket = await ticket.save();

    // Emit event
    const io = req.app.get("io");
    if (io) {
      io.emit("ticketUpdated", updatedTicket);
    }

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;