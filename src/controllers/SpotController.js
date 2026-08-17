// src/controllers/SpotController.js
// ============================================
// SPOT CONTROLLER
// ============================================
// Handles HTTP requests for parking spots

const Spot = require('../models/Spot');
const KybSubmission = require('../models/KybSubmission');
const { query } = require('../config/db');
const { fireEvent, EVENTS } = require('../events/NotificationEvents');

// ============================================
// POST /api/spots — Create a new spot (seller only)
// ============================================

// Normalize incoming multipart values to arrays
const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();

    // Supports JSON string arrays: '["Car","Bike"]'
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fall through to single-item array
      }
    }

    return [value];
  }

  return [value];
};

// POST /api/spots — Create a new spot (seller only)
const createSpot = async (req, res) => {
  try {
    const {
      kybSubmissionId,
      title,
      description,
      address,
      latitude,
      longitude,
      vehicleTypes,
      slotsPerType,
      pricesPerHour,
      imageUrls,
    } = req.body;

    const uploadedImageUrls =
      Array.isArray(req.files) && req.files.length > 0
        ? req.files.map((file) => file.path)
        : toArray(imageUrls);

    let resolvedTitle = title;
    let resolvedAddress = address;

    if (kybSubmissionId) {
      const kyb = await KybSubmission.findById(kybSubmissionId);

      if (!kyb || kyb.owner_id !== req.user.id) {
        return res.status(404).json({ error: 'KYB submission not found.' });
      }

      if (kyb.status !== 'approved') {
        return res.status(403).json({ error: 'KYB must be approved before creating a spot.' });
      }

      const existingSpot = await Spot.findByKybSubmissionId(kybSubmissionId);

      if (existingSpot) {
        return res.status(409).json({ error: 'Spot already created for this KYB submission.' });
      }

      resolvedTitle = kyb.entity_name;
      resolvedAddress = kyb.address;
    }

    // Required fields
    if (!resolvedTitle || !resolvedAddress || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        error: 'Required fields: title, address, latitude, longitude',
      });
    }

    const parsedLatitude = parseFloat(latitude);
    const parsedLongitude = parseFloat(longitude);

    if (Number.isNaN(parsedLatitude) || Number.isNaN(parsedLongitude)) {
      return res.status(400).json({
        error: 'latitude and longitude must be numbers',
      });
    }

    // Normalize arrays BEFORE validation
    const rawVehicleTypes = toArray(vehicleTypes).map((item) => String(item).trim());
    const rawSlotsPerType = toArray(slotsPerType).map((item) => Number(item));
    const rawPricesPerHour = toArray(pricesPerHour).map((item) => Number(item));

    if (
      rawVehicleTypes.length !== rawSlotsPerType.length ||
      rawVehicleTypes.length !== rawPricesPerHour.length
    ) {
      return res.status(400).json({
        error: 'vehicleTypes, slotsPerType, and pricesPerHour must have the same length',
      });
    }

    // Keep only complete rows; ignore default/unfilled rows (0/0)
    const completeRows = rawVehicleTypes
      .map((type, index) => ({
        type,
        slots: rawSlotsPerType[index],
        price: rawPricesPerHour[index],
      }))
      .filter(
        (row) =>
          row.type.length > 0 &&
          Number.isFinite(row.slots) &&
          Number.isFinite(row.price) &&
          row.slots > 0 &&
          row.price > 0
      );

    if (completeRows.length === 0) {
      return res.status(400).json({
        error: 'Must provide at least one complete row (vehicle type, slot count, hourly rate)',
      });
    }

    const cleanVehicleTypes = completeRows.map((row) => row.type);
    const cleanSlotsPerType = completeRows.map((row) => parseInt(row.slots, 10));
    const cleanPricesPerHour = completeRows.map((row) => parseFloat(row.price));
    const computedTotalSlots = cleanSlotsPerType.reduce((sum, slot) => sum + slot, 0);

    const spot = await Spot.create({
      ownerId: req.user.id,
      kybSubmissionId: kybSubmissionId || null,
      title: String(resolvedTitle).trim(),
      description: String(description || '').trim(),
      address: String(resolvedAddress).trim(),
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      vehicleTypes: cleanVehicleTypes,
      slotsPerType: cleanSlotsPerType,
      pricesPerHour: cleanPricesPerHour,
      imageUrls: uploadedImageUrls,
      totalSlots: computedTotalSlots,
    });

    const vehicleTypeCount = cleanVehicleTypes.length;
    const spotTitle = spot?.title || String(title).trim();
    console.log(`🅿️ New spot created: "${spotTitle}" with ${vehicleTypeCount} vehicle types`);

    return res.status(201).json({
      message: 'Spot created successfully and approved.',
      spot,
    });
  } catch (error) {
    console.error('Create spot error:', error.message);
    return res.status(500).json({ error: 'Failed to create spot.' });
  }
};

/*module.exports = {
  createSpot,
};*/

// ============================================
// GET /api/spots — Get spots (different views per role)
// ============================================
const getSpots = async (req, res) => {
  try {
    // If user is authenticated, show role-specific view
    // If not authenticated (public), show available spots only
    if (req.user && req.user.role === 'admin') {
      // Admin sees ALL spots
      const spots = await Spot.findAll();
      return res.json({ spots, total: spots.length });
    }

    if (req.user && req.user.role === 'seller') {
      // Seller sees only THEIR spots
      const spots = await Spot.findByOwner(req.user.id);
      return res.json({ spots, total: spots.length });
    }

    // Drivers and public see only available + approved spots
    const spots = await Spot.findAvailable();
    res.json({ spots, total: spots.length });

  } catch (error) {
    console.error('Get spots error:', error.message);
    res.status(500).json({ error: 'Failed to fetch spots.' });
  }
};

// ============================================
// GET /api/spots/:id — Get spot details
// ============================================
const getSpotById = async (req, res) => {
  try {
    const spot = await Spot.findById(req.params.id);

    if (!spot) {
      return res.status(404).json({ error: 'Spot not found.' });
    }

    res.json({ spot });

  } catch (error) {
    console.error('Get spot error:', error.message);
    res.status(500).json({ error: 'Failed to fetch spot.' });
  }
};

// ============================================
// PUT /api/spots/:id — Update spot (seller only)
// ============================================
const updateSpot = async (req, res) => {
  try {
    const updates = { ...req.body };
    // ── Images ────────────────────────────────────────────────────────────────
    const uploadedImageUrls =
      Array.isArray(req.files) && req.files.length > 0
        ? req.files.map((file) => file.path)
        : null;
    if (uploadedImageUrls) {
      updates.imageUrls = uploadedImageUrls;
    } else if (updates.imageUrls !== undefined) {
      updates.imageUrls = toArray(updates.imageUrls)
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
    }
    // ── Fetch current spot ────────────────────────────────────────────────────
    const currentSpot = await Spot.findById(req.params.id);
    if (!currentSpot || currentSpot.owner_id !== req.user.id) {
      return res.status(404).json({ error: 'Spot not found or you do not own this spot.' });
    }
    // ── Pricing update ────────────────────────────────────────────────────────
    if (updates.pricesPerHour !== undefined) {
      const parsedPrices = toArray(updates.pricesPerHour).map((price) => Number(price));
      const hasInvalidPrice = parsedPrices.some((price) => !Number.isFinite(price) || price <= 0);
      if (hasInvalidPrice) {
        return res.status(400).json({ error: 'Each hourly rate must be a number greater than 0.' });
      }
      updates.pricesPerHour = parsedPrices.map((price) => parseFloat(price));
    }
    // ── Slot-count / vehicle-type update with sweep-line validation ───────────
    if (updates.vehicleTypes !== undefined || updates.slotsPerType !== undefined) {
      const rawVehicleTypes = toArray(updates.vehicleTypes).map((t) => String(t).trim());
      const rawSlotsPerType = toArray(updates.slotsPerType).map((s) => parseInt(s, 10));
      const rawPricesPerHour = updates.pricesPerHour
        ? toArray(updates.pricesPerHour).map((p) => parseFloat(p))
        : toArray(currentSpot.prices_per_hour).map((p) => parseFloat(p));
      if (rawVehicleTypes.length !== rawSlotsPerType.length) {
        return res.status(400).json({ error: 'vehicleTypes and slotsPerType arrays must be the same length.' });
      }
      // Fetch all future/active bookings for this spot to ensure no type is reduced below its max concurrent bookings
      const now = new Date();
      const bookingsResult = await query(
        `SELECT vehicle_type, start_time, end_time
         FROM bookings
         WHERE spot_id = $1
           AND booking_status IN ('pending', 'confirmed', 'active')
           AND end_time > $2`,
        [req.params.id, now]
      );

      // Group by vehicle type
      const groups = {};
      for (const b of bookingsResult.rows) {
        if (!b.vehicle_type) continue;
        const key = b.vehicle_type.trim().toLowerCase();
        if (!groups[key]) groups[key] = [];
        groups[key].push({ start: new Date(b.start_time), end: new Date(b.end_time) });
      }

      // Check maxOccupied against new slots for every vehicle type that has upcoming bookings
      for (const [type, intervals] of Object.entries(groups)) {
        const events = [];
        for (const iv of intervals) {
          events.push({ time: iv.start.getTime(), delta: 1 });
          events.push({ time: iv.end.getTime(), delta: -1 });
        }
        events.sort((a, b) => {
          const timeDiff = a.time - b.time;
          if (timeDiff === 0) return a.delta - b.delta;
          return timeDiff;
        });

        let current = 0;
        let maxOccupied = 0;
        for (const ev of events) {
          current += ev.delta;
          if (current > maxOccupied) maxOccupied = current;
        }

        if (maxOccupied > 0) {
          // Find this vehicle type in the submitted new slots
          const idx = rawVehicleTypes.findIndex((t) => t.toLowerCase() === type);
          const newSlots = idx !== -1 ? rawSlotsPerType[idx] : 0;

          if (newSlots < maxOccupied) {
            return res.status(400).json({
              error: `Cannot reduce ${type} slots to ${newSlots}. Maximum concurrent bookings is ${maxOccupied}.`,
              vehicleType: type,
              maxOccupied,
            });
          }
        }
      }
      // All checks passed — persist slot structure
      updates.vehicleTypes = rawVehicleTypes;
      updates.slotsPerType = rawSlotsPerType;
      updates.pricesPerHour = rawPricesPerHour;
      updates.totalSlots = rawSlotsPerType.reduce((sum, s) => sum + s, 0);
    } else {
      // No slot changes sent — don't accidentally clear them
      delete updates.vehicleTypes;
      delete updates.slotsPerType;
      delete updates.totalSlots;
    }
    // ── Persist ───────────────────────────────────────────────────────────────
    const spot = await Spot.update(req.params.id, req.user.id, updates);
    if (!spot) {
      return res.status(404).json({ error: 'Spot not found or you do not own this spot.' });
    }
    res.json({ message: 'Spot updated.', spot });
  } catch (error) {
    console.error('Update spot error:', error.message);
    res.status(500).json({ error: 'Failed to update spot.' });
  }
};

// ============================================
// PUT /api/spots/:id/toggle — Toggle availability (seller)
// ============================================
const toggleAvailability = async (req, res) => {
  try {
    const spot = await Spot.toggleAvailability(req.params.id, req.user.id);

    if (!spot) {
      return res.status(404).json({
        error: 'Spot not found or you do not own this spot.'
      });
    }

    res.json({
      message: `Spot is now ${spot.is_available ? 'available' : 'unavailable'}.`,
      spot
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle availability.' });
  }
};

// ============================================
// PUT /api/spots/:id/approve — Approve spot (admin only)
// ============================================
const approveSpot = async (req, res) => {
  try {
    const spot = await Spot.approve(req.params.id);

    if (!spot) {
      return res.status(404).json({ error: 'Spot not found.' });
    }

    console.log(`Spot approved: "${spot.title}"`);

    res.json({ message: 'Spot approved successfully.', spot });

  } catch (error) {
    res.status(500).json({ error: 'Failed to approve spot.' });
  }
};

// ============================================
// DELETE /api/spots/:id/reject — Reject spot (admin only)
// ============================================
const rejectSpot = async (req, res) => {
  try {
    const spot = await Spot.reject(req.params.id);

    if (!spot) {
      return res.status(404).json({ error: 'Spot not found.' });
    }

    console.log(`Spot rejected: "${spot.title}"`);

    res.json({ message: 'Spot rejected and removed.', spot });

  } catch (error) {
    res.status(500).json({ error: 'Failed to reject spot.' });
  }
};

// ============================================
// PUT /api/spots/:id/admin-toggle — Toggle spot active status (admin only)
// ============================================
const adminToggleSpot = async (req, res) => {
  try {
    const spotId = req.params.id;
    const { is_active, is_available } = req.body;
    const nextAvailability =
      typeof is_active === 'boolean'
        ? is_active
        : is_available;

    if (typeof nextAvailability !== 'boolean') {
      return res.status(400).json({ error: 'is_active or is_available must be a boolean.' });
    }

    // Use existing schema column: spots.is_available
    const result = await query(
      'UPDATE spots SET is_available = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [nextAvailability, spotId]
    );

    const updatedSpot = result.rows[0];

    if (!updatedSpot) {
      return res.status(404).json({ error: 'Spot not found.' });
    }

    console.log(`🛡️ Admin ${nextAvailability ? 'Activated' : 'Blocked'} spot: "${updatedSpot.title}"`);

    res.json({
      message: `Spot is now ${updatedSpot.is_available ? 'Active' : 'Blocked'}.`,
      spot: updatedSpot
    });

  } catch (error) {
    console.error('Admin toggle spot error:', error.message);
    res.status(500).json({ error: 'Failed to toggle spot status.' });
  }
};


// ============================================
// DELETE /api/spots/:id — Delete spot (seller only)
// ============================================
const deleteSpot = async (req, res) => {
  try {
    const spotId = req.params.id;
    const ownerId = req.user.id;

    // 1. FIRST, get the KYB substitution ID attached to this spot
    // (Adjust the SQL based on your actual table/column names)
    const result = await query(
      'SELECT kyb_submission_id FROM spots WHERE id = $1 AND owner_id = $2',
      [spotId, ownerId]
    );

    // Check if the spot exists before continuing
    const spotData = result.rows[0];
    if (!spotData) {
      return res.status(404).json({ error: 'Spot not found or you do not own this spot.' });
    }

    const kybSubmissionId = spotData.kyb_submission_id;

    // 2. THEN, delete the spot
    await Spot.delete(spotId, ownerId);

    // 3. FINALLY, safely delete the KYB submission record if it exists
    if (kybSubmissionId) {
      await query(
        'DELETE FROM kyb_submissions WHERE id = $1',
        [kybSubmissionId]
      );
    }

    res.json({ message: 'Spot and associated KYB data deleted successfully.' });

  } catch (error) {
    console.error("Error deleting spot:", error);
    res.status(500).json({ error: 'Failed to delete spot.' });
  }
};


// ============================================
// GET /api/spots/pending — Get pending spots (admin only)
// ============================================
const getPendingSpots = async (req, res) => {
  try {
    const spots = await Spot.findPendingApproval();
    res.json({ spots, total: spots.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending spots.' });
  }
};

// ============================================
// GET /api/spots/:id/min-slots — Min safe slots per vehicle type (seller only)
// ============================================
const getMinSlotsPerType = async (req, res) => {
  try {
    const spotId = req.params.id;
    const now = new Date();
    // Get all future/active bookings for this spot
    const bookingsResult = await query(
      `SELECT vehicle_type, start_time, end_time
       FROM bookings
       WHERE spot_id = $1
         AND booking_status IN ('pending', 'confirmed', 'active')
         AND end_time > $2`,
      [spotId, now]
    );
    // Group by vehicle type and run sweep-line
    const groups = {};
    for (const b of bookingsResult.rows) {
      if (!b.vehicle_type) continue;
      const key = b.vehicle_type.trim().toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push({ start: new Date(b.start_time), end: new Date(b.end_time) });
    }
    const minSlotsPerType = {};
    for (const [type, intervals] of Object.entries(groups)) {
      const events = [];
      for (const iv of intervals) {
        events.push({ time: iv.start.getTime(), delta: 1 });
        events.push({ time: iv.end.getTime(), delta: -1 });
      }
      events.sort((a, b) => {
        const timeDiff = a.time - b.time;
        if (timeDiff === 0) return a.delta - b.delta;
        return timeDiff;
      });
      let current = 0, maxOccupied = 0;
      for (const ev of events) {
        current += ev.delta;
        if (current > maxOccupied) maxOccupied = current;
      }
      minSlotsPerType[type] = maxOccupied;
    }
    res.json({ minSlotsPerType });
  } catch (error) {
    console.error('Get min slots error:', error.message);
    res.status(500).json({ error: 'Failed to compute min slots.' });
  }
};

// ============================================
// POST /api/spots/:id/check-conflicts — Check block conflicts (seller only)
// ============================================
const checkSpotConflicts = async (req, res) => {
  try {
    const spotId = req.params.id;
    const { startDateTime, endDateTime } = req.body;

    if (!startDateTime || !endDateTime) {
      return res.status(400).json({ error: 'startDateTime and endDateTime are required.' });
    }

    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return res.status(400).json({ error: 'Invalid start or end time.' });
    }

    // Overlap condition: booking.start_time < block.end_time AND booking.end_time > block.start_time
    const conflictResult = await query(
      `SELECT id 
       FROM bookings 
       WHERE spot_id = $1 
         AND booking_status IN ('pending', 'confirmed', 'active')
         AND start_time < $3 
         AND end_time > $2
       LIMIT 1`,
      [spotId, start, end]
    );

    res.json({ hasConflict: conflictResult.rows.length > 0 });
  } catch (error) {
    console.error('Check conflicts error:', error.message);
    res.status(500).json({ error: 'Failed to check conflicts.' });
  }
};

// ============================================
// POST /api/spots/:id/block — Block spot (seller only)
// ============================================
const blockSpot = async (req, res) => {
  try {
    const spotId = req.params.id;
    const { startDateTime, endDateTime, reason } = req.body;

    if (!startDateTime || !endDateTime) {
      return res.status(400).json({ error: 'startDateTime and endDateTime are required.' });
    }

    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return res.status(400).json({ error: 'Invalid start or end time.' });
    }

    const spot = await Spot.findById(spotId);
    if (!spot || spot.owner_id !== req.user.id) {
      return res.status(404).json({ error: 'Spot not found or unauthorized.' });
    }

    if (spot.is_blocked_by_seller) {
      return res.status(400).json({ error: 'Spot is already blocked. Wait for the current block to end.' });
    }

    // Double check conflicts
    const conflictResult = await query(
      `SELECT id FROM bookings WHERE spot_id = $1 AND booking_status IN ('pending', 'confirmed', 'active') AND start_time < $3 AND end_time > $2 LIMIT 1`,
      [spotId, start, end]
    );

    if (conflictResult.rows.length > 0) {
      return res.status(409).json({ error: 'Cannot block spot due to overlapping active bookings.' });
    }

    await query(
      `UPDATE spots SET is_blocked_by_seller = true, block_start_time = $1, block_end_time = $2, block_reason = $3, updated_at = NOW() WHERE id = $4`,
      [start, end, reason || null, spotId]
    );

    res.json({ success: true, message: 'Spot blocked successfully' });
  } catch (error) {
    console.error('Block spot error:', error.message);
    res.status(500).json({ error: 'Failed to block spot.' });
  }
};

// ============================================
// POST /api/spots/:id/unblock — Unblock spot (seller only)
// ============================================
const unblockSpot = async (req, res) => {
  try {
    const spotId = req.params.id;

    const spot = await Spot.findById(spotId);
    if (!spot || spot.owner_id !== req.user.id) {
      return res.status(404).json({ error: 'Spot not found or unauthorized.' });
    }

    await query(
      `UPDATE spots SET is_blocked_by_seller = false, block_start_time = null, block_end_time = null, block_reason = null, updated_at = NOW() WHERE id = $1`,
      [spotId]
    );

    res.json({ success: true, message: 'Spot unblocked successfully' });
  } catch (error) {
    console.error('Unblock spot error:', error.message);
    res.status(500).json({ error: 'Failed to unblock spot.' });
  }
};

module.exports = {
  createSpot,
  getSpots,
  getSpotById,
  updateSpot,
  toggleAvailability,
  approveSpot,
  rejectSpot,
  deleteSpot,
  adminToggleSpot,
  getPendingSpots,
  getMinSlotsPerType,
  checkSpotConflicts,
  blockSpot,
  unblockSpot
};