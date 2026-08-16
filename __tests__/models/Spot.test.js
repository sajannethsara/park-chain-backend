// __tests__/models/Spot.test.js

const { mockQuery } = require('../mocks/db.mock');
const Spot = require('../../src/models/Spot');

describe('Spot Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('should create a spot and return it', async () => {
      const mockSpot = {
        id: 'spot-uuid-123',
        owner_id: 'owner-uuid',
        kyb_submission_id: null,
        title: 'My Spot',
        available_slots: 2,
        total_slots: 2,
        is_approved: true,
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockSpot] });

      const result = await Spot.create({
        ownerId: 'owner-uuid',
        kybSubmissionId: null,
        title: 'My Spot',
        description: 'Covered parking',
        address: 'Main Street',
        latitude: 6.9271,
        longitude: 79.8612,
        vehicleTypes: ['Car'],
        slotsPerType: [2],
        pricesPerHour: [5],
        imageUrls: ['https://img.example/1.jpg'],
        totalSlots: 2,
      });

      expect(result).toEqual(mockSpot);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO spots'),
        expect.arrayContaining([
          'owner-uuid',
          null,
          'My Spot',
          'Covered parking',
          'Main Street',
          6.9271,
          79.8612,
          ['Car'],
          [2],
          [5],
          ['https://img.example/1.jpg'],
          2,
        ])
      );
    });

    it('should use default values when optional arrays are missing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'spot-uuid' }] });

      await Spot.create({
        ownerId: 'owner-uuid',
        title: 'Default Spot',
        description: '',
        address: 'Main Street',
        latitude: 6.9,
        longitude: 79.8,
        imageUrls: [],
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          ['Car'],
          [1],
          [10],
          [],
          1,
        ])
      );
    });
  });

  describe('findByKybSubmissionId()', () => {
    it('should return a spot when found', async () => {
      const mockSpot = { id: 'spot-uuid', kyb_submission_id: 'kyb-uuid' };
      mockQuery.mockResolvedValueOnce({ rows: [mockSpot] });

      const result = await Spot.findByKybSubmissionId('kyb-uuid');

      expect(result).toEqual(mockSpot);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE kyb_submission_id = $1'),
        ['kyb-uuid']
      );
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await Spot.findByKybSubmissionId('missing-uuid');

      expect(result).toBeNull();
    });
  });

  describe('findById()', () => {
    it('should return a spot with owner details', async () => {
      const mockSpot = {
        id: 'spot-uuid',
        owner_name: 'Owner',
        owner_email: 'owner@example.com',
        owner_phone: '0771234567',
        owner_created_at: '2026-04-01T00:00:00.000Z',
        owner_wallet: 'rOwnerWallet123',
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockSpot] });

      const result = await Spot.findById('spot-uuid');

      expect(result).toEqual(mockSpot);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.id = $1'),
        ['spot-uuid']
      );
    });

    it('should return null when spot does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await Spot.findById('missing-uuid');

      expect(result).toBeNull();
    });
  });

  describe('findAvailable()', () => {
    it('should return all available spots', async () => {
      const mockSpots = [
        { id: 'spot-1', title: 'Spot 1' },
        { id: 'spot-2', title: 'Spot 2' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockSpots });

      const result = await Spot.findAvailable();

      expect(result).toEqual(mockSpots);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('s.is_available = true'));
    });
  });

  describe('findByOwner()', () => {
    it('should return all spots for an owner', async () => {
      const mockSpots = [{ id: 'spot-1' }, { id: 'spot-2' }];
      mockQuery.mockResolvedValueOnce({ rows: mockSpots });

      const result = await Spot.findByOwner('owner-uuid');

      expect(result).toEqual(mockSpots);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE owner_id = $1'),
        ['owner-uuid']
      );
    });
  });

  describe('findAll()', () => {
    it('should return all spots ordered by date', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'spot-1' }] });

      const result = await Spot.findAll();

      expect(result).toEqual([{ id: 'spot-1' }]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY s.created_at DESC')
      );
    });
  });

  describe('findPendingApproval()', () => {
    it('should return pending spots', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'spot-1' }] });

      const result = await Spot.findPendingApproval();

      expect(result).toEqual([{ id: 'spot-1' }]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.is_approved = false')
      );
    });
  });

  describe('approve()', () => {
    it('should approve a spot', async () => {
      const mockSpot = { id: 'spot-uuid', is_approved: true };
      mockQuery.mockResolvedValueOnce({ rows: [mockSpot] });

      const result = await Spot.approve('spot-uuid');

      expect(result).toEqual(mockSpot);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET is_approved = true'),
        ['spot-uuid']
      );
    });
  });

  describe('reject()', () => {
    it('should delete and return the rejected spot', async () => {
      const mockSpot = { id: 'spot-uuid', title: 'Rejected Spot' };
      mockQuery.mockResolvedValueOnce({ rows: [mockSpot] });

      const result = await Spot.reject('spot-uuid');

      expect(result).toEqual(mockSpot);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM spots WHERE id = $1 RETURNING *'),
        ['spot-uuid']
      );
    });
  });

  describe('delete()', () => {
    it('should delete a spot by owner', async () => {
      const mockSpot = { id: 'spot-uuid', owner_id: 'owner-uuid' };
      mockQuery.mockResolvedValueOnce({ rows: [mockSpot] });

      const result = await Spot.delete('spot-uuid', 'owner-uuid');

      expect(result).toEqual(mockSpot);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND owner_id = $2'),
        ['spot-uuid', 'owner-uuid']
      );
    });
  });

  describe('toggleAvailability()', () => {
    it('should toggle availability for owner spot', async () => {
      const mockSpot = { id: 'spot-uuid', is_available: false };
      mockQuery.mockResolvedValueOnce({ rows: [mockSpot] });

      const result = await Spot.toggleAvailability('spot-uuid', 'owner-uuid');

      expect(result).toEqual(mockSpot);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET is_available = NOT is_available'),
        ['spot-uuid', 'owner-uuid']
      );
    });
  });

  describe('decrementSlot()', () => {
    it('should decrement the available slot count', async () => {
      const mockSpot = { id: 'spot-uuid', available_slots: 1, is_available: true };
      mockQuery.mockResolvedValueOnce({ rows: [mockSpot] });

      const result = await Spot.decrementSlot('spot-uuid');

      expect(result).toEqual(mockSpot);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('available_slots = available_slots - 1'),
        ['spot-uuid']
      );
    });

    it('should return null when no slots can be decremented', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await Spot.decrementSlot('spot-uuid');

      expect(result).toBeNull();
    });
  });

  describe('incrementSlot()', () => {
    it('should increment the available slot count', async () => {
      const mockSpot = { id: 'spot-uuid', available_slots: 2, is_available: true };
      mockQuery.mockResolvedValueOnce({ rows: [mockSpot] });

      const result = await Spot.incrementSlot('spot-uuid');

      expect(result).toEqual(mockSpot);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('available_slots = LEAST(available_slots + 1, total_slots)'),
        ['spot-uuid']
      );
    });
  });

  describe('update()', () => {
    it('should update spot details', async () => {
      const mockSpot = { id: 'spot-uuid', title: 'Updated Title' };
      mockQuery.mockResolvedValueOnce({ rows: [mockSpot] });

      const result = await Spot.update('spot-uuid', 'owner-uuid', {
        title: 'Updated Title',
        description: 'Updated Description',
        address: 'Updated Address',
        latitude: 6.9,
        longitude: 79.8,
        pricesPerHour: [7],
        imageUrls: ['https://img.example/new.jpg'],
      });

      expect(result).toEqual(mockSpot);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $12 AND owner_id = $13'),
        [
          'Updated Title',
          'Updated Description',
          'Updated Address',
          6.9,
          79.8,
          null,
          null,
          [7],
          null,
          null,
          ['https://img.example/new.jpg'],
          'spot-uuid',
          'owner-uuid',
        ]
      );
    });
  });

  describe('getPriceForVehicle()', () => {
    it('should return price for supported vehicle type', async () => {
      const price = Spot.getPriceForVehicle(
        {
          vehicle_types: ['Car', 'Bike'],
          prices_per_hour: [10, 5],
        },
        'Bike'
      );

      expect(price).toBe(5);
    });

    it('should return null for unsupported vehicle type', async () => {
      const price = Spot.getPriceForVehicle(
        {
          vehicle_types: ['Car'],
          prices_per_hour: [10],
        },
        'Truck'
      );

      expect(price).toBeNull();
    });

    it('should use default price data when arrays are missing', async () => {
      const price = Spot.getPriceForVehicle({}, 'Car');

      expect(price).toBe(10);
    });
  });
});
