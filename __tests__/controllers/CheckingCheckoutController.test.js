/**
 * @fileoverview Unit tests for the CheckingCheckoutController.
 * Ensures proper handling of check-in/check-out processes, including geofencing validation,
 * ownership authorization, status checks, and data summary calculations.
 */

// Mock the model and utilities to isolate controller logic
jest.mock('../../src/models/Booking');
jest.mock('../../src/utils/geoUtils', () => ({
    calculateDistance: jest.fn(),
}));
jest.mock('../../src/events/NotificationEvents', () => ({
    fireEvent: jest.fn().mockResolvedValue(),
    EVENTS: {
        CHECK_IN: 'CHECK_IN',
        CHECK_OUT: 'CHECK_OUT',
    },
}));

const Booking = require('../../src/models/Booking');
const { calculateDistance } = require('../../src/utils/geoUtils');
const CheckingCheckoutController = require('../../src/controllers/CheckingCheckoutController');

/**
 * Generates a mock Express Request object.
 * @param {Object} overrides - Optional properties to override the default request structure.
 * @returns {Object} A mocked Express Request object.
 */
const mockReq = (overrides = {}) => ({
    body: {},
    params: { id: 'booking-123' },
    user: { id: 'driver-uuid' },
    ...overrides,
});

/**
 * Generates a mock Express Response object with chainable Jest spies.
 * @returns {Object} A mocked Express Response object containing `status` and `json` methods.
 */
const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe('CheckingCheckoutController', () => {
    // Ensure a clean state for mocks before every test to prevent test leakage
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('checkIn()', () => {
        
        // ==========================================
        // VALIDATION TESTS
        // ==========================================

        it('should return 400 if driverLocation is completely missing', async () => {
            // Arrange
            const req = mockReq({ body: {} });
            const res = mockRes();

            // Act
            await CheckingCheckoutController.checkIn(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Driver location (lat, lng) is required for check-in.',
            });
            expect(Booking.findById).not.toHaveBeenCalled();
        });

        it('should return 400 if driverLocation is missing lat or lng', async () => {
            // Arrange
            const req = mockReq({ body: { driverLocation: { lat: 10.0 } } }); // Missing lng
            const res = mockRes();

            // Act
            await CheckingCheckoutController.checkIn(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(Booking.findById).not.toHaveBeenCalled();
        });

        it('should return 404 if the booking does not exist', async () => {
            // Arrange
            const req = mockReq({ body: { driverLocation: { lat: 10.0, lng: 20.0 } } });
            const res = mockRes();
            Booking.findById.mockResolvedValue(null);

            // Act
            await CheckingCheckoutController.checkIn(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ error: 'Booking not found.' });
        });

        it('should return 403 if the user is not the owner of the booking', async () => {
            // Arrange
            const req = mockReq({ body: { driverLocation: { lat: 10.0, lng: 20.0 } } });
            const res = mockRes();
            Booking.findById.mockResolvedValue({
                id: 'booking-123',
                driver_id: 'different-user-uuid', // Mismatch with req.user.id
            });

            // Act
            await CheckingCheckoutController.checkIn(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: 'This is not your booking.' });
        });

        it('should return 409 if the booking status is not "confirmed"', async () => {
            // Arrange
            const req = mockReq({ body: { driverLocation: { lat: 10.0, lng: 20.0 } } });
            const res = mockRes();
            Booking.findById.mockResolvedValue({
                id: 'booking-123',
                driver_id: 'driver-uuid',
                booking_status: 'pending', // Invalid status for check-in
                spot_latitude: '10.0',
                spot_longitude: '20.0',
            });
            calculateDistance.mockReturnValue(5);
            Booking.checkIn.mockResolvedValue(null);

            // Act
            await CheckingCheckoutController.checkIn(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Booking has already been checked in or is invalid.',
            });
        });

        // ==========================================
        // GEOFENCING & BUSINESS LOGIC TESTS
        // ==========================================

        it('should return 400 if distance exceeds the 60-meter tolerance', async () => {
            // Arrange
            const req = mockReq({ body: { driverLocation: { lat: 10.0, lng: 20.0 } } });
            const res = mockRes();
            Booking.findById.mockResolvedValue({
                id: 'booking-123',
                driver_id: 'driver-uuid',
                booking_status: 'confirmed',
                spot_latitude: '10.001',
                spot_longitude: '20.001',
            });
            calculateDistance.mockReturnValue(75); // Distance is 75 meters (> 60m limit)

            // Act
            await CheckingCheckoutController.checkIn(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Too far from the spot. Calculated distance: 75 meters.',
                currentDistance: 75,
            });
            expect(Booking.checkIn).not.toHaveBeenCalled();
        });

        it('should return 409 if the database checkIn operation fails (returns falsy)', async () => {
            // Arrange
            const req = mockReq({ body: { driverLocation: { lat: 10.0, lng: 20.0 } } });
            const res = mockRes();
            Booking.findById.mockResolvedValue({
                id: 'booking-123',
                driver_id: 'driver-uuid',
                booking_status: 'confirmed',
                spot_latitude: '10.0',
                spot_longitude: '20.0',
            });
            calculateDistance.mockReturnValue(5); // Within tolerance
            Booking.checkIn.mockResolvedValue(null); // DB failure or already checked in

            // Act
            await CheckingCheckoutController.checkIn(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith({ error: 'Booking has already been checked in or is invalid.' });
        });

        it('should return 200 and success message when geofence passes and db updates', async () => {
            // Arrange
            const req = mockReq({ body: { driverLocation: { lat: 10.0, lng: 20.0 } } });
            const res = mockRes();
            Booking.findById.mockResolvedValue({
                id: 'booking-123',
                driver_id: 'driver-uuid',
                booking_status: 'confirmed',
                spot_latitude: '10.0',
                spot_longitude: '20.0',
            });
            calculateDistance.mockReturnValue(2); // 2 meters away
            
            const updatedBooking = { id: 'booking-123', booking_status: 'active' };
            Booking.checkIn.mockResolvedValue(updatedBooking);

            // Act
            await CheckingCheckoutController.checkIn(req, res);

            // Assert
            // Verify coordinate parsing passed exactly to util function
            expect(calculateDistance).toHaveBeenCalledWith(10.0, 20.0, 10.0, 20.0);
            expect(res.status).not.toHaveBeenCalledWith(400); // Ensures it bypassed errors
            expect(res.json).toHaveBeenCalledWith({
                message: 'Checked in successfully. Parking timer started!',
                distance: 2,
                booking: updatedBooking,
            });
        });

        // ==========================================
        // ERROR HANDLING TESTS
        // ==========================================

        it('should return 500 and log error when an exception is thrown', async () => {
            // Arrange
            const req = mockReq({ body: { driverLocation: { lat: 10.0, lng: 20.0 } } });
            const res = mockRes();
            
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            Booking.findById.mockRejectedValue(new Error('Database timeout'));

            // Act
            await CheckingCheckoutController.checkIn(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Failed to check in.' });
            expect(errorSpy).toHaveBeenCalledWith('checkIn error:', expect.any(Error));

            // Cleanup
            errorSpy.mockRestore();
        });
    });

    describe('checkOut()', () => {

        // ==========================================
        // VALIDATION TESTS
        // ==========================================

        it('should return 404 if the booking does not exist', async () => {
            // Arrange
            const req = mockReq();
            const res = mockRes();
            Booking.findById.mockResolvedValue(null);

            // Act
            await CheckingCheckoutController.checkOut(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ error: 'Booking not found.' });
        });

        it('should return 403 if the user is not the owner of the booking', async () => {
            // Arrange
            const req = mockReq();
            const res = mockRes();
            Booking.findById.mockResolvedValue({
                id: 'booking-123',
                driver_id: 'hacker-uuid', // Different user
            });

            // Act
            await CheckingCheckoutController.checkOut(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: 'This is not your booking.' });
        });

        it('should return 400 if the booking status is not "active"', async () => {
            // Arrange
            const req = mockReq();
            const res = mockRes();
            Booking.findById.mockResolvedValue({
                id: 'booking-123',
                driver_id: 'driver-uuid',
                booking_status: 'completed', // Already checked out
            });

            // Act
            await CheckingCheckoutController.checkOut(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                error: "Cannot check out. Booking status is: completed. Must be 'active'.",
            });
        });

        // ==========================================
        // BUSINESS LOGIC TESTS
        // ==========================================

        it('should return 400 if database checkOut operation fails', async () => {
            // Arrange
            const req = mockReq();
            const res = mockRes();
            Booking.findById.mockResolvedValue({
                id: 'booking-123',
                driver_id: 'driver-uuid',
                booking_status: 'active',
            });
            Booking.checkOut.mockResolvedValue(null);

            // Act
            await CheckingCheckoutController.checkOut(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'Check-out failed.' });
        });

        it('should return 200 with normal message when checkout is on time (no overtime)', async () => {
            // Arrange
            const req = mockReq();
            const res = mockRes();
            Booking.findById.mockResolvedValue({
                id: 'booking-123',
                driver_id: 'driver-uuid',
                booking_status: 'active',
            });

            const checkedOutBooking = {
                overtime_hours: '0.00', // No overtime
                expected_duration_hours: '2.00',
                actual_duration_hours: '1.50',
                expected_price_xrp: '10.00',
                overtime_price_xrp: '0.00',
                total_price_xrp: '10.00',
                admin_fee_xrp: '1.00',
                seller_amount_xrp: '9.00',
            };
            Booking.checkOut.mockResolvedValue(checkedOutBooking);

            // Act
            await CheckingCheckoutController.checkOut(req, res);

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                message: 'Checked out on time!',
                booking: checkedOutBooking,
                summary: {
                    expectedDuration: 2.0,
                    actualDuration: 1.5,
                    overtimeHours: 0.0,
                    expectedPrice: 10.0,
                    overtimePrice: 0.0,
                    totalPrice: 10.0,
                    adminFee: 1.0,
                    sellerAmount: 9.0,
                },
            });
        });

        it('should return 200 with overtime message when checkout is late (has overtime)', async () => {
            // Arrange
            const req = mockReq();
            const res = mockRes();
            Booking.findById.mockResolvedValue({
                id: 'booking-123',
                driver_id: 'driver-uuid',
                booking_status: 'active',
            });

            const checkedOutBooking = {
                overtime_hours: '1.50', // Driver stayed extra
                expected_duration_hours: '2.00',
                actual_duration_hours: '3.50',
                expected_price_xrp: '10.00',
                overtime_price_xrp: '5.00',
                total_price_xrp: '15.00',
                admin_fee_xrp: '1.50',
                seller_amount_xrp: '13.50',
            };
            Booking.checkOut.mockResolvedValue(checkedOutBooking);

            // Act
            await CheckingCheckoutController.checkOut(req, res);

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                message: 'Checked out. You stayed 1.50 hours extra.',
                booking: checkedOutBooking,
                summary: expect.objectContaining({
                    actualDuration: 3.5,
                    overtimeHours: 1.5,
                    totalPrice: 15.0,
                }),
            });
        });

        // ==========================================
        // ERROR HANDLING TESTS
        // ==========================================

        it('should return 500 and log error when an exception is thrown during checkout', async () => {
            // Arrange
            const req = mockReq();
            const res = mockRes();
            
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            Booking.findById.mockRejectedValue(new Error('Network failure'));

            // Act
            await CheckingCheckoutController.checkOut(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Failed to check out.' });
            expect(errorSpy).toHaveBeenCalledWith('checkOut error:', expect.any(Error));

            // Cleanup
            errorSpy.mockRestore();
        });
    });
});