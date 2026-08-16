// __tests__/controllers/SpotController.test.js

const { mockQuery } = require('../mocks/db.mock');

jest.mock('../../src/models/Spot');
jest.mock('../../src/models/KybSubmission');

const Spot = require('../../src/models/Spot');
const KybSubmission = require('../../src/models/KybSubmission');
const {
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
  unblockSpot,
} = require('../../src/controllers/SpotController');

// ── Helpers ───────────────────────────────────────────
const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  user: { id: 'seller-uuid', role: 'seller' },
  files: [],
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const validSpot = {
  id: 'spot-uuid',
  title: 'Test Parking',
  owner_id: 'seller-uuid',
  is_available: true,
  is_approved: true,
  vehicle_types: ['Car', 'Bike'],
  slots_per_type: [10, 5],
  prices_per_hour: [2.0, 1.5],
};

describe('SpotController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSpot()', () => {
    it('should create a spot successfully', async () => {
      const req = mockReq({
        body: {
          title: 'My Spot',
          description: 'Covered parking',
          address: 'Main Street',
          latitude: '6.9271',
          longitude: '79.8612',
          vehicleTypes: ['Car'],
          slotsPerType: ['2'],
          pricesPerHour: ['5'],
          imageUrls: ['https://img.example/1.jpg'],
        },
      });
      const res = mockRes();

      Spot.create.mockResolvedValue({ id: 'spot-uuid', title: 'My Spot' });

      await createSpot(req, res);

      expect(Spot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'seller-uuid',
          kybSubmissionId: null,
          title: 'My Spot',
          address: 'Main Street',
          latitude: 6.9271,
          longitude: 79.8612,
          vehicleTypes: ['Car'],
          slotsPerType: [2],
          pricesPerHour: [5],
          imageUrls: ['https://img.example/1.jpg'],
          totalSlots: 2,
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Spot created successfully and approved.',
          spot: expect.objectContaining({ id: 'spot-uuid' }),
        })
      );
    });

    it('should return 400 if required fields are missing', async () => {
      const req = mockReq({
        body: {
          title: 'My Spot',
          address: 'Main Street',
          latitude: '6.9271',
        },
      });
      const res = mockRes();

      await createSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Required fields: title, address, latitude, longitude',
        })
      );
    });

    it('should return 400 if latitude or longitude is invalid', async () => {
      const req = mockReq({
        body: {
          title: 'My Spot',
          address: 'Main Street',
          latitude: 'abc',
          longitude: '79.8612',
          vehicleTypes: ['Car'],
          slotsPerType: ['2'],
          pricesPerHour: ['5'],
        },
      });
      const res = mockRes();

      await createSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'latitude and longitude must be numbers',
        })
      );
    });

    it('should return 404 when KYB submission is not found', async () => {
      const req = mockReq({
        body: {
          kybSubmissionId: 'kyb-uuid',
          title: 'My Spot',
          address: 'Main Street',
          latitude: '6.9271',
          longitude: '79.8612',
          vehicleTypes: ['Car'],
          slotsPerType: ['2'],
          pricesPerHour: ['5'],
        },
      });
      const res = mockRes();

      KybSubmission.findById.mockResolvedValue(null);

      await createSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'KYB submission not found.' })
      );
    });

    it('should return 403 when KYB is not approved', async () => {
      const req = mockReq({
        body: {
          kybSubmissionId: 'kyb-uuid',
          title: 'My Spot',
          address: 'Main Street',
          latitude: '6.9271',
          longitude: '79.8612',
          vehicleTypes: ['Car'],
          slotsPerType: ['2'],
          pricesPerHour: ['5'],
        },
      });
      const res = mockRes();

      KybSubmission.findById.mockResolvedValue({
        id: 'kyb-uuid',
        owner_id: 'seller-uuid',
        status: 'pending',
      });

      await createSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'KYB must be approved before creating a spot.',
        })
      );
    });

    it('should return 409 when spot already exists for KYB submission', async () => {
      const req = mockReq({
        body: {
          kybSubmissionId: 'kyb-uuid',
          title: 'My Spot',
          address: 'Main Street',
          latitude: '6.9271',
          longitude: '79.8612',
          vehicleTypes: ['Car'],
          slotsPerType: ['2'],
          pricesPerHour: ['5'],
        },
      });
      const res = mockRes();

      KybSubmission.findById.mockResolvedValue({
        id: 'kyb-uuid',
        owner_id: 'seller-uuid',
        status: 'approved',
        entity_name: 'KYB Title',
        address: 'KYB Address',
      });
      Spot.findByKybSubmissionId.mockResolvedValue({ id: 'existing-spot' });

      await createSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Spot already created for this KYB submission.',
        })
      );
    });

    it('should ignore incomplete rows and create spot from complete rows', async () => {
      const req = mockReq({
        body: {
          title: 'My Spot',
          address: 'Main Street',
          latitude: '6.9271',
          longitude: '79.8612',
          vehicleTypes: ['Car', 'Bike'],
          slotsPerType: ['2', '0'],
          pricesPerHour: ['5', '0'],
        },
      });
      const res = mockRes();

      Spot.create.mockResolvedValue({ id: 'spot-uuid', title: 'My Spot' });

      await createSpot(req, res);

      expect(Spot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicleTypes: ['Car'],
          slotsPerType: [2],
          pricesPerHour: [5],
          totalSlots: 2,
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 400 when no complete rows are provided', async () => {
      const req = mockReq({
        body: {
          title: 'My Spot',
          address: 'Main Street',
          latitude: '6.9271',
          longitude: '79.8612',
          vehicleTypes: ['Car'],
          slotsPerType: ['0'],
          pricesPerHour: ['0'],
        },
      });
      const res = mockRes();

      await createSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Must provide at least one complete row (vehicle type, slot count, hourly rate)',
        })
      );
    });

    it('should return 400 when array lengths differ', async () => {
      const req = mockReq({
        body: {
          title: 'My Spot',
          address: 'Main Street',
          latitude: '6.9271',
          longitude: '79.8612',
          vehicleTypes: ['Car', 'Bike'],
          slotsPerType: ['2'],
          pricesPerHour: ['5', '3'],
        },
      });
      const res = mockRes();

      await createSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'vehicleTypes, slotsPerType, and pricesPerHour must have the same length',
        })
      );
    });
  });

  describe('getSpots()', () => {
    it('should return all spots for admin', async () => {
      const req = mockReq({ user: { id: 'admin-uuid', role: 'admin' } });
      const res = mockRes();

      Spot.findAll.mockResolvedValue([validSpot]);

      await getSpots(req, res);

      expect(Spot.findAll).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ spots: [validSpot], total: 1 });
    });

    it('should return seller spots for seller', async () => {
      const req = mockReq({ user: { id: 'seller-uuid', role: 'seller' } });
      const res = mockRes();

      Spot.findByOwner.mockResolvedValue([validSpot]);

      await getSpots(req, res);

      expect(Spot.findByOwner).toHaveBeenCalledWith('seller-uuid');
      expect(res.json).toHaveBeenCalledWith({ spots: [validSpot], total: 1 });
    });

    it('should return available spots for public users', async () => {
      const req = mockReq({ user: null });
      const res = mockRes();

      Spot.findAvailable.mockResolvedValue([validSpot]);

      await getSpots(req, res);

      expect(Spot.findAvailable).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ spots: [validSpot], total: 1 });
    });
  });

  describe('getSpotById()', () => {
    it('should return a spot by id', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      Spot.findById.mockResolvedValue(validSpot);

      await getSpotById(req, res);

      expect(Spot.findById).toHaveBeenCalledWith('spot-uuid');
      expect(res.json).toHaveBeenCalledWith({ spot: validSpot });
    });

    it('should return 404 if spot not found', async () => {
      const req = mockReq({ params: { id: 'missing-uuid' } });
      const res = mockRes();

      Spot.findById.mockResolvedValue(null);

      await getSpotById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Spot not found.' })
      );
    });
  });

  describe('updateSpot()', () => {
    it('should update a spot successfully', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: {
          title: 'Updated Title',
          description: 'Updated Description',
          address: 'Updated Address',
          latitude: 6.5,
          longitude: 79.5,
          pricesPerHour: [3, 2],
        },
      });
      const res = mockRes();

      Spot.findById.mockResolvedValue(validSpot);
      Spot.update.mockResolvedValue({ id: 'spot-uuid', title: 'Updated Title' });

      await updateSpot(req, res);

      expect(Spot.findById).toHaveBeenCalledWith('spot-uuid');
      expect(Spot.update).toHaveBeenCalledWith(
        'spot-uuid',
        'seller-uuid',
        expect.objectContaining({ pricesPerHour: [3, 2] })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Spot updated.',
          spot: expect.objectContaining({ id: 'spot-uuid' }),
        })
      );
    });

    it('should return 404 when seller does not own spot', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { pricesPerHour: [3, 2] },
      });
      const res = mockRes();

      Spot.findById.mockResolvedValue({ ...validSpot, owner_id: 'other-uuid' });

      await updateSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Spot not found or you do not own this spot.',
        })
      );
    });

    it('should return 400 when vehicleTypes and slotsPerType length do not match', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { vehicleTypes: ['Car', 'Bike'], slotsPerType: [5] },
      });
      const res = mockRes();

      Spot.findById.mockResolvedValue(validSpot);

      await updateSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'vehicleTypes and slotsPerType arrays must be the same length.',
        })
      );
    });
  });

  describe('toggleAvailability()', () => {
    it('should toggle availability successfully', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      Spot.toggleAvailability.mockResolvedValue({
        id: 'spot-uuid',
        is_available: false,
      });

      await toggleAvailability(req, res);

      expect(Spot.toggleAvailability).toHaveBeenCalledWith('spot-uuid', 'seller-uuid');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Spot is now unavailable.',
        })
      );
    });

    it('should return 404 when spot is not found', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      Spot.toggleAvailability.mockResolvedValue(null);

      await toggleAvailability(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Spot not found or you do not own this spot.',
        })
      );
    });
  });

  describe('approveSpot()', () => {
    it('should approve a spot', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' }, user: { id: 'admin-uuid', role: 'admin' } });
      const res = mockRes();

      Spot.approve.mockResolvedValue({ id: 'spot-uuid', title: 'Approved Spot' });

      await approveSpot(req, res);

      expect(Spot.approve).toHaveBeenCalledWith('spot-uuid');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Spot approved successfully.',
          spot: expect.objectContaining({ id: 'spot-uuid' }),
        })
      );
    });

    it('should return 404 when spot not found', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      Spot.approve.mockResolvedValue(null);

      await approveSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Spot not found.' })
      );
    });
  });

  describe('rejectSpot()', () => {
    it('should reject and remove a spot', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' }, user: { id: 'admin-uuid', role: 'admin' } });
      const res = mockRes();

      Spot.reject.mockResolvedValue({ id: 'spot-uuid', title: 'Rejected Spot' });

      await rejectSpot(req, res);

      expect(Spot.reject).toHaveBeenCalledWith('spot-uuid');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Spot rejected and removed.',
          spot: expect.objectContaining({ id: 'spot-uuid' }),
        })
      );
    });

    it('should return 404 when spot not found', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      Spot.reject.mockResolvedValue(null);

      await rejectSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Spot not found.' })
      );
    });
  });

  describe('deleteSpot()', () => {
    it('should delete spot and linked kyb data', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      mockQuery.mockResolvedValueOnce({
        rows: [{ kyb_submission_id: 'kyb-uuid' }],
      });
      Spot.delete.mockResolvedValue({ id: 'spot-uuid' });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await deleteSpot(req, res);

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('SELECT kyb_submission_id FROM spots'),
        ['spot-uuid', 'seller-uuid']
      );
      expect(Spot.delete).toHaveBeenCalledWith('spot-uuid', 'seller-uuid');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Spot and associated KYB data deleted successfully.',
        })
      );
    });

    it('should return 404 when spot is missing', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await deleteSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Spot not found or you do not own this spot.',
        })
      );
    });
  });

  describe('adminToggleSpot()', () => {
    it('should toggle spot status using is_active', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        user: { id: 'admin-uuid', role: 'admin' },
        body: { is_active: false },
      });
      const res = mockRes();

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'spot-uuid', title: 'Test Parking', is_available: false }],
      });

      await adminToggleSpot(req, res);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE spots SET is_available = $1'),
        [false, 'spot-uuid']
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Spot is now Blocked.',
          spot: expect.objectContaining({ is_available: false }),
        })
      );
    });

    it('should return 400 if next availability is not boolean', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { is_active: 'nope' },
      });
      const res = mockRes();

      await adminToggleSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'is_active or is_available must be a boolean.',
        })
      );
    });
  });

  describe('getPendingSpots()', () => {
    it('should return pending spots', async () => {
      const req = mockReq({ user: { id: 'admin-uuid', role: 'admin' } });
      const res = mockRes();

      Spot.findPendingApproval.mockResolvedValue([validSpot]);

      await getPendingSpots(req, res);

      expect(Spot.findPendingApproval).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ spots: [validSpot], total: 1 });
    });

    it('should return 500 on error', async () => {
      const req = mockReq({ user: { id: 'admin-uuid', role: 'admin' } });
      const res = mockRes();

      Spot.findPendingApproval.mockRejectedValue(new Error('DB error'));

      await getPendingSpots(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Failed to fetch pending spots.' })
      );
    });
  });

  describe('getMinSlotsPerType()', () => {
    it('should compute minimum slots per vehicle type using sweep-line', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      mockQuery.mockResolvedValueOnce({
        rows: [
          { vehicle_type: 'Car', start_time: '2026-08-16T10:00:00Z', end_time: '2026-08-16T12:00:00Z' },
          { vehicle_type: 'Car', start_time: '2026-08-16T11:00:00Z', end_time: '2026-08-16T13:00:00Z' },
        ],
      });

      await getMinSlotsPerType(req, res);

      expect(res.json).toHaveBeenCalledWith({
        minSlotsPerType: { car: 2 },
      });
    });

    it('should return 500 on getMinSlotsPerType error', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await getMinSlotsPerType(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to compute min slots.' });
    });
  });

  describe('checkSpotConflicts()', () => {
    it('should return 400 when startDateTime or endDateTime is missing', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' }, body: {} });
      const res = mockRes();

      await checkSpotConflicts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'startDateTime and endDateTime are required.' });
    });

    it('should return 400 when dates are invalid or start >= end', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { startDateTime: '2026-08-16T12:00:00Z', endDateTime: '2026-08-16T10:00:00Z' },
      });
      const res = mockRes();

      await checkSpotConflicts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid start or end time.' });
    });

    it('should check conflicts and return hasConflict true/false', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { startDateTime: '2026-08-16T10:00:00Z', endDateTime: '2026-08-16T12:00:00Z' },
      });
      const res = mockRes();

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'booking-1' }] });

      await checkSpotConflicts(req, res);

      expect(res.json).toHaveBeenCalledWith({ hasConflict: true });
    });

    it('should return 500 on checkSpotConflicts error', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { startDateTime: '2026-08-16T10:00:00Z', endDateTime: '2026-08-16T12:00:00Z' },
      });
      const res = mockRes();

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await checkSpotConflicts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to check conflicts.' });
    });
  });

  describe('blockSpot()', () => {
    it('should return 400 if dates missing', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' }, body: {} });
      const res = mockRes();

      await blockSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if dates are invalid', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { startDateTime: 'invalid', endDateTime: 'invalid' },
      });
      const res = mockRes();

      await blockSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if spot not found or not owned by user', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { startDateTime: '2026-08-16T10:00:00Z', endDateTime: '2026-08-16T12:00:00Z' },
      });
      const res = mockRes();

      Spot.findById.mockResolvedValue(null);

      await blockSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 if spot is already blocked', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { startDateTime: '2026-08-16T10:00:00Z', endDateTime: '2026-08-16T12:00:00Z' },
      });
      const res = mockRes();

      Spot.findById.mockResolvedValue({ ...validSpot, is_blocked_by_seller: true });

      await blockSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Spot is already blocked. Wait for the current block to end.' });
    });

    it('should return 409 if conflict exists with active bookings', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { startDateTime: '2026-08-16T10:00:00Z', endDateTime: '2026-08-16T12:00:00Z' },
      });
      const res = mockRes();

      Spot.findById.mockResolvedValue(validSpot);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'b1' }] });

      await blockSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot block spot due to overlapping active bookings.' });
    });

    it('should successfully block spot and return 200', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { startDateTime: '2026-08-16T10:00:00Z', endDateTime: '2026-08-16T12:00:00Z', reason: 'Renovation' },
      });
      const res = mockRes();

      Spot.findById.mockResolvedValue(validSpot);
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // conflict query
        .mockResolvedValueOnce({ rows: [] }); // update query

      await blockSpot(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Spot blocked successfully' });
    });

    it('should return 500 on blockSpot exception', async () => {
      const req = mockReq({
        params: { id: 'spot-uuid' },
        body: { startDateTime: '2026-08-16T10:00:00Z', endDateTime: '2026-08-16T12:00:00Z' },
      });
      const res = mockRes();

      Spot.findById.mockRejectedValue(new Error('DB error'));

      await blockSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to block spot.' });
    });
  });

  describe('unblockSpot()', () => {
    it('should return 404 if spot not found or not owned', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      Spot.findById.mockResolvedValue(null);

      await unblockSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should unblock spot successfully', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      Spot.findById.mockResolvedValue(validSpot);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await unblockSpot(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Spot unblocked successfully' });
    });

    it('should return 500 on unblockSpot exception', async () => {
      const req = mockReq({ params: { id: 'spot-uuid' } });
      const res = mockRes();

      Spot.findById.mockRejectedValue(new Error('DB error'));

      await unblockSpot(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to unblock spot.' });
    });
  });
});
