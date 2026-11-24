const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Team = require("../models/Team");
const User = require("../models/User");
const Ticket = require("../models/Ticket");
const { protect, admin, support } = require("../middleware/authMiddleware");

// GET all teams (Admin + Support)
router.get("/", protect, support, async (req, res) => {
  try {
    const teams = await Team.find().populate("lead members", "name email employee_id role");
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

// GET my team (Support only)
router.get("/my-team", protect, async (req, res) => {
  try {
    const team = await Team.findOne({ members: req.user._id })
      .populate("lead members", "name email employee_id role");
    if (!team) return res.status(404).json({ error: "You are not assigned to any team" });
    res.json(team);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch your team" });
  }
});

// GET comprehensive team analytics (Admin)
router.get("/analytics", protect, support, async (req, res) => {
  try {
    const teams = await Team.find().populate("lead members", "name email employee_id role");
    const allTickets = await Ticket.find().populate("assignedTeam", "name");

    const totalTeams = teams.length;
    const totalMembers = new Set(teams.flatMap(t => t.members.map(m => m._id.toString()))).size;
    const totalTickets = allTickets.length;

    // Per-team analytics
    const teamAnalytics = teams.map(team => {
      const teamTickets = allTickets.filter(t => t.assignedTeam && t.assignedTeam._id.toString() === team._id.toString());
      const open = teamTickets.filter(t => ["Open", "Pending"].includes(t.status)).length;
      const inProgress = teamTickets.filter(t => t.status === "In Progress").length;
      const resolved = teamTickets.filter(t => ["Resolved", "Completed", "Closed"].includes(t.status)).length;
      const critical = teamTickets.filter(t => t.priority === "critical").length;
      const high = teamTickets.filter(t => t.priority === "high").length;

      // Per-member ticket counts within this team
      const memberStats = team.members.map(member => {
        const memberTickets = allTickets.filter(t =>
          t.assignedTeam && t.assignedTeam._id.toString() === team._id.toString() &&
          t.assignedMembers && t.assignedMembers.map(a => a.toString()).includes(member._id.toString())
        );
        return {
          _id: member._id,
          name: member.name,
          email: member.email,
          employee_id: member.employee_id,
          role: member.role,
          openTickets: memberTickets.filter(t => ["Open", "Pending", "In Progress"].includes(t.status)).length,
          resolvedTickets: memberTickets.filter(t => ["Resolved", "Completed", "Closed"].includes(t.status)).length,
          totalTickets: memberTickets.length
        };
      });

      return {
        _id: team._id,
        name: team.name,
        description: team.description,
        lead: team.lead,
        memberCount: team.members.length,
        categoryFocus: team.categoryFocus,
        totalTickets: teamTickets.length,
        open,
        inProgress,
        resolved,
        critical,
        high,
        completionRate: teamTickets.length > 0 ? Math.round((resolved / teamTickets.length) * 100) : 0,
        memberStats
      };
    });

    // Status distribution
    const statusDistribution = {};
    allTickets.forEach(t => {
      statusDistribution[t.status] = (statusDistribution[t.status] || 0) + 1;
    });

    // Priority distribution
    const priorityDistribution = {};
    allTickets.forEach(t => {
      priorityDistribution[t.priority] = (priorityDistribution[t.priority] || 0) + 1;
    });

    // Unassigned tickets
    const unassigned = allTickets.filter(t => !t.assignedTeam).length;

    res.json({
      totalTeams,
      totalMembers,
      totalTickets,
      unassigned,
      statusDistribution,
      priorityDistribution,
      teamAnalytics
    });
  } catch (error) {
    console.error("Team analytics error:", error);
    res.status(500).json({ error: "Failed to fetch team analytics" });
  }
});

// GET single team details with full ticket breakdown
router.get("/:id/details", protect, support, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate("lead members", "name email employee_id role");
    if (!team) return res.status(404).json({ error: "Team not found" });

    const teamTickets = await Ticket.find({ assignedTeam: team._id })
      .populate("assignedMembers", "name role")
      .sort({ createdAt: -1 });

    // Member workload
    const memberWorkload = team.members.map(member => {
      const mTickets = teamTickets.filter(t =>
        t.assignedMembers && t.assignedMembers.some(a => a._id.toString() === member._id.toString())
      );
      const openCount = mTickets.filter(t => ["Open", "Pending", "In Progress"].includes(t.status)).length;
      const resolvedCount = mTickets.filter(t => ["Resolved", "Completed", "Closed"].includes(t.status)).length;
      return {
        _id: member._id,
        name: member.name,
        email: member.email,
        employee_id: member.employee_id,
        role: member.role,
        openTickets: openCount,
        resolvedTickets: resolvedCount,
        totalTickets: mTickets.length,
        workloadPercent: Math.min(100, openCount * 20) // rough workload estimate
      };
    });

    res.json({
      team,
      tickets: teamTickets,
      memberWorkload,
      stats: {
        total: teamTickets.length,
        open: teamTickets.filter(t => ["Open", "Pending"].includes(t.status)).length,
        inProgress: teamTickets.filter(t => t.status === "In Progress").length,
        resolved: teamTickets.filter(t => ["Resolved", "Completed", "Closed"].includes(t.status)).length
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch team details" });
  }
});

// GET handler's team view — only their own team tickets + co-member work
router.get("/my-team/dashboard", protect, async (req, res) => {
  try {
    const team = await Team.findOne({ members: req.user._id })
      .populate("lead members", "name email employee_id role");
    if (!team) return res.status(404).json({ error: "You are not assigned to any team" });

    const teamTickets = await Ticket.find({ assignedTeam: team._id })
      .populate("assignedMembers", "name role")
      .sort({ createdAt: -1 });

    // Co-member work
    const coMemberWork = team.members.map(member => {
      const mTickets = teamTickets.filter(t =>
        t.assignedMembers && t.assignedMembers.some(a => a._id.toString() === member._id.toString())
      );
      return {
        _id: member._id,
        name: member.name,
        employee_id: member.employee_id,
        role: member.role,
        isMe: member._id.toString() === req.user._id.toString(),
        openTickets: mTickets.filter(t => ["Open", "Pending", "In Progress"].includes(t.status)).length,
        resolvedTickets: mTickets.filter(t => ["Resolved", "Completed", "Closed"].includes(t.status)).length,
        totalTickets: mTickets.length,
        recentActivity: mTickets.slice(0, 3).map(t => ({
          ticketId: t._id,
          title: t.title,
          status: t.status,
          priority: t.priority
        }))
      };
    });

    // My tickets
    const myTickets = teamTickets.filter(t =>
      t.assignedMembers && t.assignedMembers.some(a => a._id.toString() === req.user._id.toString())
    );

    res.json({
      team: {
        _id: team._id,
        name: team.name,
        description: team.description,
        lead: team.lead,
        memberCount: team.members.length,
        categoryFocus: team.categoryFocus
      },
      myTickets,
      allTeamTickets: teamTickets,
      coMemberWork,
      stats: {
        total: teamTickets.length,
        myOpen: myTickets.filter(t => ["Open", "Pending", "In Progress"].includes(t.status)).length,
        myResolved: myTickets.filter(t => ["Resolved", "Completed", "Closed"].includes(t.status)).length,
        teamOpen: teamTickets.filter(t => ["Open", "Pending"].includes(t.status)).length,
        teamInProgress: teamTickets.filter(t => t.status === "In Progress").length,
        teamResolved: teamTickets.filter(t => ["Resolved", "Completed", "Closed"].includes(t.status)).length
      }
    });
  } catch (error) {
    console.error("Handler dashboard error:", error);
    res.status(500).json({ error: "Failed to fetch handler dashboard" });
  }
});

// POST new team (Admin only)
router.post("/", protect, admin, async (req, res) => {
  try {
    const team = new Team(req.body);
    await team.save();
    const populated = await Team.findById(team._id).populate("lead members", "name email employee_id role");

    // Emit socket event
    const io = req.app.get("io");
    if (io) io.emit("teamCreated", populated);

    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ error: "Failed to create team", details: error.message });
  }
});

// PUT update team (Admin only)
router.put("/:id", protect, admin, async (req, res) => {
  try {
    const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate("lead members", "name email employee_id role");
    if (!team) return res.status(404).json({ error: "Team not found" });

    const io = req.app.get("io");
    if (io) io.emit("teamUpdated", team);

    res.json(team);
  } catch (error) {
    res.status(400).json({ error: "Failed to update team" });
  }
});

// PUT add member to team (Admin only)
router.put("/:id/add-member", protect, admin, async (req, res) => {
  try {
    const { userId } = req.body;
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: "Team not found" });

    // Remove user from any other team first
    await Team.updateMany(
      { members: userId },
      { $pull: { members: userId } }
    );

    // Add to this team
    if (!team.members.includes(userId)) {
      team.members.push(userId);
      await team.save();
    }

    const populated = await Team.findById(team._id).populate("lead members", "name email employee_id role");

    const io = req.app.get("io");
    if (io) io.emit("teamUpdated", populated);

    res.json(populated);
  } catch (error) {
    res.status(400).json({ error: "Failed to add member" });
  }
});

// PUT remove member from team (Admin only)
router.put("/:id/remove-member", protect, admin, async (req, res) => {
  try {
    const { userId } = req.body;
    const team = await Team.findByIdAndUpdate(
      req.params.id,
      { $pull: { members: userId } },
      { new: true }
    ).populate("lead members", "name email employee_id role");

    if (!team) return res.status(404).json({ error: "Team not found" });

    const io = req.app.get("io");
    if (io) io.emit("teamUpdated", team);

    res.json(team);
  } catch (error) {
    res.status(400).json({ error: "Failed to remove member" });
  }
});

// PUT set team lead (Admin only)
router.put("/:id/set-lead", protect, admin, async (req, res) => {
  try {
    const { userId } = req.body;
    const team = await Team.findByIdAndUpdate(
      req.params.id,
      { lead: userId },
      { new: true }
    ).populate("lead members", "name email employee_id role");

    if (!team) return res.status(404).json({ error: "Team not found" });

    const io = req.app.get("io");
    if (io) io.emit("teamUpdated", team);

    res.json(team);
  } catch (error) {
    res.status(400).json({ error: "Failed to set team lead" });
  }
});

// DELETE team (Admin only)
router.delete("/:id", protect, admin, async (req, res) => {
  try {
    const team = await Team.findByIdAndDelete(req.params.id);
    if (!team) return res.status(404).json({ error: "Team not found" });

    // Unassign tickets from deleted team
    await Ticket.updateMany(
      { assignedTeam: req.params.id },
      { $unset: { assignedTeam: "" } }
    );

    const io = req.app.get("io");
    if (io) io.emit("teamDeleted", { teamId: req.params.id });

    res.json({ message: "Team removed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete team" });
  }
});

module.exports = router;
