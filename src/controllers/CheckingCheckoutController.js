//src/controllers/CheckingCheckoutController.js

const Booking = require('../models/Booking');
const { calculateDistance } = require('../utils/geoUtils');
const { fireEvent, EVENTS } = require('../events/NotificationEvents');

// ============================================
// PUT /api/bookings/:id/checkin — Check In (Geofenced)
// ============================================
const checkIn = async (req, res) => {
  try {
    const { driverLocation } = req.body;
    const CHECK_IN_RADIUS_TOLERANCE_METERS = 50;

    if (!driverLocation || driverLocation.lat == null || driverLocation.lng == null) {
      return res.status(400).json({
        error: 'Driver location (lat, lng) is required for check-in.'
      });
    }

    const existing = await Booking.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Booking not found.' });
    if (existing.driver_id !== req.user.id) {
      return res.status(403).json({ error: 'This is not your booking.' });
    }

    if (existing.booking_status !== 'confirmed') {
      return res.status(400).json({
        error: `Cannot check in. Booking status is: ${existing.booking_status}. Must be 'confirmed'.`
      });
    }

    const distance = calculateDistance(
      parseFloat(driverLocation.lat),
      parseFloat(driverLocation.lng),
      parseFloat(existing.spot_latitude),
      parseFloat(existing.spot_longitude)
    );

    if (distance > CHECK_IN_RADIUS_TOLERANCE_METERS) {
      return res.status(400).json({
        error: `Too far from the spot. Calculated distance: ${Math.round(distance)} meters.`,
        currentDistance: Math.round(distance)
      });
    }

    const booking = await Booking.checkIn(req.params.id);
    if (!booking) {
      return res.status(409).json({
        error: 'Booking has already been checked in or is invalid.'
      });
    }

    //FIRE EVENT FOR CHECK IN
    await fireEvent(EVENTS.CHECK_IN, booking.user_id, {
      spotName: booking.spot_name
    });

    res.json({
      message: 'Checked in successfully. Parking timer started!',
      distance: Math.round(distance),
      booking
    });
  } catch (error) {
    console.error('checkIn error:', error);
    res.status(500).json({ error: 'Failed to check in.' });
  }
};

// ============================================
// PUT /api/bookings/:id/checkout — Check Out
// ============================================
const checkOut = async (req, res) => {
  try {
    const existing = await Booking.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Booking not found.' });
    if (existing.driver_id !== req.user.id) {
      return res.status(403).json({ error: 'This is not your booking.' });
    }

    if (existing.booking_status !== 'active') {
      return res.status(400).json({
        error: `Cannot check out. Booking status is: ${existing.booking_status}. Must be 'active'.`
      });
    }

    const booking = await Booking.checkOut(req.params.id);
    if (!booking) return res.status(400).json({ error: 'Check-out failed.' });

    const hasOvertime = parseFloat(booking.overtime_hours) > 0;
    
    //FIRE EVENT FOR CHECK OUT
    await fireEvent(EVENTS.CHECK_OUT, booking.user_id, {
      spotName: booking.spot_name
    });
    res.json({
      message: hasOvertime
        ? `Checked out. You stayed ${booking.overtime_hours} hours extra.`
        : 'Checked out on time!',
      booking,
      summary: {
        expectedDuration: parseFloat(booking.expected_duration_hours),
        actualDuration: parseFloat(booking.actual_duration_hours),
        overtimeHours: parseFloat(booking.overtime_hours),
        expectedPrice: parseFloat(booking.expected_price_xrp),
        overtimePrice: parseFloat(booking.overtime_price_xrp),
        totalPrice: parseFloat(booking.total_price_xrp),
        adminFee: parseFloat(booking.admin_fee_xrp),
        sellerAmount: parseFloat(booking.seller_amount_xrp)
      }
    });
  } catch (error) {
    console.error('checkOut error:', error);
    res.status(500).json({ error: 'Failed to check out.' });
  }
};

module.exports = {
  checkIn,
  checkOut
};