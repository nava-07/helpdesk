const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Ticket = require("../models/Ticket");
const { protect, admin, support } = require("../middleware/authMiddleware");

// GET all employees (Admin only)
router.get("/employees", protect, admin, async (req, res) => {
  try {
    const employees = await User.find({ role: "Employee" }).select("-password -home_address");
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch employees" });
  }
});

// GET all supporters (Admin + Support)
router.get("/supporters", protect, support, async (req, res) => {
  try {
    const supporters = await User.find({ role: "Support" }).select("-password -home_address");
    res.json(supporters);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch supporters" });
  }
});

// GET all users (Admin only)
router.get("/all", protect, admin, async (req, res) => {
  try {
    const users = await User.find().select("-password -home_address");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// GET tickets for a specific user (Admin/Support)
router.get("/:id/tickets", protect, support, async (req, res) => {
  try {
    const tickets = await Ticket.find({ employeeId: req.params.id })
      .populate("assignedTeam", "name")
      .sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user tickets" });
  }
});

// GET user profile by ID (Admin/Support — no address)
router.get("/:id", protect, support, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -home_address");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

module.exports = router;
