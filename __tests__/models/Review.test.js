// __tests__/models/Review.test.js
const { mockQuery } = require('../mocks/db.mock');
const Review = require('../../src/models/Review');

describe('Review Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('should create and return a review', async () => {
      const mockReview = { id: 1, booking_id: 'b1', rating: 5, comment: 'Great spot' };
      mockQuery.mockResolvedValueOnce({ rows: [mockReview] });

      const result = await Review.create({
        bookingId: 'b1',
        driverId: 'd1',
        spotId: 's1',
        rating: 5,
        comment: 'Great spot',
      });

      expect(result).toEqual(mockReview);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reviews'),
        ['b1', 'd1', 's1', 5, 'Great spot']
      );
    });
  });

  describe('findById()', () => {
    it('should return review by ID', async () => {
      const mockReview = { id: 1, spot_title: 'Central Park' };
      mockQuery.mockResolvedValueOnce({ rows: [mockReview] });

      const result = await Review.findById(1);

      expect(result).toEqual(mockReview);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE r.id = $1'), [1]);
    });

    it('should return null when review not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await Review.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('should return all reviews with defaults', async () => {
      const mockRows = [{ id: 1 }, { id: 2 }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await Review.findAll({});

      expect(result).toEqual(mockRows);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        [20, 0]
      );
    });

    it('should return reviews with custom pagination and ordering', async () => {
      const mockRows = [{ id: 1 }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await Review.findAll({ limit: 10, offset: 5, orderBy: 'rating ASC' });

      expect(result).toEqual(mockRows);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY rating ASC'),
        [10, 5]
      );
    });
  });

  describe('countAll()', () => {
    it('should return total count of reviews', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '42' }] });

      const result = await Review.countAll();

      expect(result).toBe(42);
    });
  });

  describe('findBySpot() and countBySpot()', () => {
    it('should return reviews for a spot', async () => {
      const mockRows = [{ id: 1, spot_id: 's1' }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await Review.findBySpot('s1', { limit: 10, offset: 0 });

      expect(result).toEqual(mockRows);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE r.spot_id = $1'),
        ['s1', 10, 0]
      );
    });

    it('should return count for a spot', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }] });

      const result = await Review.countBySpot('s1');

      expect(result).toBe(7);
    });
  });

  describe('getAverageRatingBySpot()', () => {
    it('should return average rating for a spot', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ average_rating: '4.75' }] });

      const result = await Review.getAverageRatingBySpot('s1');

      expect(result).toBe(4.75);
    });

    it('should return 0 when average is null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ average_rating: null }] });

      const result = await Review.getAverageRatingBySpot('s1');

      expect(result).toBe(0);
    });
  });

  describe('findByDriver() and countByDriver()', () => {
    it('should return reviews by driver', async () => {
      const mockRows = [{ id: 1, driver_id: 'd1' }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await Review.findByDriver('d1', { limit: 5, offset: 0 });

      expect(result).toEqual(mockRows);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE r.driver_id = $1'),
        ['d1', 5, 0]
      );
    });

    it('should return count by driver', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const result = await Review.countByDriver('d1');

      expect(result).toBe(3);
    });
  });

  describe('findByOwner() and countByOwner()', () => {
    it('should return reviews by owner', async () => {
      const mockRows = [{ id: 1 }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await Review.findByOwner('o1', { limit: 10, offset: 0 });

      expect(result).toEqual(mockRows);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.owner_id = $1'),
        ['o1', 10, 0]
      );
    });

    it('should return count by owner', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '12' }] });

      const result = await Review.countByOwner('o1');

      expect(result).toBe(12);
    });
  });

  describe('update()', () => {
    it('should update review and return updated row', async () => {
      const mockUpdated = { id: 1, rating: 4, comment: 'Updated' };
      mockQuery.mockResolvedValueOnce({ rows: [mockUpdated] });

      const result = await Review.update(1, { rating: 4, comment: 'Updated' });

      expect(result).toEqual(mockUpdated);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE reviews'),
        [1, 4, 'Updated']
      );
    });

    it('should return null if not found on update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await Review.update(999, { rating: 4, comment: 'Updated' });

      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('should return true when row was deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] });

      const result = await Review.delete(1);

      expect(result).toBe(true);
    });

    it('should return false when no row was deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const result = await Review.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('findByBooking()', () => {
    it('should find review by booking ID', async () => {
      const mockRow = { id: 1, booking_id: 'b1' };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await Review.findByBooking('b1');

      expect(result).toEqual(mockRow);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE booking_id = $1'),
        ['b1']
      );
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await Review.findByBooking('b999');

      expect(result).toBeNull();
    });
  });
});
