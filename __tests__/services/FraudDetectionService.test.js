// __tests__/services/FraudDetectionService.test.js
const { mockQuery } = require('../mocks/db.mock');
const fraudDetectionService = require('../../src/services/FraudDetectionService');

describe('FraudDetectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeBooking()', () => {
    it('analyzes booking with low risk when all checks pass cleanly', async () => {
      // checkCancelledBookings
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // checkBookingFrequency
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      // checkUnusualAmount
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_price: '10.0', max_price: '20.0' }] });
      // checkFailedPayments
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // checkDriverOverlap
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const startTime = new Date('2026-08-16T10:00:00Z');
      const endTime = new Date('2026-08-16T12:00:00Z'); // 2 hours

      const result = await fraudDetectionService.analyzeBooking(
        'driver1',
        'spot1',
        startTime,
        endTime,
        15.0
      );

      expect(result.riskScore).toBe(0);
      expect(result.riskLevel).toBe('low');
      expect(result.warnings).toHaveLength(0);
    });

    it('analyzes booking with high risk and warnings when multiple red flags trigger', async () => {
      // checkCancelledBookings (>= 3 -> 25)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '4' }] });
      // checkBookingFrequency (>= 5 -> 30)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '6' }] });
      // checkUnusualAmount (> 3x avg -> 20)
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_price: '5.0', max_price: '10.0' }] });
      // checkFailedPayments (>= 3 -> 25)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      // checkDriverOverlap (>= 2 -> 25)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const startTime = new Date('2026-08-16T00:00:00Z');
      const endTime = new Date('2026-08-16T15:00:00Z'); // 15 hours -> 20

      const result = await fraudDetectionService.analyzeBooking(
        'driver1',
        'spot1',
        startTime,
        endTime,
        50.0
      );

      expect(result.riskScore).toBe(100); // capped at 100
      expect(result.riskLevel).toBe('high');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('analyzes booking with medium risk score between 31 and 60', async () => {
      // checkCancelledBookings (>= 2 -> 10)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      // checkBookingFrequency (>= 3 -> 15)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      // checkUnusualAmount (normal -> 0)
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_price: '20.0', max_price: '30.0' }] });
      // checkFailedPayments (>= 1 -> 10)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      // checkDriverOverlap (>= 1 -> 10)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const startTime = new Date('2026-08-16T10:00:00Z');
      const endTime = new Date('2026-08-16T19:00:00Z'); // 9 hours -> 10

      const result = await fraudDetectionService.analyzeBooking(
        'driver1',
        'spot1',
        startTime,
        endTime,
        20.0
      );

      expect(result.riskScore).toBe(55);
      expect(result.riskLevel).toBe('medium');
    });
  });

  describe('checkCancelledBookings()', () => {
    it('returns score 10 for 2 cancellations', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      const res = await fraudDetectionService.checkCancelledBookings('d1');
      expect(res.score).toBe(10);
      expect(res.warning).toContain('2 cancelled bookings');
    });

    it('returns score 0 for < 2 cancellations', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const res = await fraudDetectionService.checkCancelledBookings('d1');
      expect(res.score).toBe(0);
      expect(res.warning).toBeNull();
    });
  });

  describe('checkBookingFrequency()', () => {
    it('returns score 15 for 3 bookings in last hour', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      const res = await fraudDetectionService.checkBookingFrequency('d1');
      expect(res.score).toBe(15);
    });

    it('returns score 0 for normal frequency', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      const res = await fraudDetectionService.checkBookingFrequency('d1');
      expect(res.score).toBe(0);
    });
  });

  describe('checkUnusualDuration()', () => {
    it('returns score 10 for duration between 8 and 12 hours', () => {
      const start = '2026-08-16T00:00:00Z';
      const end = '2026-08-16T10:00:00Z'; // 10 hours
      const res = fraudDetectionService.checkUnusualDuration(start, end);
      expect(res.score).toBe(10);
    });

    it('returns score 0 for normal duration', () => {
      const start = '2026-08-16T00:00:00Z';
      const end = '2026-08-16T04:00:00Z'; // 4 hours
      const res = fraudDetectionService.checkUnusualDuration(start, end);
      expect(res.score).toBe(0);
    });
  });

  describe('checkUnusualAmount()', () => {
    it('returns score 0 if spot has no prior booking history', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_price: null, max_price: null }] });
      const res = await fraudDetectionService.checkUnusualAmount(50, 's1');
      expect(res.score).toBe(0);
      expect(res.detail).toBe('First booking at this spot');
    });

    it('returns score 0 if amount is within normal range', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_price: '20.0', max_price: '30.0' }] });
      const res = await fraudDetectionService.checkUnusualAmount(40, 's1');
      expect(res.score).toBe(0);
    });
  });

  describe('checkFailedPayments()', () => {
    it('returns score 10 for 1 or 2 failed payments', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      const res = await fraudDetectionService.checkFailedPayments('d1');
      expect(res.score).toBe(10);
    });

    it('returns score 0 for 0 failed payments', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const res = await fraudDetectionService.checkFailedPayments('d1');
      expect(res.score).toBe(0);
    });
  });

  describe('checkDriverOverlap()', () => {
    it('returns score 10 for 1 overlapping booking', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const res = await fraudDetectionService.checkDriverOverlap('d1', new Date(), new Date());
      expect(res.score).toBe(10);
    });

    it('returns score 0 for 0 overlapping bookings', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const res = await fraudDetectionService.checkDriverOverlap('d1', new Date(), new Date());
      expect(res.score).toBe(0);
    });
  });

  describe('calculateRiskFromPrecomputed()', () => {
    it('returns 0 risk for inactive/completed bookings', () => {
      const res = fraudDetectionService.calculateRiskFromPrecomputed({
        booking_status: 'completed',
      });
      expect(res).toEqual({ riskScore: 0, riskLevel: 'low' });
    });

    it('calculates risk correctly with medium/high boundaries', () => {
      const highBooking = {
        booking_status: 'confirmed',
        cancelled_count: '3', // 25
        frequency_count: '5', // 30
        start_time: '2026-08-16T00:00:00Z',
        end_time: '2026-08-16T15:00:00Z', // 20
        spot_avg_price: '10',
        total_price_xrp: '50', // 20
        failed_payment_count: '3', // 25
        overlap_count: '2', // 25
      };

      const highRes = fraudDetectionService.calculateRiskFromPrecomputed(highBooking);
      expect(highRes.riskScore).toBe(100);
      expect(highRes.riskLevel).toBe('high');

      const mediumBooking = {
        booking_status: 'pending',
        cancelled_count: '2', // 10
        frequency_count: '3', // 15
        start_time: '2026-08-16T00:00:00Z',
        end_time: '2026-08-16T09:00:00Z', // 10
        spot_avg_price: '20',
        total_price_xrp: '25', // 0
        failed_payment_count: '1', // 10
        overlap_count: '0', // 0
      };

      const medRes = fraudDetectionService.calculateRiskFromPrecomputed(mediumBooking);
      expect(medRes.riskScore).toBe(45);
      expect(medRes.riskLevel).toBe('medium');
    });
  });
});
